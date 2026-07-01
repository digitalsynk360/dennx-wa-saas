export interface SubscriptionResponse {
  id: string;
  plan: string;
  status: string;
  monthly_message_quota: number | null;
  seats: number;
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface InvoiceResponse {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export interface UsageResponse {
  messages_used_this_period: number;
  messages_quota: number | null;
  seats_used: number;
  seats_quota: number;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
}

export interface NotificationPreferences {
  email_new_message: boolean;
  email_campaign_complete: boolean;
  email_template_status: boolean;
  email_weekly_summary: boolean;
  push_new_message: boolean;
}

export interface AgentResponse {
  member_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  is_online: boolean;
  last_seen_at: string | null;
  open_conversations_assigned: number;
}
