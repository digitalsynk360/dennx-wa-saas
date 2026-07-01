"""Contacts + tags, matching the Contacts page: name/phone/city,
source (inbound/bot/import/api/campaign), status (new/contacted/
converted/lost), opt-in state, freeform attributes for flows/CRM."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class Contact(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("workspace_id", "phone"),
        Index("ix_contacts_ws_status", "workspace_id", "status"),
        Index("ix_contacts_ws_created", "workspace_id", "created_at"),
    )

    phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320))
    city: Mapped[str | None] = mapped_column(String(128))
    source: Mapped[str] = mapped_column(String(32), default="inbound", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="new", nullable=False)
    opted_in: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    opted_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    tags: Mapped[list["Tag"]] = relationship(secondary="contact_tags", back_populates="contacts")


class Tag(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("workspace_id", "name"),)

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str | None] = mapped_column(String(16))

    contacts: Mapped[list["Contact"]] = relationship(secondary="contact_tags", back_populates="tags")


class ContactTag(Base, UUIDMixin):
    __tablename__ = "contact_tags"
    __table_args__ = (UniqueConstraint("contact_id", "tag_id"),)

    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), index=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), index=True
    )
