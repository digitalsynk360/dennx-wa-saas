"""Pydantic schemas for WhatsApp Templates (Phase 8)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TemplateButton(BaseModel):
    type: str = Field(description="QUICK_REPLY | URL | PHONE_NUMBER")
    text: str
    url: str | None = None
    phone_number: str | None = None


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    meta_template_id: str | None
    name: str
    language: str
    category: str
    status: str
    rejection_reason: str | None
    header_type: str | None
    header_content: str | None
    header_handle: str | None
    body_text: str
    footer_text: str | None
    buttons: list[dict]
    variable_samples: dict
    created_at: datetime


class CreateTemplateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255, pattern=r"^[a-z0-9_]+$")
    language: str = Field(default="en", max_length=16)
    category: str = Field(description="MARKETING | UTILITY | AUTHENTICATION")
    header_type: str | None = Field(default="none")
    header_content: str | None = None
    header_handle: str | None = None
    body_text: str = Field(min_length=1)
    footer_text: str | None = None
    buttons: list[TemplateButton] = Field(default_factory=list)
    variable_samples: dict = Field(default_factory=dict)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        allowed = {"MARKETING", "UTILITY", "AUTHENTICATION"}
        if v.upper() not in allowed:
            raise ValueError(f"category must be one of {allowed}")
        return v.upper()


class TemplateListResponse(BaseModel):
    items: list[TemplateResponse]
    total: int