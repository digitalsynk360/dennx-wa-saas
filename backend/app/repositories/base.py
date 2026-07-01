"""Generic async repository base — thin wrapper over an AsyncSession
for a single model, kept here so feature repositories share the same
session-handling conventions (Repository Pattern)."""
import uuid
from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    model: type[ModelType]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, id_: uuid.UUID) -> ModelType | None:
        result = await self.db.execute(select(self.model).where(self.model.id == id_))
        return result.scalar_one_or_none()

    async def add(self, instance: ModelType) -> ModelType:
        self.db.add(instance)
        await self.db.flush()
        return instance

    async def delete(self, instance: ModelType) -> None:
        await self.db.delete(instance)
        await self.db.flush()
