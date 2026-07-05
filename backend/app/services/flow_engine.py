"""
Production Flow Execution Engine.

FlowSession.status: "active" | "waiting" | "completed"
FlowSession has NO is_active field — uses status field.

Interactive messages (buttons, lists, images) are:
  1. Sent directly via WhatsApp API inside node handlers
  2. Saved to messages table via _save_bot_message_to_db()
  3. NOT returned in messages list (to avoid double-send)

Plain text messages are returned as list[str] and sent by webhook_service.
"""
from __future__ import annotations

import asyncio
import random
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.automation import ChatbotFlow, FlowSession
from app.models.contact import Contact

logger = get_logger(__name__)

MAX_STEPS = 50


# ── Graph helpers ──────────────────────────────────────────────────────

def _find_node(nodes: list[dict], node_id: str) -> dict | None:
    return next((n for n in nodes if n.get("id") == node_id), None)


def _find_start_node(nodes: list[dict], edges: list[dict]) -> dict | None:
    target_ids = {e.get("target") for e in edges}
    candidates = [n for n in nodes if n.get("id") not in target_ids]
    return candidates[0] if candidates else (nodes[0] if nodes else None)


def _next_node_id(
    edges: list[dict], from_id: str, handle: str = "default"
) -> str | None:
    candidates = [e for e in edges if e.get("source") == from_id]
    for e in candidates:
        sh = e.get("sourceHandle") or "default"
        if sh == handle:
            return e.get("target")
    if candidates:
        return candidates[0].get("target")
    return None


def _interpolate(text: str, variables: dict) -> str:
    if not text:
        return text or ""
    for k, v in variables.items():
        text = text.replace(f"{{{{{k}}}}}", str(v))
    return text


def _get(node: dict, key: str, variables: dict, default: Any = "") -> Any:
    raw = node.get("data", {}).get(key, default)
    if isinstance(raw, str):
        return _interpolate(raw, variables)
    return raw


# ── DB save helper ─────────────────────────────────────────────────────

async def _save_bot_message_to_db(
    ctx: dict,
    wamid: str,
    content: str,
    message_type: str = "text",
) -> None:
    """Save a bot-sent message to DB so it appears in Inbox."""
    db = ctx.get("db")
    if not db:
        return
    try:
        from app.models.messaging import Message
        msg = Message(
            workspace_id=ctx["workspace_id"],
            conversation_id=ctx["conversation_id"],
            contact_id=ctx["contact_id"],
            wamid=wamid or f"bot_{uuid.uuid4().hex}",
            direction="outbound",
            message_type=message_type,
            content=content[:500] if content else "",
            status="sent",
            sent_by_id=None,
        )
        db.add(msg)
        await db.flush()
        logger.info("bot_msg_saved_to_db", type=message_type, content=content[:40])
    except Exception as e:
        logger.error("save_bot_msg_failed", error=str(e))


# ── Node executor ──────────────────────────────────────────────────────

async def _exec_node(
    node: dict,
    variables: dict,
    ctx: dict,
) -> tuple[list[str], str, bool, str | None]:
    """
    Execute one node.
    Returns: (messages_to_send, output_handle, wait_for_input, save_as_variable)

    IMPORTANT:
    - Plain text messages are returned in list[str] → sent by webhook_service
    - Interactive messages (buttons/lists) are sent DIRECTLY here + saved to DB
    - Return [] for messages when interactive is sent (avoid double-send)
    """
    t = node.get("type", "")
    d = node.get("data", {})

    # TRIGGERS — pass through
    if t in ("keyword_trigger", "new_message_trigger",
             "webhook_trigger", "schedule_trigger"):
        return [], "default", False, None

    # SEND TEXT
    if t == "send_text":
        msg    = _interpolate(d.get("message", ""), variables)
        footer = _interpolate(d.get("footer", ""), variables)
        if footer:
            msg = f"{msg}\n\n_{footer}_"
        return ([msg] if msg else []), "default", False, None

    # SEND IMAGE
    if t == "send_image":
        url     = _interpolate(d.get("image_url", ""), variables)
        caption = _interpolate(d.get("caption", ""), variables)
        if url and ctx.get("token"):
            await _send_media(ctx, "image", url, caption)
            await _save_bot_message_to_db(
                ctx=ctx,
                wamid=f"img_{uuid.uuid4().hex}",
                content=f"[Image] {caption or url}",
                message_type="image",
            )
        return [], "default", False, None

    # SEND VIDEO
    if t == "send_video":
        url     = _interpolate(d.get("video_url", ""), variables)
        caption = _interpolate(d.get("caption", ""), variables)
        if url and ctx.get("token"):
            await _send_media(ctx, "video", url, caption)
            await _save_bot_message_to_db(
                ctx=ctx,
                wamid=f"vid_{uuid.uuid4().hex}",
                content=f"[Video] {caption or url}",
                message_type="video",
            )
        return [], "default", False, None

    # SEND AUDIO
    if t == "send_audio":
        url = _interpolate(d.get("audio_url", ""), variables)
        if url and ctx.get("token"):
            await _send_media(ctx, "audio", url, None)
            await _save_bot_message_to_db(
                ctx=ctx,
                wamid=f"aud_{uuid.uuid4().hex}",
                content=f"[Audio] {url}",
                message_type="audio",
            )
        return [], "default", False, None

    # SEND DOCUMENT
    if t == "send_document":
        url      = _interpolate(d.get("file_url", ""), variables)
        filename = _interpolate(d.get("file_name", "document"), variables)
        if url and ctx.get("token"):
            await _send_media(ctx, "document", url, filename)
            await _save_bot_message_to_db(
                ctx=ctx,
                wamid=f"doc_{uuid.uuid4().hex}",
                content=f"[Document] {filename}",
                message_type="document",
            )
        return [], "default", False, None

    # SEND BUTTONS — real interactive buttons with DB save
    if t == "send_buttons":
        msg  = _interpolate(d.get("message", ""), variables)
        btns = []
        for i in range(1, 4):
            b = _interpolate(d.get(f"button_{i}", ""), variables)
            if b and b.strip():
                btns.append(b.strip())

        if not btns:
            return [], "default", False, None

        if ctx.get("token") and ctx.get("phone_number_id") and ctx.get("to"):
            from app.services.conversation_service import send_whatsapp_interactive_buttons
            try:
                wamid = await send_whatsapp_interactive_buttons(
                    token=ctx["token"],
                    phone_number_id=ctx["phone_number_id"],
                    to=ctx["to"],
                    body_text=msg or "Please choose:",
                    buttons=btns,
                )
                variables["_buttons"] = ",".join(btns)
                variables["_buttons_wamid"] = wamid
                # ✅ Save to DB so Inbox shows buttons message
                btn_preview = "\n".join(f"{i+1}. {b}" for i, b in enumerate(btns))
                full_preview = f"{msg}\n\n{btn_preview}" if msg else btn_preview
                await _save_bot_message_to_db(
                    ctx=ctx,
                    wamid=wamid,
                    content=full_preview,
                    message_type="interactive",
                )
                return [], "default", True, "_button_choice"
            except Exception as e:
                logger.error("interactive_buttons_failed", error=str(e))
                # Fallback to plain text
                btn_text = "\n".join(f"{i+1}. {b}" for i, b in enumerate(btns))
                full_msg  = f"{msg}\n\n{btn_text}" if msg else btn_text
                variables["_buttons"] = ",".join(btns)
                return [full_msg], "default", True, "_button_choice"
        else:
            # Test mode — return as text
            btn_text = "\n".join(f"{i+1}. {b}" for i, b in enumerate(btns))
            full_msg  = f"{msg}\n\n{btn_text}" if msg else btn_text
            variables["_buttons"] = ",".join(btns)
            return [full_msg], "default", True, "_button_choice"

    # SEND LIST — real WhatsApp list message with DB save
    if t == "send_list":
        title    = _interpolate(d.get("title", "Choose an option"), variables)
        desc     = _interpolate(d.get("description", ""), variables)
        sections = d.get("sections", [])

        if ctx.get("token") and ctx.get("phone_number_id") and ctx.get("to") and sections:
            from app.services.conversation_service import send_whatsapp_list_message
            api_sections = []
            for sec in sections:
                rows = []
                for j, row in enumerate(sec.get("rows", [])):
                    rows.append({
                        "id": f"row_{j+1}",
                        "title": _interpolate(row.get("title", ""), variables)[:24],
                        "description": _interpolate(row.get("description", ""), variables)[:72],
                    })
                api_sections.append({
                    "title": sec.get("title", "Options")[:24],
                    "rows": rows,
                })
            try:
                wamid = await send_whatsapp_list_message(
                    token=ctx["token"],
                    phone_number_id=ctx["phone_number_id"],
                    to=ctx["to"],
                    header_text=title,
                    body_text=desc or " ",
                    button_label="Choose",
                    sections=api_sections,
                )
                await _save_bot_message_to_db(
                    ctx=ctx,
                    wamid=wamid or f"lst_{uuid.uuid4().hex}",
                    content=f"[List] {title}",
                    message_type="interactive",
                )
                return [], "default", True, "_list_choice"
            except Exception as e:
                logger.error("list_message_failed", error=str(e))
                return [title], "default", True, "_list_choice"
        else:
            return [title], "default", True, "_list_choice"

    # SEND TEMPLATE
    if t == "send_template":
        name = _interpolate(d.get("template_name", ""), variables)
        return ([f"[Template: {name}]"] if name else []), "default", False, None

    # ASK QUESTION
    if t == "ask_question":
        q       = _interpolate(d.get("question", ""), variables)
        save_as = d.get("variable_name", "user_answer") or "user_answer"
        return ([q] if q else []), "default", True, save_as

    # ASK NAME
    if t == "ask_name":
        save_as = d.get("variable_name", "contact_name") or "contact_name"
        return ["Please share your full name:"], "default", True, save_as

    # ASK PHONE
    if t == "ask_phone":
        save_as = d.get("variable_name", "phone_number") or "phone_number"
        return ["Please share your phone number:"], "default", True, save_as

    # ASK EMAIL
    if t == "ask_email":
        save_as = d.get("variable_name", "email") or "email"
        return ["Please share your email address:"], "default", True, save_as

    # ASK NUMBER
    if t == "ask_number":
        save_as = d.get("variable_name", "number") or "number"
        mn = d.get("min", ""); mx = d.get("max", "")
        prompt  = f"Please enter a number{f' ({mn}–{mx})' if mn or mx else ''}:"
        return [prompt], "default", True, save_as

    # ASK DATE
    if t == "ask_date":
        save_as = d.get("variable_name", "date") or "date"
        fmt     = d.get("format", "DD/MM/YYYY")
        return [f"Please enter the date ({fmt}):"], "default", True, save_as

    # ASK FILE
    if t == "ask_file":
        save_as = d.get("variable_name", "file") or "file"
        allowed = d.get("allowed_types", "any")
        return [f"Please upload a file ({allowed}):"], "default", True, save_as

    # IF / ELSE
    if t == "if_else":
        var_name = d.get("variable", "")
        operator = d.get("operator", "equals")
        cmp_val  = _interpolate(d.get("value", ""), variables)
        actual   = str(variables.get(var_name, ""))
        result   = False
        if operator == "equals":        result = actual == cmp_val
        elif operator == "not_equals":  result = actual != cmp_val
        elif operator == "contains":    result = cmp_val.lower() in actual.lower()
        elif operator == "starts_with": result = actual.lower().startswith(cmp_val.lower())
        elif operator == "ends_with":   result = actual.lower().endswith(cmp_val.lower())
        elif operator == "greater_than":
            try: result = float(actual) > float(cmp_val)
            except: result = False
        elif operator == "less_than":
            try: result = float(actual) < float(cmp_val)
            except: result = False
        return [], "true" if result else "false", False, None

    # SWITCH
    if t == "switch":
        var_name = d.get("variable", "")
        actual   = str(variables.get(var_name, "")).lower()
        for case in d.get("cases", []):
            if str(case.get("value", "")).lower() == actual:
                return [], case.get("handle", "default"), False, None
        return [], "default", False, None

    # DELAY
    if t == "delay":
        secs = (
            int(d.get("seconds", 0) or 0) +
            int(d.get("minutes", 0) or 0) * 60 +
            int(d.get("hours",   0) or 0) * 3600
        )
        if 0 < secs <= 30:
            await asyncio.sleep(secs)
        return [], "default", False, None

    # WAIT FOR REPLY
    if t == "wait_for_reply":
        return [], "default", True, "_wait_reply"

    # GO TO FLOW
    if t == "go_to_flow":
        target = _interpolate(d.get("target_flow", ""), variables)
        variables["_goto_flow"] = target
        return [], "stop", False, None

    # SAVE VARIABLE
    if t == "save_variable":
        var_name = d.get("variable_name", "")
        val      = _interpolate(d.get("value", ""), variables)
        if var_name:
            variables[var_name] = val
        return [], "default", False, None

    # UPDATE VARIABLE
    if t == "update_variable":
        var_name = d.get("variable_name", "")
        new_val  = _interpolate(d.get("new_value", ""), variables)
        if var_name:
            variables[var_name] = new_val
        return [], "default", False, None

    # DELETE VARIABLE
    if t == "delete_variable":
        variables.pop(d.get("variable_name", ""), None)
        return [], "default", False, None

    # CONTACT OPS — real DB writes
    if t in ("add_tag", "remove_tag"):
        tag_name = _interpolate(d.get("tag_name", ""), variables).strip()
        db = ctx.get("db")
        contact_id = ctx.get("contact_id")
        if tag_name and db is not None and contact_id:
            try:
                from sqlalchemy.orm import selectinload
                from app.models.contact import Tag

                res = await db.execute(
                    select(Contact)
                    .options(selectinload(Contact.tags))
                    .where(
                        Contact.id == contact_id,
                        Contact.workspace_id == ctx["workspace_id"],
                    )
                )
                contact = res.scalar_one_or_none()
                if contact is not None:
                    res = await db.execute(
                        select(Tag).where(
                            Tag.workspace_id == ctx["workspace_id"],
                            Tag.name == tag_name,
                        )
                    )
                    tag = res.scalar_one_or_none()
                    if t == "add_tag":
                        if tag is None:
                            tag = Tag(
                                workspace_id=ctx["workspace_id"],
                                name=tag_name, color=None,
                            )
                            db.add(tag)
                            await db.flush()
                        if all(x.id != tag.id for x in contact.tags):
                            contact.tags.append(tag)
                    elif tag is not None:
                        contact.tags = [x for x in contact.tags if x.id != tag.id]
                    await db.flush()
                    logger.info(f"flow_{t}_applied", tag=tag_name)
            except Exception as e:
                logger.error(f"flow_{t}_failed", error=str(e))
        return [], "default", False, None

    if t == "update_contact":
        db = ctx.get("db")
        contact_id = ctx.get("contact_id")
        if db is not None and contact_id:
            try:
                res = await db.execute(
                    select(Contact).where(
                        Contact.id == contact_id,
                        Contact.workspace_id == ctx["workspace_id"],
                    )
                )
                contact = res.scalar_one_or_none()
                if contact is not None:
                    for field in ("name", "email", "city"):
                        val = _interpolate(d.get(field, "") or "", variables).strip()
                        if val:
                            setattr(contact, field, val)
                    await db.flush()
                    logger.info("flow_update_contact_applied")
            except Exception as e:
                logger.error("flow_update_contact_failed", error=str(e))
        return [], "default", False, None

    if t == "create_contact":
        db = ctx.get("db")
        phone = _interpolate(d.get("phone", "") or "", variables).strip()
        if db is not None and phone:
            try:
                res = await db.execute(
                    select(Contact).where(
                        Contact.workspace_id == ctx["workspace_id"],
                        Contact.phone == phone,
                    )
                )
                if res.scalar_one_or_none() is None:
                    name  = _interpolate(d.get("name", "") or "", variables).strip() or None
                    email = _interpolate(d.get("email", "") or "", variables).strip() or None
                    db.add(Contact(
                        workspace_id=ctx["workspace_id"],
                        phone=phone, name=name, email=email,
                        source="flow", status="new",
                    ))
                    await db.flush()
                    logger.info("flow_create_contact_applied", phone=phone)
            except Exception as e:
                logger.error("flow_create_contact_failed", error=str(e))
        return [], "default", False, None

    # TEAM OPS — real assignment
    if t == "assign_agent":
        db = ctx.get("db")
        conv_id = ctx.get("conversation_id")
        if db is not None and conv_id:
            try:
                from sqlalchemy import func as sa_func
                from app.models.identity import WorkspaceMember
                from app.models.messaging import Conversation

                agent_uuid = None
                raw_agent = _interpolate(d.get("agent_id", "") or "", variables).strip()
                if d.get("strategy") == "specific" and raw_agent:
                    try:
                        agent_uuid = uuid.UUID(raw_agent)
                    except ValueError:
                        agent_uuid = None
                if agent_uuid is None:
                    # round_robin / least_busy: member with fewest open chats
                    res = await db.execute(
                        select(
                            WorkspaceMember.user_id,
                            sa_func.count(Conversation.id).label("open_count"),
                        )
                        .outerjoin(
                            Conversation,
                            (Conversation.assigned_agent_id == WorkspaceMember.user_id)
                            & (Conversation.workspace_id == ctx["workspace_id"])
                            & (Conversation.status == "open"),
                        )
                        .where(
                            WorkspaceMember.workspace_id == ctx["workspace_id"],
                            WorkspaceMember.is_active == True,  # noqa: E712
                        )
                        .group_by(WorkspaceMember.user_id)
                        .order_by(sa_func.count(Conversation.id).asc())
                        .limit(1)
                    )
                    row = res.first()
                    agent_uuid = row[0] if row else None
                if agent_uuid is not None:
                    res = await db.execute(
                        select(Conversation).where(
                            Conversation.id == conv_id,
                            Conversation.workspace_id == ctx["workspace_id"],
                        )
                    )
                    conv = res.scalar_one_or_none()
                    if conv is not None:
                        conv.assigned_agent_id = agent_uuid
                        conv.handling = "human"
                        await db.flush()
                        logger.info("flow_assign_agent_applied", agent=str(agent_uuid))
            except Exception as e:
                logger.error("flow_assign_agent_failed", error=str(e))
        return [], "default", False, None

    if t == "transfer_chat":
        # Hand conversation to humans (team routing = assignment above)
        db = ctx.get("db")
        conv_id = ctx.get("conversation_id")
        if db is not None and conv_id:
            try:
                from app.models.messaging import Conversation
                res = await db.execute(
                    select(Conversation).where(
                        Conversation.id == conv_id,
                        Conversation.workspace_id == ctx["workspace_id"],
                    )
                )
                conv = res.scalar_one_or_none()
                if conv is not None:
                    conv.handling = "human"
                    await db.flush()
                    logger.info("flow_transfer_chat_applied", team=d.get("team"))
            except Exception as e:
                logger.error("flow_transfer_chat_failed", error=str(e))
        return [], "default", False, None

    if t == "create_ticket":
        logger.info("flow_create_ticket", subject=d.get("subject"))
        return [], "default", False, None

    # API REQUEST
    if t == "api_request":
        method  = _interpolate(d.get("method", "GET"), variables)
        url     = _interpolate(d.get("url", ""), variables)
        body    = _interpolate(d.get("body", ""), variables) or None
        save_as = d.get("save_response_variable", "_api_response")
        if not url:
            return [], "error", False, None
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.request(
                    method.upper(), url,
                    content=body.encode() if body else None,
                    headers={"Content-Type": "application/json"} if body else {},
                )
            resp.raise_for_status()
            if save_as:
                variables[save_as] = resp.text
            return [], "success", False, None
        except Exception as e:
            variables["_api_error"] = str(e)
            return [], "error", False, None

    # DATABASE — contacts table supported
    if t == "find_record":
        db = ctx.get("db")
        table = (d.get("table") or "").strip().lower()
        if db is not None and table in ("contact", "contacts"):
            try:
                import json as _json
                raw = _interpolate(d.get("conditions", "") or "{}", variables)
                try:
                    conds = _json.loads(raw) if raw.strip() else {}
                except Exception:
                    conds = {}
                stmt = select(Contact).where(
                    Contact.workspace_id == ctx["workspace_id"]
                )
                if conds.get("phone"):
                    stmt = stmt.where(Contact.phone == str(conds["phone"]).strip())
                if conds.get("name"):
                    stmt = stmt.where(Contact.name.ilike(f"%{conds['name']}%"))
                if conds.get("email"):
                    stmt = stmt.where(Contact.email == str(conds["email"]).strip())
                res = await db.execute(stmt.limit(1))
                found = res.scalar_one_or_none()
                if found is not None:
                    variables["_record_id"]    = str(found.id)
                    variables["_record_name"]  = found.name or ""
                    variables["_record_phone"] = found.phone
                    variables["_record_email"] = found.email or ""
                    return [], "found", False, None
            except Exception as e:
                logger.error("flow_find_record_failed", error=str(e))
        return [], "not_found", False, None

    if t in ("create_record", "update_record"):
        db = ctx.get("db")
        table = (d.get("table") or "").strip().lower()
        if db is not None and table in ("contact", "contacts") and t == "create_record":
            try:
                import json as _json
                raw = _interpolate(d.get("data", "") or "{}", variables)
                try:
                    payload = _json.loads(raw) if raw.strip() else {}
                except Exception:
                    payload = {}
                phone = str(payload.get("phone", "")).strip()
                if phone:
                    res = await db.execute(
                        select(Contact).where(
                            Contact.workspace_id == ctx["workspace_id"],
                            Contact.phone == phone,
                        )
                    )
                    if res.scalar_one_or_none() is None:
                        db.add(Contact(
                            workspace_id=ctx["workspace_id"],
                            phone=phone,
                            name=(str(payload.get("name", "")).strip() or None),
                            email=(str(payload.get("email", "")).strip() or None),
                            city=(str(payload.get("city", "")).strip() or None),
                            source="flow", status="new",
                        ))
                        await db.flush()
                        logger.info("flow_create_record_applied", phone=phone)
            except Exception as e:
                logger.error("flow_create_record_failed", error=str(e))
        return [], "default", False, None

    # PAYMENT
    if t == "create_payment_link":
        amount = _interpolate(d.get("amount", ""), variables)
        desc   = _interpolate(d.get("description", ""), variables)
        link   = f"pay.example.com/{uuid.uuid4().hex[:8]}"
        variables["_payment_link"] = link
        msg = f"Payment Link: {link}\nAmount: {amount}\n{desc}"
        return [msg], "pending", False, None

    # UTILITIES
    if t == "datetime":
        fmt = d.get("format", "%Y-%m-%d %H:%M")
        variables["_current_datetime"] = datetime.now(timezone.utc).strftime(fmt)
        return [], "default", False, None
    if t == "random_number":
        mn = int(d.get("min", 1) or 1)
        mx = int(d.get("max", 100) or 100)
        variables["_random_number"] = random.randint(mn, mx)
        return [], "default", False, None
    if t == "formatter":
        var_name = d.get("variable_name", "")
        fmt_type = d.get("format_type", "uppercase")
        val      = str(variables.get(var_name, ""))
        if fmt_type == "uppercase":    val = val.upper()
        elif fmt_type == "lowercase":  val = val.lower()
        elif fmt_type == "capitalize": val = val.title()
        if var_name:
            variables[var_name] = val
        return [], "default", False, None

    # END / STOP / RESTART
    if t == "end_flow":
        msg = _interpolate(d.get("completion_message", ""), variables)
        return ([msg] if msg else []), "stop", False, None
    if t == "stop_flow":
        return [], "stop", False, None
    if t == "restart_flow":
        return [], "restart", False, None

    logger.debug("flow_unknown_node", type=t)
    return [], "default", False, None


# ── Walk graph until wait/stop ─────────────────────────────────────────

async def _walk_until_wait(
    nodes: list[dict],
    edges: list[dict],
    start_node: dict,
    variables: dict,
    ctx: dict,
) -> tuple[list[str], str | None, str | None]:
    all_messages: list[str] = []
    current = start_node
    steps   = 0

    while current and steps < MAX_STEPS:
        steps    += 1
        node_id   = current.get("id", "")
        node_type = current.get("type", "")

        try:
            msgs, handle, wait, save_as = await _exec_node(
                current, variables, ctx
            )
        except Exception as e:
            logger.error("node_exec_error", node_type=node_type, error=str(e))
            break

        all_messages.extend(m for m in msgs if m and m.strip())

        if handle == "stop" or node_type in ("end_flow", "stop_flow"):
            return all_messages, None, None

        if wait:
            return all_messages, node_id, save_as

        next_id = _next_node_id(edges, node_id, handle)
        if next_id is None:
            return all_messages, None, None

        current = _find_node(nodes, next_id)

    return all_messages, None, None


# ── PUBLIC API ─────────────────────────────────────────────────────────

async def start_flow_session(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    flow: ChatbotFlow,
    contact: Contact,
    trigger_data: dict | None = None,
    ctx: dict | None = None,
) -> list[str]:
    """
    Start a new flow for a contact.
    Returns list[str] of plain text messages to send via WhatsApp.
    Interactive messages (buttons/images/lists) are sent directly
    from node handlers and saved to DB — NOT returned here.
    Uses FlowSession.status (NOT is_active field).
    """
    ctx   = ctx or {}
    nodes: list[dict] = flow.nodes or []
    edges: list[dict] = flow.edges or []

    if not nodes:
        logger.warning("flow_no_nodes", flow_id=str(flow.id))
        return []

    # Close existing active sessions (use status, not is_active)
    existing = await db.execute(
        select(FlowSession)
        .where(FlowSession.workspace_id == workspace_id)
        .where(FlowSession.contact_id == contact.id)
        .where(FlowSession.status.in_(["active", "waiting"]))
    )
    for s in existing.scalars().all():
        s.status = "completed"
    await db.flush()

    start_node = _find_start_node(nodes, edges)
    if start_node is None:
        return []

    variables = dict(trigger_data or {})

    # Skip trigger node → go to first real node
    trigger_types = (
        "keyword_trigger", "new_message_trigger",
        "webhook_trigger", "schedule_trigger"
    )
    first_node = start_node
    if start_node.get("type", "") in trigger_types:
        next_id    = _next_node_id(edges, start_node.get("id", ""))
        first_node = _find_node(nodes, next_id) if next_id else None

    if first_node is None:
        logger.warning("flow_no_node_after_trigger", flow_id=str(flow.id))
        return []

    logger.info("flow_starting",
        flow_id=str(flow.id),
        flow_name=flow.name,
        first_node=first_node.get("type"),
        node_count=len(nodes),
    )

    messages, stopped_at_id, save_as = await _walk_until_wait(
        nodes, edges, first_node, variables, ctx
    )

    logger.info("flow_walk_done",
        messages=len(messages),
        stopped_at=stopped_at_id,
        save_as=save_as,
    )

    if stopped_at_id:
        session = FlowSession(
            workspace_id=workspace_id,
            flow_id=flow.id,
            contact_id=contact.id,
            current_node_id=stopped_at_id,
            variables={**variables, "__save_as__": save_as or ""},
            status="waiting",
        )
        db.add(session)
        await db.flush()
        logger.info("flow_session_saved",
            flow_id=str(flow.id),
            node=stopped_at_id,
            save_as=save_as,
        )
    else:
        session = FlowSession(
            workspace_id=workspace_id,
            flow_id=flow.id,
            contact_id=contact.id,
            current_node_id=None,
            variables=variables,
            status="completed",
        )
        db.add(session)
        await db.flush()
        logger.info("flow_completed", flow_id=str(flow.id))

    return messages


async def resume_flow_session(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    flow: ChatbotFlow,
    session: FlowSession,
    contact: Contact,
    user_reply: str,
    ctx: dict | None = None,
) -> list[str]:
    """
    Resume a waiting flow with user's reply.
    Returns list[str] of next plain text messages.
    """
    ctx   = ctx or {}
    nodes: list[dict] = flow.nodes or []
    edges: list[dict] = flow.edges or []

    variables       = dict(session.variables or {})
    save_as         = variables.pop("__save_as__", None)
    current_node_id = session.current_node_id

    # Save user reply
    if save_as and save_as not in ("_button_choice", "_list_choice", "_wait_reply"):
        variables[save_as] = user_reply

    current_node = _find_node(nodes, current_node_id or "")
    if current_node is None:
        session.status = "completed"
        await db.flush()
        return []

    node_type = current_node.get("type", "")

    # Determine output handle
    chosen_handle = "default"
    if node_type == "send_buttons":
        node_data  = current_node.get("data", {})
        user_input = user_reply.strip().lower()

        # Match by button title (WhatsApp sends button title on click)
        for i in range(1, 4):
            btn_label = _interpolate(
                node_data.get(f"button_{i}", ""), variables
            )
            if not btn_label:
                continue
            if user_input == btn_label.strip().lower():
                chosen_handle = f"button_{i}"
                variables["_button_choice"] = btn_label
                break

        # Match by number (plain text fallback: user types 1/2/3)
        if chosen_handle == "default":
            try:
                idx = int(user_reply.strip())
                if 1 <= idx <= 3:
                    btn_label = _interpolate(
                        node_data.get(f"button_{idx}", ""), variables
                    )
                    chosen_handle              = f"button_{idx}"
                    variables["_button_choice"] = btn_label
            except ValueError:
                pass

    elif node_type == "send_list":
        variables["_list_choice"] = user_reply
    elif save_as:
        variables[save_as] = user_reply

    # Move to next node
    next_id = _next_node_id(edges, current_node_id or "", chosen_handle)
    if next_id is None:
        session.status = "completed"
        await db.flush()
        logger.info("flow_session_completed_no_next", flow_id=str(flow.id))
        return []

    next_node = _find_node(nodes, next_id)
    if next_node is None:
        session.status = "completed"
        await db.flush()
        return []

    messages, stopped_at_id, new_save_as = await _walk_until_wait(
        nodes, edges, next_node, variables, ctx
    )

    if stopped_at_id:
        session.current_node_id = stopped_at_id
        session.variables       = {**variables, "__save_as__": new_save_as or ""}
        session.status          = "waiting"
        await db.flush()
        logger.info("flow_session_updated",
            flow_id=str(flow.id), node=stopped_at_id)
    else:
        session.status    = "completed"
        session.variables = variables
        await db.flush()
        logger.info("flow_session_completed_after_resume",
            flow_id=str(flow.id))

    return messages


# ── Media send helper ──────────────────────────────────────────────────

async def _send_media(
    ctx: dict, media_type: str, url: str, caption: str | None
) -> None:
    if not ctx.get("token") or not url:
        return
    from app.core.config import settings
    payload = {
        "messaging_product": "whatsapp",
        "to": ctx["to"],
        "type": media_type,
        media_type: {"link": url},
    }
    if caption:
        payload[media_type]["caption"] = caption
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{settings.graph_api_base}/{ctx['phone_number_id']}/messages",
                json=payload,
                headers={"Authorization": f"Bearer {ctx['token']}"},
            )
    except Exception as e:
        logger.error("flow_media_send_failed", error=str(e))


# ── Legacy compatibility wrappers ──────────────────────────────────────

async def start_flow(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    flow: ChatbotFlow,
    contact: Contact,
    trigger_data: dict | None = None,
    ctx: dict | None = None,
    is_test: bool = False,
) -> tuple[Any, list]:
    msgs = await start_flow_session(
        db, workspace_id, flow, contact, trigger_data, ctx
    )
    return None, [{"output_data": {"message": m}} for m in msgs]


async def resume_flow(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    flow: ChatbotFlow,
    execution: Any,
    contact: Contact,
    user_reply: str,
    ctx: dict | None = None,
) -> tuple[Any, list]:
    from app.repositories.chatbot_repository import FlowSessionRepository
    repo    = FlowSessionRepository(db)
    session = await repo.get_active(workspace_id, contact.id)
    if session is None:
        return None, []
    msgs = await resume_flow_session(
        db, workspace_id, flow, session, contact, user_reply, ctx
    )
    return None, [{"output_data": {"message": m}} for m in msgs]