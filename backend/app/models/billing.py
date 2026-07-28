"""Subscriptions + invoices backing the Billing & Usage page, the plan
badge on the Dashboard, and the Superadmin plan-management panel.

Plan catalogue (see app/services/billing_service.py PLAN_CATALOG for
the authoritative prices/limits):
  trial     — 3 days, full Growth-tier features, auto-created for
              every new workspace, never renewable (one-time only)
  starter, growth, pro — paid tiers, billing_cycle-aware pricing
  enterprise — custom, superadmin sets price/limits manually

A workspace's access is gated by current_period_end — see
app.api.v1.dependencies.workspace's plan-expiry check.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class Subscription(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "subscriptions"

    plan: Mapped[str] = mapped_column(String(32), default="trial", nullable=False)
    billing_cycle: Mapped[str] = mapped_column(String(16), default="monthly", nullable=False)  # monthly|quarterly|yearly|trial
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)  # active|expired|cancelled

    # Limits — None means unlimited (Enterprise)
    monthly_message_quota: Mapped[int | None] = mapped_column(Integer)
    contact_limit: Mapped[int | None] = mapped_column(Integer)
    seats: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    whatsapp_number_limit: Mapped[int | None] = mapped_column(Integer)
    ai_chatbot_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Add-ons purchased on top of the base plan — e.g.
    # {"extra_seats": 2, "extra_numbers": 1, "extra_contacts_blocks": 3, "ai_chatbot": true, "priority_support": true}
    addons: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Pricing snapshot at the time this subscription was set — kept
    # even if the catalogue price changes later, so renewals/invoices
    # stay consistent with what the customer originally agreed to.
    base_price_paise: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # smallest currency unit
    gst_percent: Mapped[int] = mapped_column(Integer, default=18, nullable=False)

    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # blocks a second free trial

    external_customer_id: Mapped[str | None] = mapped_column(String(128))
    external_subscription_id: Mapped[str | None] = mapped_column(String(128))


class Invoice(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "invoices"

    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL")
    )
    number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)     # before GST, smallest currency unit
    gst_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)       # subtotal + gst_amount
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    line_items: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))