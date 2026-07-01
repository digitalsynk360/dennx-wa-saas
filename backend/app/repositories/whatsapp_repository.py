"""Repository for WhatsApp accounts."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.whatsapp import WhatsAppAccount
from app.repositories.base import BaseRepository


class WhatsAppRepository(BaseRepository[WhatsAppAccount]):
    model = WhatsAppAccount

    async def get_by_workspace(self, workspace_id: uuid.UUID) -> WhatsAppAccount | None:
        result = await self.db.execute(
            select(WhatsAppAccount)
            .where(WhatsAppAccount.workspace_id == workspace_id)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_by_phone_number_id(self, phone_number_id: str) -> WhatsAppAccount | None:
        result = await self.db.execute(
            select(WhatsAppAccount).where(
                WhatsAppAccount.phone_number_id == phone_number_id
            )
        )
        return result.scalar_one_or_none()


def get_whatsapp_repository(db: AsyncSession) -> WhatsAppRepository:
    return WhatsAppRepository(db)
