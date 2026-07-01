"""
Notification preferences endpoints — Phase 13. Mounted at /api/v1/notifications.

  GET   /notifications/preferences
  PATCH /notifications/preferences
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.workspace import WorkspaceContext, get_workspace_context
from app.core.database import get_db
from app.schemas.notification import NotificationPreferences, UpdateNotificationPreferencesRequest
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/preferences", response_model=NotificationPreferences)
async def get_preferences(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.get_preferences(db, ctx.workspace.id)


@router.patch("/preferences", response_model=NotificationPreferences)
async def update_preferences(
    payload: UpdateNotificationPreferencesRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.update_preferences(db, ctx.workspace.id, payload)
