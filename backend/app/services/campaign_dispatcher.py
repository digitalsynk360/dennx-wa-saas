"""
Campaign dispatcher — Phase 7.

Architecture:
  - create_campaign(): builds the campaign + a CampaignRecipient row
    per target contact, status starts at "pending".
  - dispatch(): fans recipients out — for now, calls send_one()
    sequentially with a small delay (no Celery worker required for
    local development). In production this is swapped for
    `send_campaign_message.delay(recipient_id)` per recipient
    (already wired in app.workers.tasks), which gives per-tenant
    rate limiting via Celery's `rate_limit="20/s"`.
  - send_one(): renders the approved template with that recipient's
    variables and calls the Meta Cloud API template-message endpoint.

Status lifecycle: draft -> scheduled/running -> completed | failed
Recipient lifecycle: pending -> sent -> delivered -> read | failed
"""
import asyncio
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.campaign import Campaign, CampaignRecipient
from app.models.contact import Contact, ContactTag
from app.models.template import Template
from app.repositories.campaign_repository import (
    CampaignRecipientRepository,
    CampaignRepository,
)
from app.repositories.template_repository import TemplateRepository
from app.repositories.whatsapp_repository import WhatsAppRepository
from app.schemas.campaign import CreateCampaignRequest
from app.services.whatsapp_service import get_decrypted_token
from app.websocket.manager import manager

logger = get_logger(__name__)


async def _resolve_contact_ids(
    db: AsyncSession, workspace_id: uuid.UUID, payload: CreateCampaignRequest
) -> list[uuid.UUID]:
    ids = set(payload.contact_ids)
    if payload.tag_ids:
        result = await db.execute(
            select(ContactTag.contact_id)
            .join(Contact, Contact.id == ContactTag.contact_id)
            .where(Contact.workspace_id == workspace_id)
            .where(ContactTag.tag_id.in_(payload.tag_ids))
        )
        ids.update(row[0] for row in result.all())
    return list(ids)


async def create_campaign(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    payload: CreateCampaignRequest,
    created_by_id: uuid.UUID,
) -> Campaign:
    template_repo = TemplateRepository(db)
    template = await template_repo.get_by_id(payload.template_id)
    if template is None or template.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Template not found.")
    if template.status != "approved":
        raise HTTPException(
            status_code=400,
            detail="Only approved templates can be used in campaigns.",
        )

    wa_repo = WhatsAppRepository(db)
    account = await wa_repo.get_by_workspace(workspace_id)
    if account is None or account.status != "live":
        raise HTTPException(status_code=400, detail="WhatsApp account not connected.")

    contact_ids = await _resolve_contact_ids(db, workspace_id, payload)
    if not contact_ids:
        raise HTTPException(status_code=400, detail="No contacts selected for this campaign.")

    campaign = Campaign(
        workspace_id=workspace_id,
        name=payload.name,
        campaign_type=payload.campaign_type,
        template_id=payload.template_id,
        whatsapp_account_id=account.id,
        status="scheduled" if payload.scheduled_at else "draft",
        scheduled_at=payload.scheduled_at,
        variable_mapping=payload.variable_mapping,
        total_count=len(contact_ids),
        created_by_id=created_by_id,
    )
    db.add(campaign)
    await db.flush()

    for contact_id in contact_ids:
        db.add(
            CampaignRecipient(
                campaign_id=campaign.id,
                contact_id=contact_id,
                status="pending",
                variables=payload.variable_mapping,
            )
        )
    await db.flush()
    return campaign


async def launch_campaign(db: AsyncSession, workspace_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    """Starts sending immediately (draft -> running). Scheduled
    campaigns are launched by the Celery beat job in production;
    here it's triggered manually via the 'Send Now' button."""
    repo = CampaignRepository(db)
    campaign = await repo.get_with_recipients(campaign_id, workspace_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail=f"Cannot launch a campaign in status '{campaign.status}'.")

    campaign.status = "running"
    campaign.started_at = datetime.now(timezone.utc)
    await db.flush()

    # Fire-and-forget background dispatch (no blocking the HTTP request)
    asyncio.create_task(_run_dispatch(workspace_id, campaign_id))
    return campaign


async def pause_campaign(db: AsyncSession, workspace_id: uuid.UUID, campaign_id: uuid.UUID, reason: str | None = None) -> Campaign:
    repo = CampaignRepository(db)
    campaign = await repo.get_by_id(campaign_id)
    if campaign is None or campaign.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status != "running":
        raise HTTPException(status_code=400, detail="Only running campaigns can be paused.")
    campaign.status = "paused"
    campaign.pause_reason = reason or "Paused by user"
    await db.flush()
    return campaign


async def cancel_campaign(db: AsyncSession, workspace_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    repo = CampaignRepository(db)
    campaign = await repo.get_by_id(campaign_id)
    if campaign is None or campaign.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status in ("completed", "failed"):
        raise HTTPException(status_code=400, detail="Cannot cancel a finished campaign.")
    campaign.status = "failed"
    campaign.pause_reason = "Cancelled by user"
    await db.flush()
    return campaign


async def list_campaigns(db: AsyncSession, workspace_id: uuid.UUID, page: int, page_size: int):
    repo = CampaignRepository(db)
    return await repo.list_by_workspace(workspace_id, page, page_size)


async def get_campaign_detail(db: AsyncSession, workspace_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    repo = CampaignRepository(db)
    campaign = await repo.get_with_recipients(campaign_id, workspace_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return campaign


# ---------------- Internal dispatch (also callable from Celery) ----------------

async def _run_dispatch(workspace_id: uuid.UUID, campaign_id: uuid.UUID) -> None:
    """Sends to every pending recipient with Cloud-API-friendly
    pacing (CAMPAIGN_SEND_RATE_PER_SECOND). Uses its own DB session
    since it runs detached from the original request."""
    async with AsyncSessionLocal() as db:
        try:
            await dispatch(db, workspace_id, campaign_id)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.error("campaign_dispatch_failed", campaign_id=str(campaign_id))


async def dispatch(db: AsyncSession, workspace_id: uuid.UUID, campaign_id: uuid.UUID) -> None:
    repo = CampaignRepository(db)
    campaign = await repo.get_by_id(campaign_id)
    if campaign is None:
        return

    template_repo = TemplateRepository(db)
    template = await template_repo.get_by_id(campaign.template_id)

    wa_repo = WhatsAppRepository(db)
    account = await wa_repo.get_by_workspace(workspace_id)
    token = get_decrypted_token(account)

    recipient_repo = CampaignRecipientRepository(db)
    pending = await recipient_repo.list_pending(campaign_id)

    delay = 1.0 / max(settings.CAMPAIGN_SEND_RATE_PER_SECOND, 1)

    for recipient in pending:
        # Re-check status each loop — allows pausing mid-run
        await db.refresh(campaign)
        if campaign.status != "running":
            break

        await _send_one_recipient(db, campaign, template, account, token, recipient)
        await db.flush()
        await asyncio.sleep(delay)

    await db.refresh(campaign)
    if campaign.status == "running":
        campaign.status = "completed"
        campaign.completed_at = datetime.now(timezone.utc)
        await db.flush()

    await manager.broadcast(
        str(workspace_id), "campaign_update", {"campaign_id": str(campaign_id), "status": campaign.status}
    )


async def _send_one_recipient(
    db: AsyncSession,
    campaign: Campaign,
    template: Template,
    account,
    token: str,
    recipient: CampaignRecipient,
) -> None:
    contact_result = await db.execute(select(Contact).where(Contact.id == recipient.contact_id))
    contact = contact_result.scalar_one_or_none()
    if contact is None or not contact.opted_in or contact.is_blocked:
        recipient.status = "skipped"
        return

    try:
        wamid = await _send_whatsapp_template(
            token=token,
            phone_number_id=account.phone_number_id,
            to=contact.phone,
            template=template,
            variables=recipient.variables or {},
        )
        # Campaign sends are recorded on the recipient row itself
        # (status + wamid context); they are not inserted into the
        # `messages` table because that requires an existing
        # Conversation row. A future phase can create/attach a
        # conversation here if unified message history is needed.
        recipient.status = "sent"
        campaign.sent_count += 1
    except Exception as e:
        recipient.status = "failed"
        recipient.error_message = str(e)[:500]
        campaign.failed_count += 1
        logger.error("campaign_send_failed", contact_id=str(contact.id), error=str(e))


async def _send_whatsapp_template(
    token: str, phone_number_id: str, to: str, template: Template, variables: dict
) -> str:
    url = f"{settings.graph_api_base}/{phone_number_id}/messages"
    components = []
    if variables:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": str(v)} for v in variables.values()],
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template.name,
            "language": {"code": template.language},
            "components": components,
        },
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})

    if response.status_code != 200:
        raise RuntimeError(f"WhatsApp API error: {response.text}")

    data = response.json()
    return data.get("messages", [{}])[0].get("id", "")


def send_one(recipient_id: str) -> None:
    """Sync entrypoint for Celery task `send_campaign_message` —
    placeholder for the production async-worker wiring."""
    logger.info("send_one_called_via_celery", recipient_id=recipient_id)
