"""
Production Flow Builder models — Phase 10 extension.

flow_versions   : immutable snapshots (draft + published)
flow_executions : one row per contact-run of a published flow
execution_logs  : per-node log inside an execution (for Test mode)
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Index, Integer, String, Text
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class FlowVersion(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """Immutable snapshot of a flow at Save/Publish time."""
    __tablename__ = "flow_versions"
    __table_args__ = (
        Index("ix_flow_versions_flow_id", "flow_id"),
    )

    flow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_flows.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default="draft", nullable=False  # draft | published
    )
    nodes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    edges: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    viewport: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    changelog: Mapped[str | None] = mapped_column(Text)


class FlowExecution(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """One execution of a flow for a specific contact."""
    __tablename__ = "flow_executions"
    __table_args__ = (
        Index("ix_flow_executions_flow_contact", "flow_id", "contact_id"),
        Index("ix_flow_executions_status", "workspace_id", "status"),
    )

    flow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_flows.id", ondelete="CASCADE"),
        nullable=False,
    )
    flow_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("flow_versions.id", ondelete="SET NULL")
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL")
    )
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(
        String(16), default="running", nullable=False
        # running | waiting | completed | failed | stopped | test
    )
    current_node_id: Mapped[str | None] = mapped_column(String(64))
    variables: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    trigger_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    logs: Mapped[list["ExecutionLog"]] = relationship(
        "ExecutionLog", backref="execution", lazy="select", cascade="all, delete-orphan"
    )


class ExecutionLog(Base, UUIDMixin, TimestampMixin):
    """Per-node execution log entry — powers the Test Flow panel."""
    __tablename__ = "execution_logs"
    __table_args__ = (
        Index("ix_execution_logs_exec_id", "execution_id"),
    )

    execution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("flow_executions.id", ondelete="CASCADE"),
        nullable=False,
    )
    node_id: Mapped[str] = mapped_column(String(64), nullable=False)
    node_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default="ok", nullable=False  # ok | error | skipped
    )
    input_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    output_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    selected_output: Mapped[str | None] = mapped_column(String(64))  # which handle was taken
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)