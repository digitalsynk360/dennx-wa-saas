"""Pydantic schemas for Campaigns (Phase 7)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CampaignRecipientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    contact_id: uuid.UUID
    status: str
    error_message: str | None
    created_at: datetime


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    campaign_type: str
    template_id: uuid.UUID
    status: str
    scheduled_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    pause_reason: str | None
    total_count: int
    sent_count: int
    delivered_count: int
    read_count: int
    failed_count: int
    created_at: datetime


class CreateCampaignRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    campaign_type: str = Field(default="broadcast", description="broadcast | api")
    template_id: uuid.UUID
    scheduled_at: datetime | None = None
    contact_ids: list[uuid.UUID] = Field(default_factory=list)
    tag_ids: list[uuid.UUID] = Field(default_factory=list)
    variable_mapping: dict = Field(default_factory=dict)


class CampaignListResponse(BaseModel):
    items: list[CampaignResponse]
    total: int
    page: int
    page_size: int


class CampaignDetailResponse(CampaignResponse):
    recipients: list[CampaignRecipientResponse]


class UpdateCampaignStatusRequest(BaseModel):
    action: str = Field(description="pause | resume | cancel")
