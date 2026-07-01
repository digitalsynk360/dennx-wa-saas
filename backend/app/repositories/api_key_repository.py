"""Repository for developer API keys."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey
from app.repositories.base import BaseRepository


class ApiKeyRepository(BaseRepository[ApiKey]):
    model = ApiKey

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> list[ApiKey]:
        result = await self.db.execute(
            select(ApiKey).where(ApiKey.workspace_id == workspace_id).order_by(ApiKey.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_by_prefix(self, key_prefix: str) -> ApiKey | None:
        result = await self.db.execute(select(ApiKey).where(ApiKey.key_prefix == key_prefix))
        return result.scalar_one_or_none()
