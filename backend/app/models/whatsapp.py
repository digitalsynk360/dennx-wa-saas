"""
Connected WhatsApp Business accounts.

Populated automatically by the Meta Embedded Signup flow (Phase 4):
the backend exchanges the authorization code, fetches the WABA ID,
phone_number_id and display number via the Graph API, encrypts the
resulting tenant access token, subscribes the webhook, and writes a
row here. The customer never types App ID, secret, token, WABA ID or
phone number ID manually.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class WhatsAppAccount(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "whatsapp_accounts"
    __table_args__ = (UniqueConstraint("phone_number_id"),)

    waba_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    phone_number_id: Mapped[str] = mapped_column(String(64), nullable=False)
    display_phone_number: Mapped[str | None] = mapped_column(String(32))
    verified_business_name: Mapped[str | None] = mapped_column(String(255))
    # Fernet-encrypted tenant access token from Embedded Signup exchange
    access_token_encrypted: Mapped[str | None] = mapped_column(Text)
    quality_rating: Mapped[str | None] = mapped_column(String(16))  # GREEN/YELLOW/RED
    messaging_limit_tier: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(
        String(32), default="disconnected", nullable=False
    )  # disconnected | pending | live | restricted
    webhook_subscribed: Mapped[bool] = mapped_column(Boolean, default=False)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    profile_picture_url: Mapped[str | None] = mapped_column(Text)
