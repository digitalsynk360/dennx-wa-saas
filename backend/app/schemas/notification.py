"""Pydantic schemas for notification preferences (Phase 13)."""
from pydantic import BaseModel


class NotificationPreferences(BaseModel):
    email_new_message: bool = True
    email_campaign_complete: bool = True
    email_template_status: bool = True
    email_weekly_summary: bool = False
    push_new_message: bool = True


class UpdateNotificationPreferencesRequest(BaseModel):
    email_new_message: bool | None = None
    email_campaign_complete: bool | None = None
    email_template_status: bool | None = None
    email_weekly_summary: bool | None = None
    push_new_message: bool | None = None
