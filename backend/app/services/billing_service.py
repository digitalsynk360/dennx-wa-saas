"""
Billing & Usage service — Phase 13.

No real payment gateway is wired in this phase (no Stripe/Razorpay
key in scope) — change_plan() updates the local Subscription record
directly, which is enough for self-serve plan switching on free/trial
tiers. A "Connect Stripe" step is a clear extension point for a later
phase if paid billing is required.
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

PLAN_QUOTAS = {
    "free": {"messages": 1000, "seats": 2},
    "starter": {"messages": 10000, "seats": 5},
    "growth": {"messages": 50000, "seats": 15},
    "enterprise": {"messages": None, "seats": None},  # unlimited
}


async def get_or_create_subscription(db: AsyncSession, workspace_id: uuid.UUID) -> Subscription:
    repo = SubscriptionRepository(db)
    sub = await repo.get_by_workspace(workspace_id)
    if sub is None:
        now = datetime.now(timezone.utc)
        sub = Subscription(
            workspace_id=workspace_id,
            plan="free",
            status="active",
            monthly_message_quota=PLAN_QUOTAS["free"]["messages"],
            seats=PLAN_QUOTAS["free"]["seats"],
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        await repo.add(sub)
    return sub


async def change_plan(db: AsyncSession, workspace_id: uuid.UUID, plan: str) -> Subscription:
    if plan not in PLAN_QUOTAS:
        raise HTTPException(status_code=400, detail=f"Unknown plan '{plan}'.")

    sub = await get_or_create_subscription(db, workspace_id)
    sub.plan = plan
    sub.monthly_message_quota = PLAN_QUOTAS[plan]["messages"]
    sub.seats = PLAN_QUOTAS[plan]["seats"] or sub.seats
    await db.flush()
    return sub


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
