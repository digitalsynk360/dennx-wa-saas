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
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, select
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
from app.services import whatsapp_service
from app.services.whatsapp_service import get_decrypted_token
from app.websocket.manager import manager

logger = get_logger(__name__)


class WhatsAppSendError(Exception):
    """Carries Meta's parsed error code so callers can react
    differently per failure type (e.g. 131049 = retry later,
    132012 = permanent template mismatch, no point retrying)."""
    def __init__(self, code: int | None, message: str, raw: str):
        self.code = code
        self.message = message
        self.raw = raw
        super().__init__(message)


async def _sent_in_last_24h(db: AsyncSession, workspace_id: uuid.UUID) -> int:
    """Real rolling 24h outbound-message count for this workspace's
    WhatsApp account — used instead of a fixed per-invocation cap so
    the budget stays correct no matter how many times a day the
    Celery Beat continuation task fires."""
    from app.models.messaging import Message

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(func.count(Message.id)).where(
            Message.workspace_id == workspace_id,
            Message.direction == "outbound",
            Message.created_at >= since,
        )
    )
    return result.scalar() or 0


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
    """Starts sending immediately (draft -> running), or resumes a
    campaign that auto-paused (failure-rate guardrail) or auto-queued
    (hit its daily safe-send cap) — both need the same "Resume" action
    from the user, no separate endpoint."""
    repo = CampaignRepository(db)
    campaign = await repo.get_with_recipients(campaign_id, workspace_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status not in ("draft", "scheduled", "paused", "queued"):
        raise HTTPException(status_code=400, detail=f"Cannot launch a campaign in status '{campaign.status}'.")

    campaign.status = "running"
    campaign.pause_reason = None
    if campaign.started_at is None:
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
    (CAMPAIGN_SEND_RATE_PER_SECOND), plus three account-safety
    guardrails Meta's 2026 guidelines call for:

      1. Daily volume cap — stays under 80% of the account's real
         messaging-tier ceiling (measured via actual rolling-24h sent
         count, not a per-invocation guess, so it stays correct no
         matter how often the continuation task re-triggers this).
         If the budget runs out mid-campaign, remaining recipients are
         queued and finish automatically once budget frees up.
      2. Failure-spike auto-pause — if the failure rate crosses 30%
         after a reasonable sample size, the campaign pauses itself
         rather than continuing to hammer a cooling quality rating.
      3. 131049-aware — see _send_one_recipient; frequency-capped
         sends get rescheduled instead of counted as hard failures.

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
        await whatsapp_service.refresh_account_health(db, account)
        token = get_decrypted_token(account)
        recipient_repo = CampaignRecipientRepository(db)
        pending_ids = [r.id for r in await recipient_repo.list_pending(campaign_id)]

        already_sent_24h = await _sent_in_last_24h(db, workspace_id)
        tier_limit = whatsapp_service.TIER_LIMITS.get(
            account.messaging_limit_tier or "", whatsapp_service.DEFAULT_TIER_LIMIT
        )
        safe_limit = int(tier_limit * 0.8)
        budget = max(safe_limit - already_sent_24h, 0)
        await db.commit()

    if budget <= 0:
        async with AsyncSessionLocal() as db:
            repo = CampaignRepository(db)
            campaign = await repo.get_by_id(campaign_id)
            if campaign is not None:
                campaign.status = "queued"
                campaign.pause_reason = (
                    f"Daily safe-send limit already used ({already_sent_24h}/{safe_limit} in the last 24h) "
                    "across your WhatsApp account — this campaign will continue automatically once budget frees up."
                )
                await db.commit()
            await manager.broadcast(
                str(workspace_id), "campaign_update",
                {"campaign_id": str(campaign_id), "status": "queued"},
            )
        return

    processed = 0
    sent_this_run = 0
    failed_this_run = 0

    try:
        for recipient_id in pending_ids:
            if sent_this_run >= budget:
                async with AsyncSessionLocal() as db:
                    repo = CampaignRepository(db)
                    campaign = await repo.get_by_id(campaign_id)
                    if campaign is not None and campaign.status == "running":
                        campaign.status = "queued"
                        campaign.pause_reason = (
                            f"Daily safe-send limit reached ({sent_this_run}/{budget} this cycle) — "
                            "remaining recipients will continue automatically within 24h to protect your Quality Rating."
                        )
                        await db.commit()
                    await manager.broadcast(
                        str(workspace_id), "campaign_update",
                        {"campaign_id": str(campaign_id), "status": "queued"},
                    )
                return

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
                if recipient.status == "sent":
                    sent_this_run += 1
                if recipient.status == "failed":
                    failed_this_run += 1
                processed += 1

                # Auto-pause guardrail: once there's a meaningful
                # sample, a runaway failure rate means something is
                # wrong (bad list, quality drop, wrong template) —
                # stop before it does more damage to the account's
                # standing rather than burning through the whole list.
                if processed >= 20 and (failed_this_run / processed) > 0.30:
                    campaign.status = "paused"
                    campaign.pause_reason = (
                        f"Auto-paused: failure rate hit {failed_this_run}/{processed} "
                        "({:.0f}%) — check Quality Rating and audience opt-in before resuming."
                    ).format(failed_this_run / processed * 100)
                    await db.commit()
                    await manager.broadcast(
                        str(workspace_id), "campaign_update",
                        {"campaign_id": str(campaign_id), "status": "paused"},
                    )
                    return

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

    except WhatsAppSendError as e:
        # Error 131049 = Meta's per-user marketing frequency cap — this
        # is NOT a permanent failure or an account problem. Meta's own
        # guidance is to wait 24h+ before retrying, since the cap can
        # clear at any point after that. Auto-reschedule instead of
        # giving up, capped at 2 attempts so a genuinely unreachable
        # contact doesn't retry forever.
        if e.code == 131049 and recipient.retry_count < 2:
            recipient.retry_count += 1
            recipient.status = "retry_scheduled"
            recipient.error_message = (
                f"Meta frequency cap (131049) — auto-retry #{recipient.retry_count}/2 scheduled in ~25h"
            )[:500]
            try:
                from app.workers.tasks import retry_failed_recipient
                retry_failed_recipient.apply_async(
                    args=[str(campaign.workspace_id), str(campaign.id), str(recipient.id)],
                    countdown=90000,  # ~25h — comfortably past Meta's minimum 24h guidance
                    queue="campaigns",
                )
            except Exception as sched_err:
                logger.error("retry_schedule_failed", error=str(sched_err))
                # Celery unreachable — fall back to a normal failure
                # rather than silently losing the recipient.
                recipient.status = "failed"
                campaign.failed_count += 1
        else:
            recipient.status = "failed"
            recipient.error_message = f"[{e.code}] {e.message}"[:500]
            campaign.failed_count += 1
            logger.error("campaign_send_failed", contact_id=str(contact.id), code=e.code, error=e.message)

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
        code = None
        message = response.text
        try:
            err = response.json().get("error", {})
            code = err.get("code")
            message = err.get("message") or message
        except Exception:
            pass
        raise WhatsAppSendError(code, message, response.text)

    data = response.json()
    return data.get("messages", [{}])[0].get("id", "")


def send_one(recipient_id: str) -> None:
    """Sync entrypoint for Celery task `send_campaign_message` —
    placeholder for the production async-worker wiring."""
    logger.info("send_one_called_via_celery", recipient_id=recipient_id)