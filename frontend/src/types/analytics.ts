export interface OverviewMetrics {
  total_conversations: number;
  open_conversations: number;
  resolved_conversations: number;
  total_contacts: number;
  new_contacts_this_period: number;
  messages_sent: number;
  messages_received: number;
  avg_response_time_minutes: number | null;
  active_campaigns: number;
}

export interface DailyMessageCount {
  date: string;
  sent: number;
  received: number;
}

export interface CampaignPerformance {
  campaign_id: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  delivery_rate: number;
  read_rate: number;
}

export interface AnalyticsOverviewResponse {
  metrics: OverviewMetrics;
  daily_messages: DailyMessageCount[];
  campaign_performance: CampaignPerformance[];
  top_chatbot_rules: { rule_id: string; name: string; trigger_count: number }[];
  period_days: number;
}
