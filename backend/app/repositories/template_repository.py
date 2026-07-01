"""Repository for WhatsApp message Templates (Phase 8)."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.template import Template
from app.repositories.base import BaseRepository


class TemplateRepository(BaseRepository[Template]):
    model = Template

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> list[Template]:
        result = await self.db.execute(
            select(Template)
            .where(Template.workspace_id == workspace_id)
            .order_by(Template.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_by_name(self, workspace_id: uuid.UUID, name: str, language: str) -> Template | None:
        result = await self.db.execute(
            select(Template)
            .where(Template.workspace_id == workspace_id)
            .where(Template.name == name)
            .where(Template.language == language)
        )
        return result.scalar_one_or_none()


def get_template_repository(db: AsyncSession) -> TemplateRepository:
    return TemplateRepository(db)
