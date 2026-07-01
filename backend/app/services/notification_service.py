"""
Notification preferences service — Phase 13.

Preferences are stored inside Workspace.settings (JSONB) under the
"notifications" key rather than a dedicated table, since they're a
small, rarely-queried per-workspace blob — consistent with how the
Workspace model already uses `settings` for other workspace-level
config.
"""
import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import Workspace
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.notification import NotificationPreferences, UpdateNotificationPreferencesRequest

DEFAULTS = NotificationPreferences().model_dump()


async def get_preferences(db: AsyncSession, workspace_id: uuid.UUID) -> NotificationPreferences:
    repo = WorkspaceRepository(db)
    workspace = await repo.get_by_id(workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    stored = workspace.settings.get("notifications", {})
    merged = {**DEFAULTS, **stored}
    return NotificationPreferences(**merged)


async def update_preferences(
    db: AsyncSession, workspace_id: uuid.UUID, payload: UpdateNotificationPreferencesRequest
) -> NotificationPreferences:
    repo = WorkspaceRepository(db)
    workspace = await repo.get_by_id(workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    current = {**DEFAULTS, **workspace.settings.get("notifications", {})}
    updates = payload.model_dump(exclude_none=True)
    current.update(updates)

    workspace.settings = {**workspace.settings, "notifications": current}
    await db.flush()
    return NotificationPreferences(**current)
