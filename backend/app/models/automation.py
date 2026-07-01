"""
Chatbot automation: keyword rules, visual flow graphs (node/edge JSON
from the Flow Builder — Message, Text & Buttons, List Menu, Dynamic
List, Multi Product, Condition, Wait, Save Reply, API Call, Update
Contact, Delay, Template, Transfer, Connect Flow, End), per-contact
flow execution state, and event-driven automations.
"""
import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin


class ChatbotRule(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "chatbot_rules"
    __table_args__ = (Index("ix_chatbot_rules_ws_priority", "workspace_id", "priority"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    keywords: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    match_type: Mapped[str] = mapped_column(String(16), default="contains", nullable=False)
    reply_text: Mapped[str | None] = mapped_column(Text)
    reply_payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    flow_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_flows.id", ondelete="SET NULL")
    )


class ChatbotFlow(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "chatbot_flows"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(32), default="keyword", nullable=False)
    nodes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    edges: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    viewport: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class FlowSession(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """Per-contact execution state of a running flow (current node,
    collected variables) so flows survive process restarts."""

    __tablename__ = "flow_sessions"
    __table_args__ = (Index("ix_flow_sessions_ws_contact", "workspace_id", "contact_id"),)

    flow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chatbot_flows.id", ondelete="CASCADE")
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE")
    )
    current_node_id: Mapped[str | None] = mapped_column(String(64))
    variables: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)


class Automation(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """Event-driven rule: trigger -> conditions -> actions."""

    __tablename__ = "automations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger_event: Mapped[str] = mapped_column(String(64), nullable=False)
    conditions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    actions: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    run_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
