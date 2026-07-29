"""
AI Hub configuration — workspace-scoped AI provider settings,
audit trail, and usage/token tracking for analytics.
"""
import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDMixin

DEFAULT_ERROR_RESPONSES = {
    "429": "We'll be back shortly — a lot of messages are coming in right now. 🙏",
    "timeout": "Sorry, the response is taking longer than expected. Please try again shortly.",
    "provider_down": "The AI assistant is under maintenance right now. Our team will get back to you soon.",
    "network": "We hit a network issue. Please send your message again.",
    "maintenance": "System maintenance is in progress. We'll be back soon!",
    "unknown": "Something went wrong. Our team has been notified.",
}

DEFAULT_TOOLS = {
    "generate_itinerary_pdf": True,
    "generate_quotation_pdf": True,
    "search_product": True,
    "search_customer": True,
    "search_orders": False,
    "create_order": False,
    "cancel_order": False,
    "refund": False,
    "payment_link": False,
    "book_appointment": True,
    "crm_update": True,
    "webhook": False,
    "api_request": False,
    "human_handoff": True,
    "send_whatsapp": True,
    "send_email": False,
}

DEFAULT_SECURITY = {
    "prompt_injection_protection": True,
    "jailbreak_detection": True,
    "pii_masking": False,
    "audit_logs": True,
    "content_moderation": True,
    "rate_limiting": True,
}


class AiSettings(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """One row per workspace — the AI engine's full configuration."""
    __tablename__ = "ai_settings"
    __table_args__ = (Index("ix_ai_settings_ws", "workspace_id", unique=True),)

    # Master + mode
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mode: Mapped[str] = mapped_column(String(16), default="platform", nullable=False)  # platform|hybrid|strict

    # Provider (hybrid / strict own AI)
    provider: Mapped[str] = mapped_column(String(32), default="openai", nullable=False)
    model: Mapped[str] = mapped_column(String(128), default="gpt-4o-mini", nullable=False)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text)
    base_url: Mapped[str | None] = mapped_column(String(512))
    organization: Mapped[str | None] = mapped_column(String(255))

    # Generation params
    temperature: Mapped[float] = mapped_column(Float, default=0.7, nullable=False)
    top_p: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    frequency_penalty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    presence_penalty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, default=1024, nullable=False)
    timeout_s: Mapped[int] = mapped_column(Integer, default=30, nullable=False)

    # Persona
    assistant_name: Mapped[str] = mapped_column(String(64), default="Assistant", nullable=False)
    business_category: Mapped[str | None] = mapped_column(String(64))  # e.g. "travel_tourism" — see ai_categories.py
    system_prompt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    language: Mapped[str] = mapped_column(String(32), default="Hinglish", nullable=False)
    tone: Mapped[str] = mapped_column(String(32), default="friendly", nullable=False)

    # Memory
    memory_window: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    summarizer_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # CRM intelligence
    crm_confidence: Mapped[int] = mapped_column(Integer, default=75, nullable=False)  # 50-100
    crm_auto_apply: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # JSON blobs
    error_responses: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    tools: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    security: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Last connection test result (cached for status card)
    last_test_status: Mapped[str | None] = mapped_column(String(32))  # connected|invalid_key|...
    last_test_at_iso: Mapped[str | None] = mapped_column(String(48))


class AiAuditLog(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "ai_audit_logs"
    __table_args__ = (Index("ix_ai_audit_ws_created", "workspace_id", "created_at"),)

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


class AiUsageLog(Base, UUIDMixin, TimestampMixin, TenantMixin):
    __tablename__ = "ai_usage_logs"
    __table_args__ = (Index("ix_ai_usage_ws_created", "workspace_id", "created_at"),)

    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_micro_usd: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # cost * 1e6
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="chat", nullable=False)  # chat|suggest|summary|rag