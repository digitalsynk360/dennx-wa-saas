"""
Workspace + Sub Admin management use cases.

Sub Admins screen rules (from reference UI):
  - "New Sub Admin" form takes full name, email, password, a role
    (Admin or Manager — Agent is also supported by the schema for
    completeness), and assigns the member to one or more workspaces.
  - If the email belongs to an existing user, they're simply added as
    a member of this workspace with the chosen role (no new password
    is set — `password` is ignored in that case).
  - If the email is new, a user account is created with the given
    password and added as a member.
  - The workspace owner cannot be removed or have their role changed
    via this endpoint (ownership transfer is out of scope here).
"""
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import hash_password_async
from app.models.identity import User, Workspace, WorkspaceMember
from app.repositories.user_repository import UserRepository
from app.repositories.workspace_repository import (
    RoleRepository,
    WorkspaceMemberRepository,
    WorkspaceRepository,
)
from app.schemas.workspace import InviteMemberRequest, UpdateWorkspaceRequest

VALID_ROLE_NAMES = {"Admin", "Manager", "Agent"}


async def update_workspace(
    db: AsyncSession, workspace: Workspace, payload: UpdateWorkspaceRequest
) -> Workspace:
    if payload.name is not None:
        workspace.name = payload.name
    if payload.settings is not None:
        # Shallow-merge so unrelated settings keys aren't wiped by a
        # partial update from one settings tab.
        workspace.settings = {**workspace.settings, **payload.settings}
    await db.flush()
    return workspace


async def list_members(db: AsyncSession, workspace_id: uuid.UUID) -> list[WorkspaceMember]:
    member_repo = WorkspaceMemberRepository(db)
    return await member_repo.list_members(workspace_id)


async def invite_member(
    db: AsyncSession, workspace: Workspace, payload: InviteMemberRequest
) -> WorkspaceMember:
    if payload.role_name not in VALID_ROLE_NAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"role_name must be one of {sorted(VALID_ROLE_NAMES)}.",
        )

    user_repo = UserRepository(db)
    role_repo = RoleRepository(db)
    member_repo = WorkspaceMemberRepository(db)

    role = await role_repo.get_by_name(payload.role_name)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="RBAC roles are not seeded. Restart the backend.",
        )

    user = await user_repo.get_by_email(payload.email)
    if user is None:
        user = User(
            full_name=payload.full_name,
            email=payload.email.lower(),
            hashed_password=await hash_password_async(payload.password),
        )
        await user_repo.add(user)

    existing = await member_repo.get_membership(workspace.id, user.id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user is already a member of the workspace.",
        )

    membership = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role_id=role.id,
    )
    await member_repo.add(membership)

    # Reload with relationships for the response model
    stmt = (
       select(WorkspaceMember)
       .options(
           selectinload(WorkspaceMember.role),
           selectinload(WorkspaceMember.user),
       )
       .where(WorkspaceMember.workspace_id == workspace.id)
       .where(WorkspaceMember.user_id == user.id)
    )

    result = await db.execute(stmt)
    reloaded = result.scalar_one_or_none()
    assert reloaded is not None
    return reloaded


async def update_member_role(
    db: AsyncSession, workspace: Workspace, member_id: uuid.UUID, role_name: str
) -> WorkspaceMember:
    if role_name not in VALID_ROLE_NAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"role_name must be one of {sorted(VALID_ROLE_NAMES)}.",
        )

    member_repo = WorkspaceMemberRepository(db)
    role_repo = RoleRepository(db)

    membership = await member_repo.get_by_id(member_id)
    if membership is None or membership.workspace_id != workspace.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found.")

    if membership.user_id == workspace.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The workspace owner's role cannot be changed.",
        )

    role = await role_repo.get_by_name(role_name)
    if role is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown role.")

    membership.role_id = role.id
    await db.flush()

    stmt = (
        select(WorkspaceMember)
        .options(
            selectinload(WorkspaceMember.role),
            selectinload(WorkspaceMember.user),
        )
        .where(WorkspaceMember.id == member_id)
)

    result = await db.execute(stmt)
    reloaded = result.scalar_one_or_none()

    assert reloaded is not None
    return reloaded


async def remove_member(db: AsyncSession, workspace: Workspace, member_id: uuid.UUID) -> None:
    member_repo = WorkspaceMemberRepository(db)
    membership = await member_repo.get_by_id(member_id)
    if membership is None or membership.workspace_id != workspace.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found.")

    if membership.user_id == workspace.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The workspace owner cannot be removed.",
        )

    await member_repo.delete(membership)


# ---------------- Agents (Phase 13) ----------------

async def list_agents(db: AsyncSession, workspace_id: uuid.UUID) -> list[dict]:
    """Same underlying data as Sub Admins (list_members), reshaped for
    the Agents page: includes a live count of open conversations
    currently assigned to each member."""
    from sqlalchemy import func
    from app.models.messaging import Conversation

    members = await list_members(db, workspace_id)

    assigned_counts = dict((await db.execute(
        select(Conversation.assigned_agent_id, func.count())
        .where(Conversation.workspace_id == workspace_id)
        .where(Conversation.status == "open")
        .where(Conversation.assigned_agent_id.is_not(None))
        .group_by(Conversation.assigned_agent_id)
    )).all())

    return [
        {
            "member_id": m.id,
            "user_id": m.user_id,
            "full_name": m.user.full_name,
            "email": m.user.email,
            "role": m.role.name,
            "is_online": m.is_online,
            "last_seen_at": m.last_seen_at,
            "open_conversations_assigned": assigned_counts.get(m.user_id, 0),
        }
        for m in members
    ]