"""Subscriptions + invoices backing the Billing & Usage page and the
plan badge on the Dashboard."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class Subscription(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "subscriptions"

    plan: Mapped[str] = mapped_column(String(32), default="free", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    monthly_message_quota: Mapped[int | None] = mapped_column(Integer)
    seats: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    external_customer_id: Mapped[str | None] = mapped_column(String(128))
    external_subscription_id: Mapped[str | None] = mapped_column(String(128))


class Invoice(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "invoices"

    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL")
    )
    number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # smallest currency unit
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    line_items: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
