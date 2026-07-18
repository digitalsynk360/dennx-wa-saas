"""
Analytics endpoints — Phase 12. Mounted at /api/v1/analytics.

  GET /analytics/overview?period_days=30
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, require_permission
from app.core.database import get_db
from app.schemas.analytics import AnalyticsOverviewResponse
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_overview(
    period_days: int = Query(30, ge=1, le=365),
    ctx: WorkspaceContext = Depends(require_permission("analytics.read")),
    db: AsyncSession = Depends(get_db),
):
    data = await analytics_service.get_overview(db, ctx.workspace.id, period_days)
    return AnalyticsOverviewResponse(**data)

@router.get("/dashboard")
async def get_dashboard(
    days: int = Query(7, ge=1, le=90),
    ctx: WorkspaceContext = Depends(require_permission("analytics.read")),
    db: AsyncSession = Depends(get_db),
):
    """Real metrics for Dashboard page."""
    return await analytics_service.get_dashboard_overview(db, ctx.workspace.id, days)