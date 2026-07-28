"""
Billing & Usage service — plan catalogue, GST-aware pricing, trial
handling, and superadmin plan management (assign / renew / edit).

No real payment gateway is wired (no Stripe/Razorpay key in scope) —
plan assignment happens through the Superadmin panel, matching how
users themselves are created (no self-serve signup on this platform;
see app/api/v1/endpoints/demo.py for the public-facing lead-capture
flow that replaces open signup).
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import Invoice, Subscription
from app.models.identity import WorkspaceMember
from app.models.messaging import Message
from app.repositories.billing_repository import InvoiceRepository, SubscriptionRepository

GST_PERCENT = 18

# All prices in paise (smallest currency unit) — matches Invoice.amount's
# existing convention. Divide by 100 for rupees.
PLAN_CATALOG: dict[str, dict] = {
    "trial": {
        "label": "Free Trial",
        "monthly_price_paise": 0,
        "duration_days": 3,
        "messages": 500,
        "contacts": 500,
        "seats": 3,
        "whatsapp_numbers": 1,
        "ai_chatbot": True,  # full-feature trial so prospects see everything
    },
    "starter": {
        "label": "Starter",
        "monthly_price_paise": 154_900,   # ₹1,549
        "messages": 5_000,
        "contacts": 3_000,
        "seats": 3,
        "whatsapp_numbers": 1,
        "ai_chatbot": False,
    },
    "growth": {
        "label": "Growth",
        "monthly_price_paise": 359_900,   # ₹3,599
        "messages": 25_000,
        "contacts": 15_000,
        "seats": 8,
        "whatsapp_numbers": 2,
        "ai_chatbot": True,
    },
    "pro": {
        "label": "Pro",
        "monthly_price_paise": 699_900,   # ₹6,999
        "messages": None,  # fair-use unlimited
        "contacts": 75_000,
        "seats": 20,
        "whatsapp_numbers": 5,
        "ai_chatbot": True,
    },
    "enterprise": {
        "label": "Enterprise",
        "monthly_price_paise": None,  # custom — set manually per workspace by superadmin
        "messages": None,
        "contacts": None,
        "seats": None,
        "whatsapp_numbers": None,
        "ai_chatbot": True,
    },
}

# Discount applied to the monthly price when billing less frequently
# than monthly (matches the published pricing PDF).
BILLING_CYCLE_DISCOUNT = {
    "monthly": 0.0,
    "quarterly": 0.12,
    "yearly": 0.25,
}
BILLING_CYCLE_MONTHS = {"monthly": 1, "quarterly": 3, "yearly": 12, "trial": 0}

ADDON_PRICES_PAISE = {
    "extra_seat": 29_900,             # ₹299 / seat / month
    "extra_number": 119_900,          # ₹1,199 / number / month
    "extra_contacts_block": 23_900,   # ₹239 / +5,000 contacts / month
    "ai_chatbot": 179_900,            # ₹1,799 / month (Starter add-on)
    "priority_support": 94_900,       # ₹949 / month
}


def compute_price(plan: str, billing_cycle: str, addons: dict, custom_monthly_paise: int | None = None) -> dict:
    """Returns {base_price_paise, addons_price_paise, subtotal_paise,
    gst_paise, total_paise, months} for one billing period — the same
    math used for both the superadmin preview and the invoice."""
    catalog = PLAN_CATALOG.get(plan)
    if catalog is None:
        raise HTTPException(status_code=400, detail=f"Unknown plan '{plan}'.")

    months = BILLING_CYCLE_MONTHS.get(billing_cycle, 1)

    if plan == "trial":
        return {
            "base_price_paise": 0, "addons_price_paise": 0, "subtotal_paise": 0,
            "gst_paise": 0, "total_paise": 0, "months": 0,
        }

    monthly = catalog["monthly_price_paise"] if plan != "enterprise" else (custom_monthly_paise or 0)
    if monthly is None:
        monthly = custom_monthly_paise or 0

    discount = BILLING_CYCLE_DISCOUNT.get(billing_cycle, 0.0)
    discounted_monthly = round(monthly * (1 - discount))
    base_total = discounted_monthly * months

    addons_monthly = 0
    if addons.get("extra_seats"):
        addons_monthly += ADDON_PRICES_PAISE["extra_seat"] * int(addons["extra_seats"])
    if addons.get("extra_numbers"):
        addons_monthly += ADDON_PRICES_PAISE["extra_number"] * int(addons["extra_numbers"])
    if addons.get("extra_contacts_blocks"):
        addons_monthly += ADDON_PRICES_PAISE["extra_contacts_block"] * int(addons["extra_contacts_blocks"])
    if addons.get("ai_chatbot"):
        addons_monthly += ADDON_PRICES_PAISE["ai_chatbot"]
    if addons.get("priority_support"):
        addons_monthly += ADDON_PRICES_PAISE["priority_support"]
    addons_total = addons_monthly * months

    subtotal = base_total + addons_total
    gst = round(subtotal * GST_PERCENT / 100)
    total = subtotal + gst

    return {
        "base_price_paise": base_total, "addons_price_paise": addons_total,
        "subtotal_paise": subtotal, "gst_paise": gst, "total_paise": total, "months": months,
    }


def _limits_for(plan: str, addons: dict) -> dict:
    catalog = PLAN_CATALOG[plan]
    seats = catalog["seats"]
    if seats is not None:
        seats += int(addons.get("extra_seats", 0))
    numbers = catalog["whatsapp_numbers"]
    if numbers is not None:
        numbers += int(addons.get("extra_numbers", 0))
    contacts = catalog["contacts"]
    if contacts is not None:
        contacts += int(addons.get("extra_contacts_blocks", 0)) * 5000
    return {
        "seats": seats, "whatsapp_number_limit": numbers, "contact_limit": contacts,
        "monthly_message_quota": catalog["messages"],
        "ai_chatbot_enabled": catalog["ai_chatbot"] or bool(addons.get("ai_chatbot")),
    }


async def get_or_create_subscription(db: AsyncSession, workspace_id: uuid.UUID) -> Subscription:
    repo = SubscriptionRepository(db)
    sub = await repo.get_by_workspace(workspace_id)
    if sub is None:
        sub = await start_trial(db, workspace_id)
    return sub


async def start_trial(db: AsyncSession, workspace_id: uuid.UUID) -> Subscription:
    """3-day free trial — every workspace gets exactly one, ever."""
    repo = SubscriptionRepository(db)
    existing = await repo.get_by_workspace(workspace_id)
    if existing is not None and existing.trial_used and existing.plan == "trial":
        raise HTTPException(status_code=400, detail="Trial already used for this workspace.")

    now = datetime.now(timezone.utc)
    limits = _limits_for("trial", {})
    sub = Subscription(
        workspace_id=workspace_id, plan="trial", billing_cycle="trial", status="active",
        current_period_start=now,
        current_period_end=now + timedelta(days=PLAN_CATALOG["trial"]["duration_days"]),
        trial_used=True, base_price_paise=0, gst_percent=GST_PERCENT,
        **limits,
    )
    await repo.add(sub)
    return sub


async def assign_plan(
    db: AsyncSession, workspace_id: uuid.UUID, plan: str, billing_cycle: str,
    addons: dict | None = None, custom_monthly_paise: int | None = None,
) -> Subscription:
    """Superadmin: set/replace a workspace's plan outright — used both
    for the initial paid-plan assignment and for switching plans."""
    addons = addons or {}
    if plan not in PLAN_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown plan '{plan}'.")
    if plan == "enterprise" and not custom_monthly_paise:
        raise HTTPException(status_code=400, detail="custom_monthly_paise is required for Enterprise plan.")

    sub = await get_or_create_subscription(db, workspace_id)
    pricing = compute_price(plan, billing_cycle, addons, custom_monthly_paise)
    limits = _limits_for(plan, addons)
    now = datetime.now(timezone.utc)
    months = BILLING_CYCLE_MONTHS.get(billing_cycle, 1)

    sub.plan = plan
    sub.billing_cycle = billing_cycle
    sub.status = "active"
    sub.addons = addons
    sub.base_price_paise = pricing["base_price_paise"] + pricing["addons_price_paise"]
    sub.gst_percent = GST_PERCENT
    sub.current_period_start = now
    sub.current_period_end = now + timedelta(days=30 * months) if months else None
    for k, v in limits.items():
        setattr(sub, k, v)
    await db.flush()

    await _create_invoice(db, sub, pricing, note=f"Plan assigned: {PLAN_CATALOG[plan]['label']} ({billing_cycle})")
    return sub


async def renew_subscription(db: AsyncSession, workspace_id: uuid.UUID) -> Subscription:
    """Superadmin: extend the CURRENT plan/cycle/add-ons by one more
    billing period from today — for when a customer pays for another
    round without changing anything."""
    sub = await get_or_create_subscription(db, workspace_id)
    if sub.plan in ("trial",):
        raise HTTPException(status_code=400, detail="Trial cannot be renewed — assign a paid plan instead.")

    pricing = compute_price(sub.plan, sub.billing_cycle, sub.addons, sub.base_price_paise if sub.plan == "enterprise" else None)
    months = BILLING_CYCLE_MONTHS.get(sub.billing_cycle, 1)
    now = datetime.now(timezone.utc)
    # Extend from current period_end if it's still in the future
    # (renewing early doesn't lose remaining days); otherwise from now.
    base = sub.current_period_end if sub.current_period_end and sub.current_period_end > now else now

    sub.status = "active"
    sub.current_period_start = base
    sub.current_period_end = base + timedelta(days=30 * months)
    await db.flush()

    await _create_invoice(db, sub, pricing, note=f"Renewal: {PLAN_CATALOG[sub.plan]['label']} ({sub.billing_cycle})")
    return sub


async def edit_subscription(
    db: AsyncSession, workspace_id: uuid.UUID,
    seats: int | None = None, contact_limit: int | None = None,
    whatsapp_number_limit: int | None = None, monthly_message_quota: int | None = None,
    ai_chatbot_enabled: bool | None = None, current_period_end: datetime | None = None,
    status: str | None = None,
) -> Subscription:
    """Superadmin: manual override of any limit/date/status — for
    one-off exceptions (goodwill extension, custom Enterprise limits,
    manually marking a subscription cancelled, etc.) without having to
    go through the standard plan catalogue."""
    sub = await get_or_create_subscription(db, workspace_id)
    if seats is not None:
        sub.seats = seats
    if contact_limit is not None:
        sub.contact_limit = contact_limit
    if whatsapp_number_limit is not None:
        sub.whatsapp_number_limit = whatsapp_number_limit
    if monthly_message_quota is not None:
        sub.monthly_message_quota = monthly_message_quota
    if ai_chatbot_enabled is not None:
        sub.ai_chatbot_enabled = ai_chatbot_enabled
    if current_period_end is not None:
        sub.current_period_end = current_period_end
    if status is not None:
        sub.status = status
    await db.flush()
    return sub


async def change_plan(db: AsyncSession, workspace_id: uuid.UUID, plan: str) -> Subscription:
    """Legacy self-serve endpoint — kept only for backward
    compatibility with any existing calls; plan changes are now
    expected to go through the superadmin (assign_plan)."""
    return await assign_plan(db, workspace_id, plan, "monthly", {})


async def _create_invoice(db: AsyncSession, sub: Subscription, pricing: dict, note: str) -> Invoice:
    repo = InvoiceRepository(db)
    # Random suffix (not just date+workspace) — a workspace can get
    # more than one invoice on the same day (e.g. assign then renew
    # in quick succession, or an admin correcting a mistake), and the
    # date+workspace-prefix alone would collide against the unique
    # constraint on Invoice.number.
    import secrets
    suffix = secrets.token_hex(3).upper()
    number = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(sub.workspace_id)[:8].upper()}-{suffix}"
    invoice = Invoice(
        workspace_id=sub.workspace_id, subscription_id=sub.id, number=number,
        subtotal=pricing["subtotal_paise"], gst_amount=pricing["gst_paise"], amount=pricing["total_paise"],
        currency="INR", status="paid" if pricing["total_paise"] > 0 else "n/a",
        line_items=[{"description": note, "amount_paise": pricing["total_paise"]}],
        paid_at=datetime.now(timezone.utc) if pricing["total_paise"] > 0 else None,
    )
    await repo.add(invoice)
    return invoice


async def list_invoices(db: AsyncSession, workspace_id: uuid.UUID) -> list[Invoice]:
    repo = InvoiceRepository(db)
    return await repo.list_by_workspace(workspace_id)


async def get_usage(db: AsyncSession, workspace_id: uuid.UUID) -> dict:
    sub = await get_or_create_subscription(db, workspace_id)

    period_start = sub.current_period_start or (datetime.now(timezone.utc) - timedelta(days=30))
    messages_used = (await db.execute(
        select(func.count())
        .where(Message.workspace_id == workspace_id)
        .where(Message.direction == "outbound")
        .where(Message.created_at >= period_start)
    )).scalar_one()

    seats_used = (await db.execute(
        select(func.count()).where(WorkspaceMember.workspace_id == workspace_id)
    )).scalar_one()

    return {
        "messages_used_this_period": messages_used,
        "messages_quota": sub.monthly_message_quota,
        "seats_used": seats_used,
        "seats_quota": sub.seats,
    }


def is_expired(sub: Subscription) -> bool:
    if sub.status != "active":
        return True
    if sub.current_period_end is None:
        return False  # Enterprise / no end date set = never expires
    return datetime.now(timezone.utc) > sub.current_period_end