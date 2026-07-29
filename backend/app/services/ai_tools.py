"""
Real, action-taking AI tools — the part that turns the AI Chatbot from
"answers questions" into "does things." Each tool has:
  - an OpenAI-format function schema (also used, reshaped, for Anthropic)
  - an async executor that does the real work (DB writes, PDF
    generation, WhatsApp document sends) and returns a short text
    result the model uses to compose its final reply to the customer.

IMPLEMENTED_TOOLS is the source of truth for what's actually wired —
AiSettings.tools may have OTHER keys toggled on (legacy placeholders
like "create_order", "refund" from the original settings UI) that
simply won't appear in a model's tool list because they're not here
yet. Adding a new real tool = write the executor, add its schema,
register it below; nothing else in the pipeline needs to change.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

logger = get_logger(__name__)


# ─── Tool schemas (OpenAI function-calling format) ──────────────────

TOOL_SCHEMAS: dict[str, dict] = {
    "generate_itinerary_pdf": {
        "type": "function",
        "function": {
            "name": "generate_itinerary_pdf",
            "description": (
                "Generate and send a professionally formatted day-by-day travel "
                "itinerary PDF to the customer on WhatsApp. Use this once you have "
                "enough detail (destination, trip length, and preferences/budget) "
                "to plan a real itinerary — plan it yourself using your travel "
                "expertise, then call this tool with the full day-by-day plan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "destination": {"type": "string", "description": "Trip destination, e.g. 'Manali, Himachal Pradesh'"},
                    "duration_label": {"type": "string", "description": "e.g. '4 Days / 3 Nights'"},
                    "days": {
                        "type": "array",
                        "description": "One entry per day of the trip, in order.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "day_number": {"type": "integer"},
                                "title": {"type": "string", "description": "Short theme for the day, e.g. 'Arrival & City Tour'"},
                                "activities": {"type": "array", "items": {"type": "string"}},
                                "notes": {"type": "string", "description": "Optional tip or caveat for the day"},
                            },
                            "required": ["day_number", "title", "activities"],
                        },
                    },
                    "budget_note": {"type": "string", "description": "Rough per-person budget estimate with a one-line breakdown"},
                },
                "required": ["destination", "duration_label", "days"],
            },
        },
    },
    "generate_quotation_pdf": {
        "type": "function",
        "function": {
            "name": "generate_quotation_pdf",
            "description": (
                "Generate and send a professional price quotation PDF to the "
                "customer on WhatsApp, based on what they've asked for. Use your "
                "business expertise to itemize realistic line items and pricing."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "subject": {"type": "string", "description": "Short title for the quotation, e.g. '2BHK Interior Design'"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": {"type": "string"},
                                "qty": {"type": "integer"},
                                "unit_price": {"type": "number", "description": "Price per unit in INR (whole rupees)"},
                            },
                            "required": ["description", "qty", "unit_price"],
                        },
                    },
                    "notes": {"type": "string", "description": "Payment terms, validity, or other fine print"},
                    "valid_until": {"type": "string", "description": "e.g. '15 Aug 2026' — optional"},
                },
                "required": ["subject", "items"],
            },
        },
    },
    "search_product": {
        "type": "function",
        "function": {
            "name": "search_product",
            "description": "Search this business's real product catalogue by name/keyword to check availability and price before recommending something to the customer.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Product name or keyword to search for"}},
                "required": ["query"],
            },
        },
    },
    "book_appointment": {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": "Record an appointment/booking REQUEST for the customer — creates a task for a human team member to confirm the exact slot (this does not guarantee the slot; a human confirms it).",
            "parameters": {
                "type": "object",
                "properties": {
                    "purpose": {"type": "string", "description": "What the appointment is for, e.g. 'Property site visit', 'Dental checkup'"},
                    "preferred_time": {"type": "string", "description": "Customer's preferred date/time, in their own words"},
                },
                "required": ["purpose", "preferred_time"],
            },
        },
    },
    "crm_update": {
        "type": "function",
        "function": {
            "name": "crm_update",
            "description": "Save/update this customer as a lead in the CRM with what you've learned about their interest — use this whenever the customer shows real buying intent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "interest_summary": {"type": "string", "description": "One-line summary of what they're interested in"},
                    "estimated_value_inr": {"type": "integer", "description": "Rough deal size in INR if mentioned/inferable, else omit"},
                },
                "required": ["interest_summary"],
            },
        },
    },
    "human_handoff": {
        "type": "function",
        "function": {
            "name": "human_handoff",
            "description": "Hand this conversation over to a human team member — use when the customer explicitly asks for a human, is frustrated, or has a question outside what you can confidently handle.",
            "parameters": {
                "type": "object",
                "properties": {"reason": {"type": "string", "description": "Why you're handing off, for the human agent's context"}},
                "required": ["reason"],
            },
        },
    },
}


# ─── Executors ────────────────────────────────────────────────────
# Every executor has the same signature: (db, workspace_id, conversation_id,
# contact_id, ctx, **args) -> str (short result text fed back to the model).
# ctx carries {"token", "phone_number_id", "to"} for tools that send
# WhatsApp messages/documents directly.

async def _exec_generate_itinerary_pdf(db, workspace_id, conversation_id, contact_id, ctx, **args) -> str:
    from app.services.pdf_documents import build_itinerary_pdf
    from app.services.conversation_service import send_whatsapp_document
    from app.models.whatsapp import WhatsAppAccount

    account = (await db.execute(select(WhatsAppAccount).where(WhatsAppAccount.workspace_id == workspace_id))).scalar_one_or_none()
    business_name = account.verified_business_name if account and account.verified_business_name else "Us"

    pdf_bytes = build_itinerary_pdf(
        business_name=business_name,
        destination=args["destination"],
        duration_label=args["duration_label"],
        days=args["days"],
        budget_note=args.get("budget_note"),
    )
    filename = f"Itinerary_{args['destination'].split(',')[0].strip().replace(' ', '_')}.pdf"
    await send_whatsapp_document(
        token=ctx["token"], phone_number_id=ctx["phone_number_id"], to=ctx["to"],
        file_bytes=pdf_bytes, filename=filename,
        caption=f"Your {args['duration_label']} {args['destination']} itinerary 🧳",
    )
    return f"Itinerary PDF for {args['destination']} ({args['duration_label']}) was generated and sent to the customer on WhatsApp successfully."


async def _exec_generate_quotation_pdf(db, workspace_id, conversation_id, contact_id, ctx, **args) -> str:
    from app.services.pdf_documents import build_quotation_pdf
    from app.services.conversation_service import send_whatsapp_document
    from app.models.whatsapp import WhatsAppAccount
    from app.models.contact import Contact

    account = (await db.execute(select(WhatsAppAccount).where(WhatsAppAccount.workspace_id == workspace_id))).scalar_one_or_none()
    business_name = account.verified_business_name if account and account.verified_business_name else "Us"
    contact = (await db.execute(select(Contact).where(Contact.id == contact_id))).scalar_one_or_none()
    client_name = contact.name if contact and contact.name else "Customer"

    pdf_bytes = build_quotation_pdf(
        business_name=business_name, client_name=client_name, subject=args["subject"],
        items=args["items"], notes=args.get("notes"), valid_until=args.get("valid_until"),
    )
    filename = f"Quotation_{args['subject'][:30].replace(' ', '_')}.pdf"
    await send_whatsapp_document(
        token=ctx["token"], phone_number_id=ctx["phone_number_id"], to=ctx["to"],
        file_bytes=pdf_bytes, filename=filename,
        caption=f"Your quotation — {args['subject']} 📄",
    )
    total = sum(i.get("qty", 1) * i.get("unit_price", 0) for i in args["items"])
    return f"Quotation PDF for '{args['subject']}' (total ₹{total:,.0f}) was generated and sent to the customer on WhatsApp successfully."


async def _exec_search_product(db, workspace_id, conversation_id, contact_id, ctx, **args) -> str:
    from app.models.catalogue import Product

    query = args["query"]
    rows = (await db.execute(
        select(Product)
        .where(Product.workspace_id == workspace_id, Product.is_active == True)  # noqa: E712
        .where(Product.name.ilike(f"%{query}%"))
        .limit(5)
    )).scalars().all()

    if not rows:
        return f"No products found matching '{query}' in the catalogue. Tell the customer this item isn't currently available, and ask if they'd like something similar."

    lines = [f"- {p.name}: ₹{p.price / 100:,.0f}" + (f" ({p.stock} in stock)" if p.stock is not None else "") for p in rows]
    return "Found in catalogue:\n" + "\n".join(lines)


async def _exec_book_appointment(db, workspace_id, conversation_id, contact_id, ctx, **args) -> str:
    from app.models.crm import CRMTask

    task = CRMTask(
        workspace_id=workspace_id,
        title=f"Appointment request: {args['purpose']}",
        description=f"Customer requested: {args['purpose']}\nPreferred time: {args['preferred_time']}\n(Booked via AI Chatbot — confirm the exact slot with the customer.)",
        status="open",
    )
    db.add(task)
    await db.flush()
    return f"Appointment request for '{args['purpose']}' at '{args['preferred_time']}' has been logged for the team to confirm. Tell the customer their request is noted and someone will confirm the exact time shortly."


async def _exec_crm_update(db, workspace_id, conversation_id, contact_id, ctx, **args) -> str:
    from app.models.crm import CRMLead

    existing = (await db.execute(
        select(CRMLead).where(CRMLead.workspace_id == workspace_id, CRMLead.contact_id == contact_id)
    )).scalar_one_or_none()

    value = args.get("estimated_value_inr")
    if existing:
        existing.notes = args["interest_summary"]
        if value:
            existing.value = value
    else:
        db.add(CRMLead(
            workspace_id=workspace_id, contact_id=contact_id, title=args["interest_summary"][:255],
            stage="new", value=value, notes=args["interest_summary"],
        ))
    await db.flush()
    return "Lead saved to CRM."


async def _exec_human_handoff(db, workspace_id, conversation_id, contact_id, ctx, **args) -> str:
    from app.models.messaging import Conversation

    conv = (await db.execute(select(Conversation).where(Conversation.id == conversation_id))).scalar_one_or_none()
    if conv:
        conv.handling = "requested"
        await db.flush()
    return f"Conversation flagged for human takeover (reason: {args.get('reason', 'not specified')}). Tell the customer a team member will join the chat shortly, and keep your reply brief and reassuring."


IMPLEMENTED_TOOLS = {
    "generate_itinerary_pdf": _exec_generate_itinerary_pdf,
    "generate_quotation_pdf": _exec_generate_quotation_pdf,
    "search_product": _exec_search_product,
    "book_appointment": _exec_book_appointment,
    "crm_update": _exec_crm_update,
    "human_handoff": _exec_human_handoff,
}


def build_active_tool_schemas(enabled_tool_keys: set[str]) -> list[dict]:
    """Only tools that are BOTH toggled on in settings AND actually
    implemented get offered to the model — an enabled-but-unimplemented
    legacy toggle (e.g. "create_order") is silently a no-op rather
    than confusing the model into promising something that won't happen."""
    return [TOOL_SCHEMAS[k] for k in enabled_tool_keys if k in TOOL_SCHEMAS and k in IMPLEMENTED_TOOLS]


async def execute_tool(
    tool_name: str, args: dict,
    db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID,
    contact_id: uuid.UUID, ctx: dict,
) -> str:
    executor = IMPLEMENTED_TOOLS.get(tool_name)
    if executor is None:
        return f"Tool '{tool_name}' is not available."
    try:
        return await executor(db, workspace_id, conversation_id, contact_id, ctx, **args)
    except Exception as e:
        logger.error("ai_tool_execution_failed", tool=tool_name, error=str(e))
        return f"Something went wrong while trying to {tool_name.replace('_', ' ')} — let the customer know you'll follow up, and suggest a human agent can help."