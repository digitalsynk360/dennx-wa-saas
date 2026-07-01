"""Repository for Contacts and Tags."""
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.contact import Contact, ContactTag, Tag
from app.repositories.base import BaseRepository


class ContactRepository(BaseRepository[Contact]):
    model = Contact

    async def list_by_workspace(
        self,
        workspace_id: uuid.UUID,
        search: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 30,
    ) -> tuple[list[Contact], int]:
        stmt = (
            select(Contact)
            .options(selectinload(Contact.tags))
            .where(Contact.workspace_id == workspace_id)
        )
        if search:
            stmt = stmt.where(
                or_(
                    Contact.name.ilike(f"%{search}%"),
                    Contact.phone.ilike(f"%{search}%"),
                    Contact.email.ilike(f"%{search}%"),
                )
            )
        if status:
            stmt = stmt.where(Contact.status == status)

        count = (await self.db.execute(
            select(func.count()).select_from(stmt.subquery())
        )).scalar_one()

        stmt = stmt.order_by(Contact.created_at.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), count

    async def get_by_phone(self, workspace_id: uuid.UUID, phone: str) -> Contact | None:
        result = await self.db.execute(
            select(Contact)
            .options(selectinload(Contact.tags))
            .where(Contact.workspace_id == workspace_id)
            .where(Contact.phone == phone)
        )
        return result.scalar_one_or_none()

    async def get_with_tags(self, contact_id: uuid.UUID, workspace_id: uuid.UUID) -> Contact | None:
        result = await self.db.execute(
            select(Contact)
            .options(selectinload(Contact.tags))
            .where(Contact.id == contact_id)
            .where(Contact.workspace_id == workspace_id)
        )
        return result.scalar_one_or_none()

    async def get_all_for_export(self, workspace_id: uuid.UUID) -> list[Contact]:
        result = await self.db.execute(
            select(Contact)
            .options(selectinload(Contact.tags))
            .where(Contact.workspace_id == workspace_id)
            .order_by(Contact.created_at.desc())
        )
        return list(result.scalars().all())


class TagRepository(BaseRepository[Tag]):
    model = Tag

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> list[Tag]:
        result = await self.db.execute(
            select(Tag).where(Tag.workspace_id == workspace_id).order_by(Tag.name)
        )
        return list(result.scalars().all())

    async def get_by_name(self, workspace_id: uuid.UUID, name: str) -> Tag | None:
        result = await self.db.execute(
            select(Tag).where(Tag.workspace_id == workspace_id, Tag.name == name)
        )
        return result.scalar_one_or_none()


def get_contact_repository(db: AsyncSession) -> ContactRepository:
    return ContactRepository(db)

def get_tag_repository(db: AsyncSession) -> TagRepository:
    return TagRepository(db)
