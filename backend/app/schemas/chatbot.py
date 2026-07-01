"""Pydantic schemas for Chatbot Rules (Phase 9) and Flow Builder (Phase 10)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------------- Chatbot Rules (Phase 9) ----------------

class ChatbotRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    keywords: list[str]
    match_type: str
    reply_text: str | None
    reply_payload: dict
    priority: int
    is_active: bool
    flow_id: uuid.UUID | None
    created_at: datetime


class CreateChatbotRuleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    keywords: list[str] = Field(min_length=1)
    match_type: str = Field(default="contains", description="exact | contains | starts_with | regex")
    reply_text: str | None = None
    reply_payload: dict = Field(default_factory=dict)
    priority: int = 0
    is_active: bool = True
    flow_id: uuid.UUID | None = None


class UpdateChatbotRuleRequest(BaseModel):
    name: str | None = None
    keywords: list[str] | None = None
    match_type: str | None = None
    reply_text: str | None = None
    priority: int | None = None
    is_active: bool | None = None
    flow_id: uuid.UUID | None = None


class ReorderRulesRequest(BaseModel):
    rule_ids_in_order: list[uuid.UUID]


# ---------------- Flow Builder (Phase 10) ----------------

class FlowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    trigger_type: str
    nodes: list[dict]
    edges: list[dict]
    viewport: dict
    version: int
    created_at: datetime


class CreateFlowRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    trigger_type: str = Field(default="keyword", description="keyword | welcome | manual | api")


class SaveFlowGraphRequest(BaseModel):
    nodes: list[dict]
    edges: list[dict]
    viewport: dict = Field(default_factory=dict)


class FlowListResponse(BaseModel):
    items: list[FlowResponse]
    total: int
