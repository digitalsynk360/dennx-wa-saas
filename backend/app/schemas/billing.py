"""Pydantic schemas for Billing & Usage (Phase 13)."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    plan: str
    status: str
    monthly_message_quota: int | None
    seats: int
    current_period_start: datetime | None
    current_period_end: datetime | None


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    number: str
    amount: int
    currency: str
    status: str
    paid_at: datetime | None
    created_at: datetime


class InvoiceListResponse(BaseModel):
    items: list[InvoiceResponse]
    total: int


class UsageResponse(BaseModel):
    messages_used_this_period: int
    messages_quota: int | None
    seats_used: int
    seats_quota: int


class ChangePlanRequest(BaseModel):
    plan: str  # free | starter | growth | enterprise
