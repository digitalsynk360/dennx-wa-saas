"""
Meta WhatsApp webhook processor.

Trigger priority (strict — only ONE fires per message):
  1. Active FlowSession  → resume flow
  2. Flow keyword_trigger match → start flow
  3. ChatbotRule match → rule reply / rule-linked flow
  4. No match → ignore silently

Interactive messages (button click, list select) are parsed into
plain text so they pass through the same flow resume logic.
"""
import hashlib
import hmac
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.contact import Contact
from app.repositories.contact_repository import ContactRepository
from app.repositories.whatsapp_repository import WhatsAppRepository

logger = get_logger(__name__)


def verify_webhook_signature(request_body: bytes, signature_header: str) -> bool:
    if not settings.META_APP_SECRET:
        return True
    expected = "sha256=" + hmac.new(
        settings.META_APP_SECRET.encode(), request_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header or "")


async def handle_inbound(db: AsyncSession, payload: dict[str, Any]) -> None:
    from app.services.conversation_service import create_inbound_message

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value           = change.get("value", {})
            phone_number_id = value.get("metadata", {}).get("phone_number_id")
            if not phone_number_id:
                continue

            wa_repo = WhatsAppRepository(db)
            account = await wa_repo.get_by_phone_number_id(phone_number_id)
            if account is None:
                logger.warning("webhook_unknown_pid", pid=phone_number_id)
                continue

            workspace_id = account.workspace_id
            contact_repo = ContactRepository(db)

            for msg in value.get("messages", []):
                wamid      = msg.get("id", "")
                from_phone = msg.get("from", "")
                msg_type   = msg.get("type", "text")

                # Upsert contact
                contact = await contact_repo.get_by_phone(workspace_id, from_phone)
                if contact is None:
                    contact_name = (
                        value.get("contacts", [{}])[0]
                        .get("profile", {}).get("name")
                    )
                    contact = Contact(
                        workspace_id=workspace_id,
                        phone=from_phone,
                        name=contact_name,
                        source="inbound",
                    )
                    db.add(contact)
                    await db.flush()

                # Parse message content
                content   = ""
                media_url = None

                if msg_type == "text":
                    content = msg.get("text", {}).get("body", "")

                elif msg_type == "interactive":
                    interactive = msg.get("interactive", {})
                    int_type    = interactive.get("type", "")
                    if int_type == "button_reply":
                        content  = interactive.get("button_reply", {}).get("title", "")
                        msg_type = "text"
                        logger.info("interactive_button_reply",
                            content=content, from_phone=from_phone)
                    elif int_type == "list_reply":
                        content  = interactive.get("list_reply", {}).get("title", "")
                        msg_type = "text"
                        logger.info("interactive_list_reply",
                            content=content, from_phone=from_phone)

                elif msg_type in ("image", "audio", "video", "document"):
                    media     = msg.get(msg_type, {})
                    media_url = media.get("link") or media.get("id", "")
                    content   = media.get("caption", "")

                # Save inbound message
                conv, _ = await create_inbound_message(
                    db=db,
                    workspace_id=workspace_id,
                    contact=contact,
                    wamid=wamid,
                    content=content,
                    message_type=msg_type,
                    media_url=media_url,
                )

                # Bot trigger — only in bot mode
                if msg_type == "text" and content and conv.handling == "bot":
                    await _trigger_bot_response(
                        db, workspace_id, contact, content, account, conv.id
                    )

            # Status updates
            for status_update in value.get("statuses", []):
                await _handle_status_update(db, workspace_id, status_update)


async def _trigger_bot_response(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    contact: Contact,
    message_text: str,
    account,
    conversation_id: uuid.UUID,
) -> None:
    """Strict priority — only ONE branch fires then returns."""
    from app.repositories.chatbot_repository import (
        ChatbotFlowRepository,
        FlowSessionRepository,
    )
    from app.services import chatbot_service, flow_engine
    from app.services.whatsapp_service import get_decrypted_token

    try:
        token = get_decrypted_token(account)
    except HTTPException:
        logger.warning("no_wa_token", workspace=str(workspace_id))
        return

    # ✅ Pass db context so flow_engine can save interactive messages to DB
    ctx = {
        "token": token,
        "phone_number_id": account.phone_number_id,
        "to": contact.phone,
        "db": db,
        "workspace_id": workspace_id,
        "conversation_id": conversation_id,
        "contact_id": contact.id,
    }

    # PRIORITY 1: Active FlowSession → resume
    session_repo   = FlowSessionRepository(db)
    active_session = await session_repo.get_active(workspace_id, contact.id)

    if active_session is not None:
        flow_repo = ChatbotFlowRepository(db)
        flow      = await flow_repo.get_by_id(active_session.flow_id)
        if flow is not None:
            messages = await flow_engine.resume_flow_session(
                db=db,
                workspace_id=workspace_id,
                flow=flow,
                session=active_session,
                contact=contact,
                user_reply=message_text,
                ctx=ctx,
            )
            logger.info("flow_resumed",
                flow_id=str(flow.id), messages=len(messages))
            await _save_and_broadcast(
                db, workspace_id, contact, conversation_id, messages, ctx
            )
            return

    # PRIORITY 2: Flow keyword_trigger match
    matched_flow = await chatbot_service.match_flow_trigger(
        db, workspace_id, message_text
    )
    if matched_flow is not None:
        messages = await flow_engine.start_flow_session(
            db=db,
            workspace_id=workspace_id,
            flow=matched_flow,
            contact=contact,
            trigger_data={"message": message_text},
            ctx=ctx,
        )
        logger.info("flow_started",
            flow_id=str(matched_flow.id), messages=len(messages))
        await _save_and_broadcast(
            db, workspace_id, contact, conversation_id, messages, ctx
        )
        return

    # PRIORITY 3: ChatbotRule match
    rule = await chatbot_service.match_message(db, workspace_id, message_text)
    if rule is not None:
        messages: list[str] = []
        if rule.flow_id is not None:
            flow_repo = ChatbotFlowRepository(db)
            flow      = await flow_repo.get_by_id(rule.flow_id)
            if flow is not None and flow.is_active:
                messages = await flow_engine.start_flow_session(
                    db=db,
                    workspace_id=workspace_id,
                    flow=flow,
                    contact=contact,
                    trigger_data={"message": message_text},
                    ctx=ctx,
                )
        elif rule.reply_text:
            messages = [rule.reply_text]

        if messages:
            await _save_and_broadcast(
                db, workspace_id, contact, conversation_id, messages, ctx
            )
        return

    # PRIORITY 4: AI reply (AI Hub — configured provider/model/prompt)
    from app.services import llm_service

    ai_text = await llm_service.generate_ai_reply(
        db, workspace_id, conversation_id, message_text
    )
    if ai_text:
        await _save_and_broadcast(
            db, workspace_id, contact, conversation_id, [ai_text], ctx
        )
        logger.info("ai_reply_sent", chars=len(ai_text))
        return

    logger.debug("no_bot_match", msg=message_text[:40])


async def _save_and_broadcast(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    contact: Contact,
    conversation_id: uuid.UUID,
    messages: list[str],
    ctx: dict,
) -> None:
    """Save plain text bot messages to DB and broadcast to Inbox.
    Interactive messages (buttons/lists/images) are already sent+saved
    by flow_engine node handlers via _save_bot_message_to_db().
    """
    from datetime import datetime, timezone
    from app.models.messaging import Message
    from app.repositories.conversation_repository import ConversationRepository
    from app.services.conversation_service import send_whatsapp_text
    from app.websocket.manager import manager

    now = datetime.now(timezone.utc)
    last_text = None

    for reply_text in (messages or []):
        if not reply_text or not reply_text.strip():
            continue

        try:
            wamid = await send_whatsapp_text(
                token=ctx["token"],
                phone_number_id=ctx["phone_number_id"],
                to=ctx["to"],
                text=reply_text,
            )
        except Exception as e:
            logger.error("bot_send_failed", error=str(e))
            wamid = f"bot_{uuid.uuid4().hex}"

        bot_msg = Message(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            contact_id=contact.id,
            wamid=wamid,
            direction="outbound",
            message_type="text",
            content=reply_text,
            status="sent",
            sent_by_id=None,
        )
        db.add(bot_msg)
        last_text = reply_text

    if last_text:
        conv_repo = ConversationRepository(db)
        conv      = await conv_repo.get_by_id(conversation_id)
        if conv:
            conv.last_message_at      = now
            conv.last_message_preview = last_text[:255]

    await db.flush()

    await manager.broadcast(
        str(workspace_id),
        "new_message",
        {
            "conversation_id": str(conversation_id),
            "direction": "outbound",
            "bot": True,
        },
    )


async def _handle_status_update(
    db: AsyncSession, workspace_id: uuid.UUID, status_update: dict
) -> None:
    from datetime import datetime, timezone
    from app.repositories.conversation_repository import MessageRepository

    wamid      = status_update.get("id")
    new_status = status_update.get("status")
    if not wamid or not new_status:
        return

    now = datetime.now(timezone.utc)

    # ── 1. Inbox messages table ──
    msg_repo = MessageRepository(db)
    msg      = await msg_repo.get_by_wamid(wamid)
    if msg is not None:
        if new_status == "delivered":
            msg.status       = "delivered"
            msg.delivered_at = now
        elif new_status == "read":
            msg.status   = "read"
            msg.read_at  = now
        elif new_status == "failed":
            msg.status = "failed"

    # ── 2. Campaign recipients (wamid stored in variables JSONB) ──
    from app.models.campaign import Campaign, CampaignRecipient

    rec_res = await db.execute(
        select(CampaignRecipient, Campaign)
        .join(Campaign, Campaign.id == CampaignRecipient.campaign_id)
        .where(
            Campaign.workspace_id == workspace_id,
            CampaignRecipient.variables["_wamid"].astext == wamid,
        )
    )
    row = rec_res.first()
    if row is not None:
        recipient, campaign = row
        prev = recipient.status
        if new_status == "delivered" and prev in ("sent", "pending"):
            recipient.status = "delivered"
            campaign.delivered_count += 1
        elif new_status == "read" and prev in ("sent", "delivered", "pending"):
            if prev != "delivered":
                campaign.delivered_count += 1
            recipient.status = "read"
            campaign.read_count += 1
        elif new_status == "failed" and prev != "failed":
            recipient.status = "failed"
            campaign.failed_count += 1
            errs = status_update.get("errors") or []
            if errs:
                e0 = errs[0]
                detail = (e0.get("error_data") or {}).get("details") or e0.get("message") or e0.get("title") or ""
                recipient.error_message = f"[{e0.get('code','')}] {detail}"[:500]

    await db.flush()