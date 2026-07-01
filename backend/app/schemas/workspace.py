"""Pydantic schemas for workspace management and Sub Admins
(workspace members)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    plan: str
    is_active: bool
    settings: dict
    created_at: datetime


class UpdateWorkspaceRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    settings: dict | None = None


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None


class MemberUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: EmailStr


class WorkspaceMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user: MemberUserResponse
    role: RoleResponse
    is_online: bool
    last_seen_at: datetime | None = None
    created_at: datetime


class InviteMemberRequest(BaseModel):
    """Mirrors the reference 'New Sub Admin' modal: if the email
    already has an account, the user is added to this workspace with
    the given role; otherwise a new account is created for them."""

    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role_name: str = Field(description="Admin | Manager | Agent")


class UpdateMemberRoleRequest(BaseModel):
    role_name: str = Field(description="Admin | Manager | Agent")


class MessageResponse(BaseModel):
    message: str


# ---------------- Agents (Phase 13 — reuses WorkspaceMember) ----------------

class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    member_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str
    role: str
    is_online: bool
    last_seen_at: datetime | None
    open_conversations_assigned: int
