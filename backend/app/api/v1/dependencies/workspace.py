"""
Workspace context + RBAC permission enforcement.

Every workspace-scoped endpoint depends on `get_workspace_context`,
which:
  1. Reads the workspace id from the `X-Workspace-Id` header
     (the frontend sends this for every request once a workspace is
     selected — see frontend src/lib/api.ts from this phase onward).
  2. Loads the caller's WorkspaceMember row (404 if the user is not a
     member of that workspace — this is the multi-tenant isolation
     boundary at the API layer).
  3. Exposes the member's role + permission codes for `require_permission`.

`require_permission("campaigns.write")` returns a dependency that
raises 403 if the caller's role lacks that permission code.
"""
import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.core.database import get_db
from app.models.identity import User, Workspace, WorkspaceMember
from app.repositories.workspace_repository import (
    WorkspaceMemberRepository,
    WorkspaceRepository,
)


class WorkspaceContext:
    def __init__(self, workspace: Workspace, membership: WorkspaceMember, user: User) -> None:
        self.workspace = workspace
        self.membership = membership
        self.user = user

    @property
    def role_name(self) -> str:
        return self.membership.role.name

    @property
    def permission_codes(self) -> set[str]:
        return {p.code for p in self.membership.role.permissions}

    def has_permission(self, code: str) -> bool:
        return code in self.permission_codes


async def get_workspace_context(
    x_workspace_id: str = Header(..., alias="X-Workspace-Id"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceContext:
    try:
        workspace_id = uuid.UUID(x_workspace_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Workspace-Id header must be a valid UUID.",
        )

    workspace_repo = WorkspaceRepository(db)
    member_repo = WorkspaceMemberRepository(db)

    workspace = await workspace_repo.get_by_id(workspace_id)
    if workspace is None or not workspace.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

    membership = await member_repo.get_membership(workspace_id, current_user.id)
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this workspace.",
        )

    return WorkspaceContext(workspace=workspace, membership=membership, user=current_user)


def require_permission(permission_code: str):
    """Dependency factory: raises 403 if the caller's role lacks
    `permission_code` in the active workspace."""

    async def _check(
        ctx: WorkspaceContext = Depends(get_workspace_context),
    ) -> WorkspaceContext:
        if not ctx.has_permission(permission_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role does not have the '{permission_code}' permission.",
            )
        return ctx

    return _check
