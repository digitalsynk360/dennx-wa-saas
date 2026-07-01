"""WhatsApp message templates — synced from / submitted to Meta.
Status lifecycle matches the Templates page: pending/approved/paused/rejected."""
from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class Template(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "templates"
    __table_args__ = (UniqueConstraint("workspace_id", "name", "language"),)

    meta_template_id: Mapped[str | None] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str] = mapped_column(String(16), default="en", nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)  # MARKETING|UTILITY|AUTHENTICATION
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    header_type: Mapped[str | None] = mapped_column(String(16))  # none|text|image|document|video
    header_content: Mapped[str | None] = mapped_column(Text)
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    footer_text: Mapped[str | None] = mapped_column(String(255))
    buttons: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    variable_samples: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
