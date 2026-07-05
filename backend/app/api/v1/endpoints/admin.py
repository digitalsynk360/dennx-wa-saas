"""
Super Admin (platform-level) endpoints. Mounted at /api/v1/admin.
Every route requires User.is_superuser = true.

  GET   /admin/overview            platform-wide stats
  GET   /admin/workspaces          all workspaces + usage
  PATCH /admin/workspaces/{id}     change plan / activate-deactivate
  GET   /admin/users               all users
  PATCH /admin/users/{id}          block / unblock / grant superuser
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.core.database import get_db
from app.models.contact import Contact
from app.models.identity import User, Workspace, WorkspaceMember
from app.models.messaging import Conversation, Message
from app.models.whatsapp import WhatsAppAccount

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_superuser(user: User = Depends(get_current_user)) -> User:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin only.")
    return user


# ─── Schemas ─────────────────────────────────────────────────────────────

class PlatformOverview(BaseModel):
    total_workspaces: int
    active_workspaces: int
    total_users: int
    total_contacts: int
    messages_30d: int
    connected_whatsapp: int


class AdminWorkspaceRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    plan: str
    is_active: bool
    created_at: datetime
    members: int = 0
    contacts: int = 0
    messages_30d: int = 0


class AdminUserRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str
    email: str
    is_active: bool
    is_superuser: bool
    created_at: datetime
    workspaces: int = 0


class UpdateWorkspaceAdmin(BaseModel):
    plan: str | None = None
    is_active: bool | None = None


class UpdateUserAdmin(BaseModel):
    is_active: bool | None = None
    is_superuser: bool | None = None


# ─── Routes ──────────────────────────────────────────────────────────────

@router.get("/overview", response_model=PlatformOverview)
async def platform_overview(
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)

    async def scalar(stmt) -> int:
        return (await db.execute(stmt)).scalar() or 0

    return PlatformOverview(
        total_workspaces=await scalar(select(func.count(Workspace.id))),
        active_workspaces=await scalar(
            select(func.count(Workspace.id)).where(Workspace.is_active == True)  # noqa: E712
        ),
        total_users=await scalar(select(func.count(User.id))),
        total_contacts=await scalar(select(func.count(Contact.id))),
        messages_30d=await scalar(
            select(func.count(Message.id)).where(Message.created_at >= month_ago)
        ),
        connected_whatsapp=await scalar(select(func.count(WhatsAppAccount.id))),
    )


@router.get("/workspaces", response_model=list[AdminWorkspaceRow])
async def list_all_workspaces(
    search: str = Query("", max_length=100),
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)

    members_sq = (
        select(WorkspaceMember.workspace_id, func.count().label("n"))
        .group_by(WorkspaceMember.workspace_id).subquery()
    )
    contacts_sq = (
        select(Contact.workspace_id, func.count().label("n"))
        .group_by(Contact.workspace_id).subquery()
    )
    msgs_sq = (
        select(Message.workspace_id, func.count().label("n"))
        .where(Message.created_at >= month_ago)
        .group_by(Message.workspace_id).subquery()
    )

    stmt = (
        select(
            Workspace,
            func.coalesce(members_sq.c.n, 0),
            func.coalesce(contacts_sq.c.n, 0),
            func.coalesce(msgs_sq.c.n, 0),
        )
        .outerjoin(members_sq, members_sq.c.workspace_id == Workspace.id)
        .outerjoin(contacts_sq, contacts_sq.c.workspace_id == Workspace.id)
        .outerjoin(msgs_sq, msgs_sq.c.workspace_id == Workspace.id)
        .order_by(Workspace.created_at.desc())
        .limit(200)
    )
    if search:
        stmt = stmt.where(Workspace.name.ilike(f"%{search}%"))

    rows = (await db.execute(stmt)).all()
    out: list[AdminWorkspaceRow] = []
    for ws, members, contacts, msgs in rows:
        row = AdminWorkspaceRow.model_validate(ws)
        row.members, row.contacts, row.messages_30d = members, contacts, msgs
        out.append(row)
    return out


@router.patch("/workspaces/{workspace_id}", response_model=AdminWorkspaceRow)
async def update_workspace_admin(
    workspace_id: uuid.UUID,
    payload: UpdateWorkspaceAdmin,
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    ws = (await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )).scalar_one_or_none()
    if ws is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    if payload.plan is not None:
        ws.plan = payload.plan
    if payload.is_active is not None:
        ws.is_active = payload.is_active
    await db.flush()
    return AdminWorkspaceRow.model_validate(ws)


@router.get("/users", response_model=list[AdminUserRow])
async def list_all_users(
    search: str = Query("", max_length=100),
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    ws_sq = (
        select(WorkspaceMember.user_id, func.count().label("n"))
        .group_by(WorkspaceMember.user_id).subquery()
    )
    stmt = (
        select(User, func.coalesce(ws_sq.c.n, 0))
        .outerjoin(ws_sq, ws_sq.c.user_id == User.id)
        .order_by(User.created_at.desc())
        .limit(200)
    )
    if search:
        stmt = stmt.where(
            User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%")
        )
    rows = (await db.execute(stmt)).all()
    out: list[AdminUserRow] = []
    for user, n in rows:
        row = AdminUserRow.model_validate(user)
        row.workspaces = n
        out.append(row)
    return out


@router.patch("/users/{user_id}", response_model=AdminUserRow)
async def update_user_admin(
    user_id: uuid.UUID,
    payload: UpdateUserAdmin,
    actor: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    if user_id == actor.id and payload.is_superuser is False:
        raise HTTPException(status_code=400, detail="Apna hi superadmin nahi hata sakte.")
    user = (await db.execute(
        select(User).where(User.id == user_id)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_superuser is not None:
        user.is_superuser = payload.is_superuser
    await db.flush()
    return AdminUserRow.model_validate(user)