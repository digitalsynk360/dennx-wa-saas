"""
Inbox / Conversation service.
"""
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.contact import Contact
from app.models.messaging import Conversation, Message
from app.repositories.contact_repository import ContactRepository
from app.repositories.conversation_repository import (
    ConversationRepository,
    MessageRepository,
)
from app.repositories.whatsapp_repository import WhatsAppRepository
from app.schemas.conversation import (
    SendMessageRequest,
    UpdateConversationRequest,
)
from app.services.whatsapp_service import get_decrypted_token
from app.websocket.manager import manager

logger = get_logger(__name__)


async def list_conversations(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    status_filter: str | None = None,
    handling: str | None = None,
    page: int = 1,
    page_size: int = 30,
):
    repo = ConversationRepository(db)
    items, total = await repo.list_by_workspace(
        workspace_id,
        status=status_filter,
        handling=handling,
        page=page,
        page_size=page_size,
    )
    return items, total


async def get_conversation_messages(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    conversation_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
):
    conv_repo = ConversationRepository(db)
    conv = await conv_repo.get_with_contact(conversation_id, workspace_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    msg_repo = MessageRepository(db)
    messages, total = await msg_repo.list_by_conversation(
        conversation_id, workspace_id, page=page, page_size=page_size
    )
    if conv.unread_count > 0:
        conv.unread_count = 0
        await db.flush()

    return conv, messages, total


async def send_message(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    conversation_id: uuid.UUID,
    payload: SendMessageRequest,
    sent_by_id: uuid.UUID,
) -> Message:
    conv_repo = ConversationRepository(db)
    conv = await conv_repo.get_with_contact(conversation_id, workspace_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    wa_repo = WhatsAppRepository(db)
    account = await wa_repo.get_by_workspace(workspace_id)
    if account is None or account.status != "live":
        raise HTTPException(status_code=400, detail="WhatsApp account not connected.")

    token = get_decrypted_token(account)
    phone = conv.contact.phone

    wamid = await send_whatsapp_text(
        token=token,
        phone_number_id=account.phone_number_id,
        to=phone,
        text=payload.content,
    )

    msg = Message(
        workspace_id=workspace_id,
        conversation_id=conversation_id,
        contact_id=conv.contact_id,
        wamid=wamid,
        direction="outbound",
        message_type="text",
        content=payload.content,
        status="sent",
        sent_by_id=sent_by_id,
    )
    db.add(msg)

    conv.last_message_at = datetime.now(timezone.utc)
    conv.last_message_preview = payload.content[:255]
    if conv.handling == "bot":
        conv.handling = "intervened"
        conv.assigned_agent_id = sent_by_id
    await db.flush()

    await manager.broadcast(
        str(workspace_id),
        "new_message",
        {"conversation_id": str(conversation_id), "message_id": str(msg.id)},
    )

    return msg


async def update_conversation(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    conversation_id: uuid.UUID,
    payload: UpdateConversationRequest,
) -> Conversation:
    repo = ConversationRepository(db)
    conv = await repo.get_with_contact(conversation_id, workspace_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    if payload.status is not None:
        conv.status = payload.status
        if payload.status == "resolved":
            conv.resolved_at = datetime.now(timezone.utc)
    if payload.handling is not None:
        conv.handling = payload.handling
    if payload.assigned_agent_id is not None:
        conv.assigned_agent_id = payload.assigned_agent_id
    if hasattr(payload, "clear_agent") and payload.clear_agent:
        conv.assigned_agent_id = None

    await db.flush()

    await manager.broadcast(
        str(workspace_id),
        "conversation_updated",
        {
            "conversation_id": str(conversation_id),
            "handling": conv.handling,
            "status": conv.status,
            "assigned_agent_id": str(conv.assigned_agent_id) if conv.assigned_agent_id else None,
        },
    )

    return conv


async def create_inbound_message(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    contact: Contact,
    wamid: str,
    content: str,
    message_type: str = "text",
    media_url: str | None = None,
) -> tuple[Conversation, Message]:
    conv_repo = ConversationRepository(db)
    msg_repo  = MessageRepository(db)

    existing = await msg_repo.get_by_wamid(wamid)
    if existing:
        conv = await conv_repo.get_with_contact(existing.conversation_id, workspace_id)
        return conv, existing

    conv = await conv_repo.get_by_contact(contact.id, workspace_id)
    if conv is None:
        wa_repo = WhatsAppRepository(db)
        account = await wa_repo.get_by_workspace(workspace_id)
        if account is None:
            raise HTTPException(
                status_code=400,
                detail="No WhatsApp account connected to this workspace.",
            )
        conv = Conversation(
            workspace_id=workspace_id,
            contact_id=contact.id,
            whatsapp_account_id=account.id,
            status="open",
            handling="bot",
        )
        db.add(conv)
        await db.flush()

    now = datetime.now(timezone.utc)
    msg = Message(
        workspace_id=workspace_id,
        conversation_id=conv.id,
        contact_id=contact.id,
        wamid=wamid,
        direction="inbound",
        message_type=message_type,
        content=content,
        media_url=media_url,
        status="received",
    )
    db.add(msg)

    conv.last_message_at      = now
    conv.last_message_preview = content[:255] if content else ""
    conv.unread_count         = (conv.unread_count or 0) + 1
    conv.session_expires_at   = now + timedelta(hours=24)

    await db.flush()

    await manager.broadcast(
        str(workspace_id),
        "new_message",
        {
            "conversation_id": str(conv.id),
            "message_id": str(msg.id),
            "direction": "inbound",
        },
    )

    return conv, msg


# ── WhatsApp Cloud API helpers ────────────────────────────────────────

async def send_whatsapp_text(
    token: str, phone_number_id: str, to: str, text: str
) -> str:
    """Send plain text message. Returns wamid."""
    url = f"{settings.graph_api_base}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code != 200:
        logger.error("whatsapp_send_failed",
            status=response.status_code, body=response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"WhatsApp API error: {response.text}",
        )
    data = response.json()
    return data.get("messages", [{}])[0].get("id", "")


async def send_whatsapp_interactive_buttons(
    token: str,
    phone_number_id: str,
    to: str,
    body_text: str,
    buttons: list[str],
) -> str:
    """
    Send WhatsApp interactive reply buttons (clickable bubbles).
    Max 3 buttons, each title max 20 chars.
    Auto-fallback to numbered plain text if API rejects.
    """
    url = f"{settings.graph_api_base}/{phone_number_id}/messages"

    btn_list = [
        {
            "type": "reply",
            "reply": {
                "id": f"btn_{i + 1}",
                "title": label[:20]
            }
        }
        for i, label in enumerate(buttons[:3])
    ]

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": body_text or "Please choose:"},
            "action": {"buttons": btn_list}
        }
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    if response.status_code != 200:
        logger.warning("interactive_buttons_fallback",
            status=response.status_code, body=response.text[:200])
        # Fallback to numbered plain text
        fallback = (body_text or "") + "\n\n" + "\n".join(
            f"{i + 1}. {b}" for i, b in enumerate(buttons)
        )
        return await send_whatsapp_text(token, phone_number_id, to, fallback)

    data = response.json()
    return data.get("messages", [{}])[0].get("id", "")


async def send_whatsapp_list_message(
    token: str,
    phone_number_id: str,
    to: str,
    header_text: str,
    body_text: str,
    button_label: str,
    sections: list[dict],
) -> str:
    """
    Send WhatsApp List Message (dropdown style).
    sections = [{"title": "Section", "rows": [{"id": "r1", "title": "Option"}]}]
    Auto-fallback to plain text if API rejects.
    """
    url = f"{settings.graph_api_base}/{phone_number_id}/messages"

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "header": {"type": "text", "text": header_text[:60]},
            "body": {"text": body_text or " "},
            "action": {
                "button": (button_label or "Choose")[:20],
                "sections": sections
            }
        }
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    if response.status_code != 200:
        logger.warning("list_message_fallback",
            status=response.status_code, body=response.text[:200])
        rows_text = "\n".join(
            f"• {row.get('title', '')}"
            for sec in sections
            for row in sec.get("rows", [])
        )
        fallback = f"*{header_text}*\n{body_text}\n\n{rows_text}"
        return await send_whatsapp_text(token, phone_number_id, to, fallback)

    data = response.json()
    return data.get("messages", [{}])[0].get("id", "")