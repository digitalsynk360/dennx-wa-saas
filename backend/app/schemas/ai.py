"""Pydantic schemas for AI features (Phase 11): knowledge base, suggested
replies, conversation summaries, and lead-score explanations."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str | None
    content: str
    source: str | None
    created_at: datetime


class CreateKnowledgeDocumentRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    content: str = Field(min_length=1)
    source: str | None = Field(default="manual", max_length=255)


class KnowledgeDocumentListResponse(BaseModel):
    items: list[KnowledgeDocumentResponse]
    total: int


class SuggestReplyRequest(BaseModel):
    conversation_id: uuid.UUID


class SuggestReplyResponse(BaseModel):
    suggestion: str
    used_knowledge_chunks: int


class SummarizeConversationResponse(BaseModel):
    summary: str
    sentiment: str  # positive | neutral | negative
    key_points: list[str]


class AskAssistantRequest(BaseModel):
    """General-purpose RAG question — used by the in-app AI assistant
    widget for the business owner (not the end-customer chatbot)."""
    question: str = Field(min_length=1, max_length=2000)


class AskAssistantResponse(BaseModel):
    answer: str
    used_knowledge_chunks: int
