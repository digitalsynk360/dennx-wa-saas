"""Pydantic schemas for Billing & Usage + Superadmin plan management."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    plan: str
    billing_cycle: str
    status: str
    monthly_message_quota: int | None
    contact_limit: int | None
    seats: int
    whatsapp_number_limit: int | None
    ai_chatbot_enabled: bool
    addons: dict
    base_price_paise: int
    gst_percent: int
    current_period_start: datetime | None
    current_period_end: datetime | None
    trial_used: bool


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    number: str
    subtotal: int
    gst_amount: int
    amount: int
    currency: str
    status: str
    line_items: list
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
    plan: str  # legacy self-serve — kept for backward compatibility


# ── Superadmin plan management ──

class PlanCatalogEntry(BaseModel):
    plan: str
    label: str
    monthly_price_paise: int | None
    messages: int | None
    contacts: int | None
    seats: int | None
    whatsapp_numbers: int | None
    ai_chatbot: bool


class PricePreviewRequest(BaseModel):
    plan: str
    billing_cycle: str  # monthly | quarterly | yearly
    addons: dict = Field(default_factory=dict)
    custom_monthly_paise: int | None = None  # Enterprise only


class PricePreviewResponse(BaseModel):
    base_price_paise: int
    addons_price_paise: int
    subtotal_paise: int
    gst_paise: int
    total_paise: int
    months: int


class AssignPlanRequest(BaseModel):
    plan: str
    billing_cycle: str
    addons: dict = Field(default_factory=dict)
    custom_monthly_paise: int | None = None


class EditSubscriptionRequest(BaseModel):
    seats: int | None = None
    contact_limit: int | None = None
    whatsapp_number_limit: int | None = None
    monthly_message_quota: int | None = None
    ai_chatbot_enabled: bool | None = None
    current_period_end: datetime | None = None
    status: str | None = None