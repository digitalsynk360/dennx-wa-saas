"""Repository for the AI knowledge base (pgvector similarity search)."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import KnowledgeDocument
from app.repositories.base import BaseRepository


class KnowledgeRepository(BaseRepository[KnowledgeDocument]):
    model = KnowledgeDocument

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> list[KnowledgeDocument]:
        result = await self.db.execute(
            select(KnowledgeDocument)
            .where(KnowledgeDocument.workspace_id == workspace_id)
            .order_by(KnowledgeDocument.created_at.desc())
        )
        return list(result.scalars().all())

    async def search_similar(
        self, workspace_id: uuid.UUID, query_embedding: list[float], limit: int = 5
    ) -> list[KnowledgeDocument]:
        """Cosine-distance nearest neighbours via pgvector's `<=>` operator."""
        result = await self.db.execute(
            select(KnowledgeDocument)
            .where(KnowledgeDocument.workspace_id == workspace_id)
            .where(KnowledgeDocument.embedding.is_not(None))
            .order_by(KnowledgeDocument.embedding.cosine_distance(query_embedding))
            .limit(limit)
        )
        return list(result.scalars().all())
