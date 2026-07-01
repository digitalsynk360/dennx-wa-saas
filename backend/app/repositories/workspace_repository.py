"""Data access for workspaces, membership and RBAC roles."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.identity import Role, Workspace, WorkspaceMember
from app.repositories.base import BaseRepository


class WorkspaceRepository(BaseRepository[Workspace]):
    model = Workspace

    async def get_by_slug(self, slug: str) -> Workspace | None:
        result = await self.db.execute(select(Workspace).where(Workspace.slug == slug))
        return result.scalar_one_or_none()

    async def slug_exists(self, slug: str) -> bool:
        return await self.get_by_slug(slug) is not None

    async def list_for_user(self, user_id: uuid.UUID) -> list[tuple[Workspace, str]]:
        """Returns (workspace, role_name) pairs for every workspace
        the user belongs to."""
        stmt = (
            select(Workspace, Role.name)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .join(Role, Role.id == WorkspaceMember.role_id)
            .where(WorkspaceMember.user_id == user_id)
            .where(Workspace.is_active.is_(True))
            .order_by(Workspace.created_at)
        )
        result = await self.db.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]


class RoleRepository(BaseRepository[Role]):
    model = Role

    async def get_by_name(self, name: str) -> Role | None:
        result = await self.db.execute(select(Role).where(Role.name == name))
        return result.scalar_one_or_none()


class WorkspaceMemberRepository(BaseRepository[WorkspaceMember]):
    model = WorkspaceMember

    async def get_membership(
        self, workspace_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkspaceMember | None:
        stmt = (
            select(WorkspaceMember)
            .options(
                selectinload(WorkspaceMember.role).selectinload(Role.permissions)
            )
            .where(WorkspaceMember.workspace_id == workspace_id)
            .where(WorkspaceMember.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_members(self, workspace_id: uuid.UUID) -> list[WorkspaceMember]:
        stmt = (
            select(WorkspaceMember)
            .options(
                selectinload(WorkspaceMember.role).selectinload(Role.permissions),
                selectinload(WorkspaceMember.user),
            )
            .where(WorkspaceMember.workspace_id == workspace_id)
            .order_by(WorkspaceMember.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())


def get_workspace_repository(db: AsyncSession) -> WorkspaceRepository:
    return WorkspaceRepository(db)


def get_role_repository(db: AsyncSession) -> RoleRepository:
    return RoleRepository(db)


def get_workspace_member_repository(db: AsyncSession) -> WorkspaceMemberRepository:
    return WorkspaceMemberRepository(db)
