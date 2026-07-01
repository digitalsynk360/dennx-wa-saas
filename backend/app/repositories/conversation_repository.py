"""Repository for Conversations and Messages."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.contact import Contact
from app.models.messaging import Conversation, Message
from app.repositories.base import BaseRepository


class ConversationRepository(BaseRepository[Conversation]):
    model = Conversation

    async def list_by_workspace(
        self,
        workspace_id: uuid.UUID,
        status: str | None = None,
        handling: str | None = None,
        page: int = 1,
        page_size: int = 30,
    ) -> tuple[list[Conversation], int]:
        stmt = (
            select(Conversation)
            .options(selectinload(Conversation.contact))
            .where(Conversation.workspace_id == workspace_id)
        )
        if status:
            stmt = stmt.where(Conversation.status == status)
        if handling:
            stmt = stmt.where(Conversation.handling == handling)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = stmt.order_by(Conversation.last_message_at.desc().nullslast())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_with_contact(self, conversation_id: uuid.UUID, workspace_id: uuid.UUID) -> Conversation | None:
        result = await self.db.execute(
            select(Conversation)
            .options(selectinload(Conversation.contact))
            .where(Conversation.id == conversation_id)
            .where(Conversation.workspace_id == workspace_id)
        )
        return result.scalar_one_or_none()

    async def get_by_contact(self, contact_id: uuid.UUID, workspace_id: uuid.UUID) -> Conversation | None:
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.contact_id == contact_id)
            .where(Conversation.workspace_id == workspace_id)
            .where(Conversation.status == "open")
            .order_by(Conversation.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


class MessageRepository(BaseRepository[Message]):
    model = Message

    async def list_by_conversation(
        self,
        conversation_id: uuid.UUID,
        workspace_id: uuid.UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Message], int]:
        count = (
            await self.db.execute(
                select(func.count()).where(
                    Message.conversation_id == conversation_id,
                    Message.workspace_id == workspace_id,
                )
            )
        ).scalar_one()

        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .where(Message.workspace_id == workspace_id)
            .order_by(Message.created_at.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), count

    async def get_by_wamid(self, wamid: str) -> Message | None:
        result = await self.db.execute(select(Message).where(Message.wamid == wamid))
        return result.scalar_one_or_none()
