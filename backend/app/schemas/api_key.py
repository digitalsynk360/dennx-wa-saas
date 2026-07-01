"""Pydantic schemas for Developer API Keys (Phase 13)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    key_prefix: str
    last_used_at: datetime | None
    is_active: bool
    created_at: datetime


class CreateApiKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class CreateApiKeyResponse(BaseModel):
    """The full key is only ever returned once, at creation time."""
    id: uuid.UUID
    name: str
    api_key: str
    created_at: datetime


class ApiKeyListResponse(BaseModel):
    items: list[ApiKeyResponse]
    total: int
