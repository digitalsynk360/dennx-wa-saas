"""
Billing & Usage endpoints — Phase 13. Mounted at /api/v1/billing.

  GET  /billing/subscription   current plan + period
  POST /billing/change-plan    switch plan (self-serve, no payment gateway in this phase)
  GET  /billing/invoices       invoice history
  GET  /billing/usage          messages/seats used vs quota
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.schemas.billing import (
    ChangePlanRequest,
    InvoiceListResponse,
    InvoiceResponse,
    SubscriptionResponse,
    UsageResponse,
)
from app.services import billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    ctx: WorkspaceContext = Depends(require_permission("billing.manage")),
    db: AsyncSession = Depends(get_db),
):
    sub = await billing_service.get_or_create_subscription(db, ctx.workspace.id)
    return SubscriptionResponse.model_validate(sub)


@router.post("/change-plan", response_model=SubscriptionResponse)
async def change_plan(
    payload: ChangePlanRequest,
    ctx: WorkspaceContext = Depends(require_permission("billing.manage")),
    db: AsyncSession = Depends(get_db),
):
    sub = await billing_service.change_plan(db, ctx.workspace.id, payload.plan)
    return SubscriptionResponse.model_validate(sub)


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    ctx: WorkspaceContext = Depends(require_permission("billing.manage")),
    db: AsyncSession = Depends(get_db),
):
    invoices = await billing_service.list_invoices(db, ctx.workspace.id)
    return InvoiceListResponse(items=[InvoiceResponse.model_validate(i) for i in invoices], total=len(invoices))


@router.get("/usage", response_model=UsageResponse)
async def get_usage(
    ctx: WorkspaceContext = Depends(require_permission("billing.manage")),
    db: AsyncSession = Depends(get_db),
):
    usage = await billing_service.get_usage(db, ctx.workspace.id)
    return UsageResponse(**usage)
