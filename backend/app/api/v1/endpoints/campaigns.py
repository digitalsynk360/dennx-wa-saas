"""
Campaign endpoints — Phase 7. Mounted at /api/v1/campaigns.

  GET    /campaigns               list (paginated)
  POST   /campaigns               create (draft or scheduled)
  GET    /campaigns/{id}          detail with recipients
  POST   /campaigns/{id}/launch    start sending now
  POST   /campaigns/{id}/pause     pause a running campaign
  POST   /campaigns/{id}/cancel    cancel a campaign
"""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.schemas.campaign import (
    CampaignDetailResponse,
    CampaignListResponse,
    CampaignResponse,
    CreateCampaignRequest,
)
from app.services import campaign_dispatcher

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=CampaignListResponse)
async def list_campaigns(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    ctx: WorkspaceContext = Depends(require_permission("campaigns.read")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await campaign_dispatcher.list_campaigns(db, ctx.workspace.id, page, page_size)
    return CampaignListResponse(
        items=[CampaignResponse.model_validate(c) for c in items],
        total=total, page=page, page_size=page_size,
    )


@router.post("", response_model=CampaignResponse, status_code=201)
async def create_campaign(
    payload: CreateCampaignRequest,
    ctx: WorkspaceContext = Depends(require_permission("campaigns.write")),
    db: AsyncSession = Depends(get_db),
):
    campaign = await campaign_dispatcher.create_campaign(db, ctx.workspace.id, payload, ctx.user.id)
    return CampaignResponse.model_validate(campaign)


@router.get("/{campaign_id}", response_model=CampaignDetailResponse)
async def get_campaign(
    campaign_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("campaigns.read")),
    db: AsyncSession = Depends(get_db),
):
    campaign = await campaign_dispatcher.get_campaign_detail(db, ctx.workspace.id, campaign_id)
    detail = CampaignDetailResponse.model_validate(campaign)

    # Enrich recipients with contact name/phone
    from sqlalchemy import select as sa_select
    from app.models.contact import Contact
    contact_ids = [r.contact_id for r in detail.recipients]
    if contact_ids:
        res = await db.execute(
            sa_select(Contact.id, Contact.name, Contact.phone).where(Contact.id.in_(contact_ids))
        )
        cmap = {row[0]: (row[1], row[2]) for row in res.all()}
        for r in detail.recipients:
            info = cmap.get(r.contact_id)
            if info:
                r.contact_name, r.contact_phone = info
    return detail


@router.post("/{campaign_id}/launch", response_model=CampaignResponse)
async def launch_campaign(
    campaign_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("campaigns.write")),
    db: AsyncSession = Depends(get_db),
):
    campaign = await campaign_dispatcher.launch_campaign(db, ctx.workspace.id, campaign_id)
    return CampaignResponse.model_validate(campaign)


@router.post("/{campaign_id}/pause", response_model=CampaignResponse)
async def pause_campaign(
    campaign_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("campaigns.write")),
    db: AsyncSession = Depends(get_db),
):
    campaign = await campaign_dispatcher.pause_campaign(db, ctx.workspace.id, campaign_id)
    return CampaignResponse.model_validate(campaign)


@router.post("/{campaign_id}/cancel", response_model=CampaignResponse)
async def cancel_campaign(
    campaign_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(require_permission("campaigns.write")),
    db: AsyncSession = Depends(get_db),
):
    campaign = await campaign_dispatcher.cancel_campaign(db, ctx.workspace.id, campaign_id)
    return CampaignResponse.model_validate(campaign)