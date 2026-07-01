"""Pydantic schemas for WhatsApp account connect/manage."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ConnectWhatsAppRequest(BaseModel):
    """Manual credentials connect (Settings → Auth & WhatsApp)."""
    waba_id: str = Field(min_length=1)
    phone_number_id: str = Field(min_length=1)
    display_phone_number: str = Field(min_length=1)
    business_name: str = Field(min_length=1)
    access_token: str = Field(min_length=1)   # plain — encrypted before DB save


class WhatsAppAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    waba_id: str
    phone_number_id: str
    display_phone_number: str | None
    verified_business_name: str | None
    quality_rating: str | None
    messaging_limit_tier: str | None
    status: str
    webhook_subscribed: bool
    connected_at: datetime | None
    created_at: datetime


class WebhookVerifyParams(BaseModel):
    hub_mode: str = Field(alias="hub.mode")
    hub_verify_token: str = Field(alias="hub.verify_token")
    hub_challenge: str = Field(alias="hub.challenge")

    model_config = ConfigDict(populate_by_name=True)
