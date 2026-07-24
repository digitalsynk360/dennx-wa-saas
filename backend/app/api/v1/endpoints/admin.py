"""
Super Admin (platform-level) endpoints. Mounted at /api/v1/admin.
Every route requires User.is_superuser = true.

  GET   /admin/overview               platform-wide stats
  GET   /admin/workspaces             all workspaces + usage
  PATCH /admin/workspaces/{id}        change plan / activate-deactivate
  GET   /admin/users                  all users
  GET   /admin/users/{id}             one user's detail + workspace memberships
  POST  /admin/users                  create a user directly (+ optional workspace assignment)
  PATCH /admin/users/{id}             block / unblock / grant superuser
  POST  /admin/users/{id}/reset-password  set a new password directly
  POST  /admin/users/{id}/impersonate impersonate — get an access/refresh token as this user
  POST  /admin/users/{id}/workspaces  add this user to a workspace with a role
  GET   /admin/audit-logs             platform-level admin action log
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.security import create_token_pair, hash_password_async
from app.models.contact import Contact
from app.models.identity import Role, User, Workspace, WorkspaceMember
from app.models.messaging import Conversation, Message
from app.models.platform import PlatformAuditLog
from app.models.whatsapp import WhatsAppAccount

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_superuser(user: User = Depends(get_current_user)) -> User:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin only.")
    return user


async def _log_admin_action(
    db: AsyncSession, actor_id: uuid.UUID, action: str,
    target_user_id: uuid.UUID | None = None, ip: str | None = None, **meta,
) -> None:
    db.add(PlatformAuditLog(
        actor_id=actor_id, action=action, target_user_id=target_user_id,
        ip_address=ip, metadata_=meta,
    ))
    await db.flush()


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


class CreateUserAdmin(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Exactly one of these two — a user with zero workspaces is a
    # dead end in this app: the dashboard bounces them to /signup for
    # having no workspace, and /signup then rejects them because the
    # email already exists. Always assign (or create) one.
    workspace_id: uuid.UUID | None = Field(default=None, description="Add to this EXISTING workspace")
    role_name: str | None = Field(default=None, description="Required with workspace_id — e.g. Admin, Manager, Agent")
    new_workspace_name: str | None = Field(default=None, min_length=2, max_length=255, description="Create a BRAND NEW workspace with this user as owner, instead of joining an existing one")


class ResetPasswordAdmin(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class AddToWorkspaceAdmin(BaseModel):
    workspace_id: uuid.UUID | None = None
    role_name: str | None = None
    new_workspace_name: str | None = Field(default=None, min_length=2, max_length=255)


class ImpersonateResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    impersonated_user: AdminUserRow


class UserDetailAdmin(AdminUserRow):
    workspace_memberships: list[dict] = []


class PlatformAuditLogRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    action: str
    actor_id: uuid.UUID | None
    target_user_id: uuid.UUID | None
    ip_address: str | None
    metadata_: dict
    created_at: datetime


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
    return [
        AdminWorkspaceRow(
            id=ws.id, name=ws.name, plan=ws.plan,
            is_active=ws.is_active, created_at=ws.created_at,
            members=members, contacts=contacts, messages_30d=msgs,
        )
        for ws, members, contacts, msgs in rows
    ]


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
    return AdminWorkspaceRow(
        id=ws.id, name=ws.name, plan=ws.plan,
        is_active=ws.is_active, created_at=ws.created_at,
    )


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
    return [
        AdminUserRow(
            id=user.id, full_name=user.full_name, email=user.email,
            is_active=user.is_active, is_superuser=user.is_superuser,
            created_at=user.created_at, workspaces=n,
        )
        for user, n in rows
    ]


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
    return AdminUserRow(
        id=user.id, full_name=user.full_name, email=user.email,
        is_active=user.is_active, is_superuser=user.is_superuser,
        created_at=user.created_at,
    )


@router.get("/users/{user_id}", response_model=UserDetailAdmin)
async def get_user_admin(
    user_id: uuid.UUID,
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    rows = (await db.execute(
        select(WorkspaceMember, Workspace, Role)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .join(Role, Role.id == WorkspaceMember.role_id)
        .where(WorkspaceMember.user_id == user_id)
    )).all()
    memberships = [
        {"workspace_id": str(ws.id), "workspace_name": ws.name, "role": role.name, "member_id": str(m.id)}
        for m, ws, role in rows
    ]
    return UserDetailAdmin(
        id=user.id, full_name=user.full_name, email=user.email,
        is_active=user.is_active, is_superuser=user.is_superuser,
        created_at=user.created_at, workspaces=len(memberships),
        workspace_memberships=memberships,
    )


@router.post("/users", response_model=AdminUserRow, status_code=201)
async def create_user_admin(
    payload: CreateUserAdmin,
    request: Request,
    actor: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Creates a user directly from the platform side — no signup
    email verification flow. Always assigns them to a workspace in
    the same call — either an EXISTING one (workspace_id + role_name)
    or a BRAND NEW one (new_workspace_name, user becomes its owner
    with the default Admin role) — see CreateUserAdmin docstring for
    why a workspace is mandatory, not optional."""
    if bool(payload.workspace_id) == bool(payload.new_workspace_name):
        raise HTTPException(
            status_code=400,
            detail="Pick exactly one: an existing workspace_id, or a new_workspace_name to create a fresh one.",
        )
    if payload.workspace_id and not payload.role_name:
        raise HTTPException(status_code=400, detail="role_name is required when joining an existing workspace.")

    existing = (await db.execute(select(User).where(User.email == payload.email.lower()))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    role: Role | None = None
    ws: Workspace | None = None

    if payload.workspace_id:
        ws = (await db.execute(select(Workspace).where(Workspace.id == payload.workspace_id))).scalar_one_or_none()
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        role = (await db.execute(select(Role).where(Role.name == payload.role_name))).scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail=f"Role '{payload.role_name}' not found.")

    user = User(
        full_name=payload.full_name,
        email=payload.email.lower(),
        hashed_password=await hash_password_async(payload.password),
        is_active=True,
    )
    db.add(user)
    await db.flush()

    if payload.new_workspace_name:
        # Same pattern as normal signup: fresh workspace, this user
        # becomes its owner with the platform's default Admin role.
        from app.repositories.workspace_repository import WorkspaceRepository
        from app.services.auth_service import _unique_slug
        from app.utils.rbac_seed import default_role_name

        workspace_repo = WorkspaceRepository(db)
        admin_role = (await db.execute(select(Role).where(Role.name == default_role_name()))).scalar_one_or_none()
        if admin_role is None:
            raise HTTPException(status_code=500, detail="RBAC roles are not seeded.")

        slug = await _unique_slug(workspace_repo, payload.new_workspace_name)
        ws = Workspace(name=payload.new_workspace_name, slug=slug, owner_id=user.id, plan="free")
        db.add(ws)
        await db.flush()
        role = admin_role

    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role_id=role.id))

    await _log_admin_action(
        db, actor.id, "user_created", target_user_id=user.id,
        ip=request.client.host if request.client else None,
        email=user.email, workspace_id=str(ws.id),
        workspace_mode="new" if payload.new_workspace_name else "existing",
    )
    await db.flush()

    return AdminUserRow(
        id=user.id, full_name=user.full_name, email=user.email,
        is_active=user.is_active, is_superuser=user.is_superuser,
        created_at=user.created_at, workspaces=1,
    )


@router.post("/users/{user_id}/reset-password", response_model=dict)
async def reset_password_admin(
    user_id: uuid.UUID,
    payload: ResetPasswordAdmin,
    request: Request,
    actor: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    user.hashed_password = await hash_password_async(payload.new_password)
    await _log_admin_action(
        db, actor.id, "password_reset", target_user_id=user.id,
        ip=request.client.host if request.client else None,
    )
    await db.flush()
    return {"ok": True}


@router.post("/users/{user_id}/workspaces", response_model=dict)
async def add_user_to_workspace_admin(
    user_id: uuid.UUID,
    payload: AddToWorkspaceAdmin,
    request: Request,
    actor: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    if bool(payload.workspace_id) == bool(payload.new_workspace_name):
        raise HTTPException(
            status_code=400,
            detail="Pick exactly one: an existing workspace_id, or a new_workspace_name to create a fresh one.",
        )
    if payload.workspace_id and not payload.role_name:
        raise HTTPException(status_code=400, detail="role_name is required when joining an existing workspace.")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    role: Role | None = None
    ws: Workspace | None = None

    if payload.workspace_id:
        ws = (await db.execute(select(Workspace).where(Workspace.id == payload.workspace_id))).scalar_one_or_none()
        if ws is None:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        role = (await db.execute(select(Role).where(Role.name == payload.role_name))).scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=404, detail=f"Role '{payload.role_name}' not found.")
    else:
        from app.repositories.workspace_repository import WorkspaceRepository
        from app.services.auth_service import _unique_slug
        from app.utils.rbac_seed import default_role_name

        workspace_repo = WorkspaceRepository(db)
        admin_role = (await db.execute(select(Role).where(Role.name == default_role_name()))).scalar_one_or_none()
        if admin_role is None:
            raise HTTPException(status_code=500, detail="RBAC roles are not seeded.")

        slug = await _unique_slug(workspace_repo, payload.new_workspace_name)
        ws = Workspace(name=payload.new_workspace_name, slug=slug, owner_id=user.id, plan="free")
        db.add(ws)
        await db.flush()
        role = admin_role

    existing = (await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == user_id, WorkspaceMember.workspace_id == ws.id
        )
    )).scalar_one_or_none()
    if existing is not None:
        existing.role_id = role.id
    else:
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=user_id, role_id=role.id))

    await _log_admin_action(
        db, actor.id, "user_added_to_workspace", target_user_id=user_id,
        ip=request.client.host if request.client else None,
        workspace_id=str(ws.id), role=role.name,
        workspace_mode="new" if payload.new_workspace_name else "existing",
    )
    await db.flush()
    return {"ok": True}


@router.post("/users/{user_id}/impersonate", response_model=ImpersonateResponse)
async def impersonate_user(
    user_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Issues a real access/refresh token pair for the target user, so
    the superadmin can see the product exactly as that user does —
    for support/debugging. Every impersonation is logged (who, whom,
    when, from what IP). Impersonating another superuser is blocked
    to avoid privilege-escalation surprises; deactivated users can't
    be impersonated either (they can't normally log in themselves,
    an impersonation session shouldn't bypass that)."""
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.is_superuser:
        raise HTTPException(status_code=403, detail="Cannot impersonate another superadmin.")
    if not target.is_active:
        raise HTTPException(status_code=400, detail="Cannot impersonate a deactivated user.")

    access_token, refresh_token = create_token_pair(target.id)

    await _log_admin_action(
        db, actor.id, "impersonation_started", target_user_id=target.id,
        ip=request.client.host if request.client else None,
        target_email=target.email,
    )
    await db.flush()

    return ImpersonateResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        impersonated_user=AdminUserRow(
            id=target.id, full_name=target.full_name, email=target.email,
            is_active=target.is_active, is_superuser=target.is_superuser,
            created_at=target.created_at,
        ),
    )


@router.get("/audit-logs", response_model=list[PlatformAuditLogRow])
async def list_platform_audit_logs(
    action: str | None = Query(None),
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PlatformAuditLog).order_by(PlatformAuditLog.created_at.desc()).limit(200)
    if action:
        stmt = stmt.where(PlatformAuditLog.action == action)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        PlatformAuditLogRow(
            id=r.id, action=r.action, actor_id=r.actor_id, target_user_id=r.target_user_id,
            ip_address=str(r.ip_address) if r.ip_address else None,
            metadata_=r.metadata_, created_at=r.created_at,
        )
        for r in rows
    ]