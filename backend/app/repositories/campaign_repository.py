"""Repository for Campaigns and CampaignRecipients."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.campaign import Campaign, CampaignRecipient
from app.repositories.base import BaseRepository


class CampaignRepository(BaseRepository[Campaign]):
    model = Campaign

    async def list_by_workspace(
        self, workspace_id: uuid.UUID, page: int = 1, page_size: int = 30
    ) -> tuple[list[Campaign], int]:
        stmt = select(Campaign).where(Campaign.workspace_id == workspace_id)
        total = (await self.db.execute(
            select(func.count()).select_from(stmt.subquery())
        )).scalar_one()
        stmt = stmt.order_by(Campaign.created_at.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_with_recipients(
        self, campaign_id: uuid.UUID, workspace_id: uuid.UUID
    ) -> Campaign | None:
        result = await self.db.execute(
            select(Campaign)
            .options(selectinload(Campaign.recipients))
            .where(Campaign.id == campaign_id)
            .where(Campaign.workspace_id == workspace_id)
        )
        return result.scalar_one_or_none()


class CampaignRecipientRepository(BaseRepository[CampaignRecipient]):
    model = CampaignRecipient

    async def list_pending(self, campaign_id: uuid.UUID) -> list[CampaignRecipient]:
        result = await self.db.execute(
            select(CampaignRecipient)
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.status == "pending")
        )
        return list(result.scalars().all())
