"""Repository for Subscriptions and Invoices."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import Invoice, Subscription
from app.repositories.base import BaseRepository


class SubscriptionRepository(BaseRepository[Subscription]):
    model = Subscription

    async def get_by_workspace(self, workspace_id: uuid.UUID) -> Subscription | None:
        result = await self.db.execute(
            select(Subscription).where(Subscription.workspace_id == workspace_id).limit(1)
        )
        return result.scalar_one_or_none()


class InvoiceRepository(BaseRepository[Invoice]):
    model = Invoice

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> list[Invoice]:
        result = await self.db.execute(
            select(Invoice).where(Invoice.workspace_id == workspace_id).order_by(Invoice.created_at.desc())
        )
        return list(result.scalars().all())
