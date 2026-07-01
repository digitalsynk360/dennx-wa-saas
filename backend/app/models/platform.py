"""Cross-cutting platform tables: audit trail, outbound (custom)
chatbot webhooks, and the pgvector RAG knowledge base for AI."""
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin

EMBEDDING_DIMENSIONS = 1536  # text-embedding-3-small


class AuditLog(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_ws_created", "workspace_id", "created_at"),)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(64))
    resource_id: Mapped[str | None] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(512))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)


class OutboundWebhook(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """Every inbound message is forwarded to all active webhooks in
    parallel, HMAC-SHA256 signed with the per-webhook secret."""

    __tablename__ = "outbound_webhooks"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    secret_encrypted: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    events: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class KnowledgeDocument(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """RAG knowledge base chunk for AI assistants (pgvector similarity search)."""

    __tablename__ = "knowledge_documents"

    title: Mapped[str | None] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str | None] = mapped_column(String(255))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
