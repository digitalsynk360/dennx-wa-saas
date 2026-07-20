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

    # Prefer Celery — dispatch runs in a separate worker process, so
    # a large campaign never competes with the API for CPU/DB-pool
    # time, and survives an API redeploy mid-send. If the broker is
    # unreachable (e.g. Redis hiccup) we fall back to the old
    # in-process behavior rather than leaving the campaign stuck in
    # "running" with nothing actually sending.
    try:
        from app.workers.tasks import dispatch_campaign
        dispatch_campaign.apply_async(args=[str(workspace_id), str(campaign_id)], queue="campaigns")
        logger.info("campaign_dispatch_queued", campaign_id=str(campaign_id))
    except Exception as e:
        logger.warning("celery_unavailable_falling_back", error=str(e))
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
    """Sends to every pending recipient with Cloud-API-friendly pacing
    (CAMPAIGN_SEND_RATE_PER_SECOND).

    IMPORTANT: unlike a naive implementation, this does NOT hold one
    DB connection for the campaign's entire run (which can be hours
    for large recipient lists). A campaign monopolizing a pool
    connection for that long starves every *other* request on the
    server — including completely unrelated users just loading their
    Contacts page. Each iteration below opens a short-lived session,
    does its work, and immediately returns the connection to the pool
    before sleeping for the pacing delay.
    """
    delay = 1.0 / max(settings.CAMPAIGN_SEND_RATE_PER_SECOND, 1)

    # Load campaign-level info once (template, account, token, recipient ids)
    async with AsyncSessionLocal() as db:
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
        pending_ids = [r.id for r in await recipient_repo.list_pending(campaign_id)]

    try:
        for recipient_id in pending_ids:
            # Fresh, short-lived connection per recipient — held only
            # for the few ms it takes to send + write the result, then
            # released back to the pool immediately.
            async with AsyncSessionLocal() as db:
                repo = CampaignRepository(db)
                campaign = await repo.get_by_id(campaign_id)
                if campaign is None or campaign.status != "running":
                    break  # deleted, or paused/cancelled by the user mid-run

                recipient_repo = CampaignRecipientRepository(db)
                recipient = await recipient_repo.get_by_id(recipient_id)
                if recipient is None or recipient.status != "pending":
                    continue

                await _send_one_recipient(db, campaign, template, account, token, recipient)
                await db.commit()

            await asyncio.sleep(delay)

        async with AsyncSessionLocal() as db:
            repo = CampaignRepository(db)
            campaign = await repo.get_by_id(campaign_id)
            if campaign is not None and campaign.status == "running":
                campaign.status = "completed"
                campaign.completed_at = datetime.now(timezone.utc)
                await db.commit()

            await manager.broadcast(
                str(workspace_id), "campaign_update",
                {"campaign_id": str(campaign_id), "status": campaign.status if campaign else "completed"},
            )
    except Exception:
        logger.error("campaign_dispatch_failed", campaign_id=str(campaign_id))


async def dispatch(db: AsyncSession, workspace_id: uuid.UUID, campaign_id: uuid.UUID) -> None:
    """Kept for callers that want the old single-session behavior
    (e.g. tests) — production launches now go through _run_dispatch."""
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
        recipient.status = "sent"
        vars_copy = dict(recipient.variables or {})
        vars_copy["_wamid"] = wamid
        recipient.variables = vars_copy

        # Mirror the send into Conversation + Message so it shows up
        # in the Inbox (get-or-create conversation, same pattern as
        # inbound webhook handling).
        try:
            await _record_campaign_message(db, campaign, account, contact, template, wamid, vars_copy)
        except Exception as e:
            logger.error("campaign_message_mirror_failed", error=str(e))
        campaign.sent_count += 1
    except Exception as e:
        recipient.status = "failed"
        recipient.error_message = str(e)[:500]
        campaign.failed_count += 1
        logger.error("campaign_send_failed", contact_id=str(contact.id), error=str(e))


def _render_template_preview(template, variables: dict) -> str:
    """Best-effort human-readable text of what was actually sent,
    for the Inbox message bubble (Meta doesn't echo the rendered body)."""
    text = template.body_text or template.name
    for i in range(1, 10):
        key = str(i)
        if key in variables:
            text = text.replace("{{" + key + "}}", str(variables[key]))
    return text


async def _record_campaign_message(
    db: AsyncSession, campaign, account, contact: Contact, template, wamid: str, variables: dict,
) -> None:
    """Get-or-create the contact's conversation and insert an outbound
    Message row, so campaign sends appear in Inbox like any other chat."""
    from app.models.conversation import Conversation
    from app.models.messaging import Message
    from app.repositories.conversation_repository import ConversationRepository
    from app.websocket.manager import manager

    conv_repo = ConversationRepository(db)
    conv = await conv_repo.get_by_contact(contact.id, campaign.workspace_id)
    if conv is None:
        conv = Conversation(
            workspace_id=campaign.workspace_id,
            contact_id=contact.id,
            whatsapp_account_id=account.id,
            status="open",
            handling="bot",
        )
        db.add(conv)
        await db.flush()

    preview = _render_template_preview(template, variables)
    now = datetime.now(timezone.utc)

    msg = Message(
        workspace_id=campaign.workspace_id,
        conversation_id=conv.id,
        contact_id=contact.id,
        wamid=wamid,
        direction="outbound",
        message_type="template",
        content=preview,
        status="sent",
        sent_by_id=None,
    )
    db.add(msg)

    conv.last_message_at = now
    conv.last_message_preview = preview[:255]
    await db.flush()

    await manager.broadcast(
        str(campaign.workspace_id),
        "new_message",
        {"conversation_id": str(conv.id), "message_id": str(msg.id), "direction": "outbound", "campaign": True},
    )


async def _send_whatsapp_template(
    token: str, phone_number_id: str, to: str, template: Template, variables: dict
) -> str:
    url = f"{settings.graph_api_base}/{phone_number_id}/messages"
    components = []

    # A template APPROVED with an IMAGE/VIDEO/DOCUMENT header REQUIRES
    # a matching header parameter on every single send — Meta rejects
    # the message with "Format mismatch, expected IMAGE, received
    # UNKNOWN" if this component is missing, even though the header
    # has no {{variables}} of its own. header_media_id is the
    # persistent Meta Media API id captured when the file was
    # uploaded in the template editor (see template_service.upload_header_media).
    if template.header_type in ("image", "video", "document"):
        if not template.header_media_id:
            raise RuntimeError(
                f"This template's {template.header_type} header has no media on file — "
                "delete it and recreate with the sample file uploaded (older templates "
                "created before media-header support won't have this)."
            )
        components.append({
            "type": "header",
            "parameters": [{
                "type": template.header_type,
                template.header_type: {"id": template.header_media_id},
            }],
        })

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