"""Pydantic schemas for Contact management (Phase 6)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    color: str | None


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    phone: str
    name: str | None
    email: str | None
    city: str | None
    source: str
    status: str
    opted_in: bool
    is_blocked: bool
    last_message_at: datetime | None
    tags: list[TagResponse]
    created_at: datetime


class CreateContactRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=32)
    name: str | None = Field(default=None, max_length=255)
    email: str | None = None
    city: str | None = None
    source: str = "manual"
    status: str = "new"


class UpdateContactRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    email: str | None = None
    city: str | None = None
    status: str | None = None
    is_blocked: bool | None = None


class ContactListResponse(BaseModel):
    items: list[ContactResponse]
    total: int
    page: int
    page_size: int


class CreateTagRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str | None = None


class AddTagsRequest(BaseModel):
    tag_ids: list[uuid.UUID]


class ImportResult(BaseModel):
    created: int
    skipped: int
    errors: list[str]
