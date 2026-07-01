"""Pydantic schemas for the Analytics dashboard (Phase 12)."""
from datetime import date

from pydantic import BaseModel


class OverviewMetrics(BaseModel):
    total_conversations: int
    open_conversations: int
    resolved_conversations: int
    total_contacts: int
    new_contacts_this_period: int
    messages_sent: int
    messages_received: int
    avg_response_time_minutes: float | None
    active_campaigns: int


class DailyMessageCount(BaseModel):
    date: date
    sent: int
    received: int


class CampaignPerformance(BaseModel):
    campaign_id: str
    name: str
    sent: int
    delivered: int
    read: int
    failed: int
    delivery_rate: float
    read_rate: float


class TopChatbotRule(BaseModel):
    rule_id: str
    name: str
    trigger_count: int


class AnalyticsOverviewResponse(BaseModel):
    metrics: OverviewMetrics
    daily_messages: list[DailyMessageCount]
    campaign_performance: list[CampaignPerformance]
    top_chatbot_rules: list[TopChatbotRule]
    period_days: int
