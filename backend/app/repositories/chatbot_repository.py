"""Repository for Chatbot Rules and Flows."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import ChatbotFlow, ChatbotRule, FlowSession
from app.repositories.base import BaseRepository


class ChatbotRuleRepository(BaseRepository[ChatbotRule]):
    model = ChatbotRule

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> list[ChatbotRule]:
        result = await self.db.execute(
            select(ChatbotRule)
            .where(ChatbotRule.workspace_id == workspace_id)
            .order_by(ChatbotRule.priority.desc(), ChatbotRule.created_at)
        )
        return list(result.scalars().all())

    async def list_active_ordered(self, workspace_id: uuid.UUID) -> list[ChatbotRule]:
        """Rules in priority order — used by the matching engine."""
        result = await self.db.execute(
            select(ChatbotRule)
            .where(ChatbotRule.workspace_id == workspace_id)
            .where(ChatbotRule.is_active.is_(True))
            .order_by(ChatbotRule.priority.desc())
        )
        return list(result.scalars().all())


class ChatbotFlowRepository(BaseRepository[ChatbotFlow]):
    model = ChatbotFlow

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> list[ChatbotFlow]:
        result = await self.db.execute(
            select(ChatbotFlow)
            .where(ChatbotFlow.workspace_id == workspace_id)
            .order_by(ChatbotFlow.created_at.desc())
        )
        return list(result.scalars().all())


class FlowSessionRepository(BaseRepository[FlowSession]):
    model = FlowSession

    async def get_active(self, workspace_id: uuid.UUID, contact_id: uuid.UUID) -> FlowSession | None:
        result = await self.db.execute(
            select(FlowSession)
            .where(FlowSession.workspace_id == workspace_id)
            .where(FlowSession.contact_id == contact_id)
            .where(FlowSession.status.in_(["active", "waiting"]))
            .order_by(FlowSession.created_at.desc())
        )
        return result.scalar_one_or_none()
