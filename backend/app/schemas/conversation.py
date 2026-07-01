"""Pydantic schemas for Inbox / Conversations."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ContactBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str | None
    phone: str


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    contact: ContactBrief
    status: str
    handling: str
    unread_count: int
    last_message_at: datetime | None
    last_message_preview: str | None
    session_expires_at: datetime | None
    assigned_agent_id: uuid.UUID | None
    created_at: datetime


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    wamid: str | None
    direction: str
    message_type: str
    content: str | None
    media_url: str | None
    status: str
    sent_by_id: uuid.UUID | None
    created_at: datetime


class SendMessageRequest(BaseModel):
    content: str
    message_type: str = "text"


class ConversationListResponse(BaseModel):
    items: list[ConversationResponse]
    total: int
    page: int
    page_size: int


class MessageListResponse(BaseModel):
    items: list[MessageResponse]
    total: int


class UpdateConversationRequest(BaseModel):
    status: str | None = None        # open | resolved
    handling: str | None = None      # bot | requested | intervened
    assigned_agent_id: uuid.UUID | None = None
    clear_agent: bool = False         # pass True to unassign agent


class WorkspaceMemberBrief(BaseModel):
    """Used by the Inbox Assign Agent dropdown."""
    member_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    role: str
    is_online: bool