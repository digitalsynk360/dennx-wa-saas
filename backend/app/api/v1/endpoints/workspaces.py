"""
Workspace + Sub Admins endpoints — mounted at /api/v1/workspaces.

All endpoints below /workspaces/current/* require the X-Workspace-Id
header (resolved by get_workspace_context) and operate on that
workspace only — this is the multi-tenant isolation boundary.

  GET    /workspaces                          list workspaces the user belongs to
  GET    /workspaces/current                  active workspace details
  PATCH  /workspaces/current                  update name/settings (workspace.manage)
  GET    /workspaces/current/members          list Sub Admins (members.manage)
  POST   /workspaces/current/members          invite a Sub Admin (members.manage)
  PATCH  /workspaces/current/members/{id}     change a member's role (members.manage)
  DELETE /workspaces/current/members/{id}     remove a member (members.manage)
  GET    /workspaces/roles                    list available roles (for the role picker)
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.dependencies.workspace import (
    WorkspaceContext,
    get_workspace_context,
    require_permission,
)
from app.core.database import get_db
from app.models.identity import Role, User
from app.repositories.workspace_repository import RoleRepository, WorkspaceRepository
from app.schemas.workspace import (
    InviteMemberRequest,
    MessageResponse,
    RoleResponse,
    UpdateMemberRoleRequest,
    UpdateWorkspaceRequest,
    WorkspaceMemberResponse,
    WorkspaceResponse,
)
from app.services import workspace_service
from app.services.auth_service import list_user_workspaces

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[dict])
async def list_my_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    summaries = await list_user_workspaces(db, current_user.id)
    return [s.model_dump(mode="json") for s in summaries]


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(db: AsyncSession = Depends(get_db)) -> list[RoleResponse]:
    """System roles available for Sub Admins (Admin / Manager / Agent)."""
    role_repo = RoleRepository(db)
    result = await db.execute(role_repo.model.__table__.select())
    rows = result.fetchall()
    return [RoleResponse(id=r.id, name=r.name, description=r.description) for r in rows]


@router.get("/current", response_model=WorkspaceResponse)
async def get_current_workspace(
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> WorkspaceResponse:
    return WorkspaceResponse.model_validate(ctx.workspace)


@router.patch("/current", response_model=WorkspaceResponse)
async def update_current_workspace(
    payload: UpdateWorkspaceRequest,
    ctx: WorkspaceContext = Depends(require_permission("workspace.manage")),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceResponse:
    workspace = await workspace_service.update_workspace(db, ctx.workspace, payload)
    return WorkspaceResponse.model_validate(workspace)


@router.get("/current/members", response_model=list[WorkspaceMemberResponse])
async def list_members(
    ctx: WorkspaceContext = Depends(require_permission("members.manage")),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceMemberResponse]:
    members = await workspace_service.list_members(db, ctx.workspace.id)
    return [WorkspaceMemberResponse.model_validate(m) for m in members]


@router.post(
    "/current/members",
    response_model=WorkspaceMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_member(
    payload: InviteMemberRequest,
    ctx: WorkspaceContext = Depends(require_permission("members.manage")),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceMemberResponse:
    member = await workspace_service.invite_member(db, ctx.workspace, payload)
    return WorkspaceMemberResponse.model_validate(member)


@router.patch("/current/members/{member_id}", response_model=WorkspaceMemberResponse)
async def update_member_role(
    member_id: str,
    payload: UpdateMemberRoleRequest,
    ctx: WorkspaceContext = Depends(require_permission("members.manage")),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceMemberResponse:
    import uuid as _uuid

    member = await workspace_service.update_member_role(
        db, ctx.workspace, _uuid.UUID(member_id), payload.role_name
    )
    return WorkspaceMemberResponse.model_validate(member)


@router.delete("/current/members/{member_id}", response_model=MessageResponse)
async def remove_member(
    member_id: str,
    ctx: WorkspaceContext = Depends(require_permission("members.manage")),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    import uuid as _uuid

    await workspace_service.remove_member(db, ctx.workspace, _uuid.UUID(member_id))
    return MessageResponse(message="Member removed.")
