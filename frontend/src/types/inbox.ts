export interface ContactBrief {
  id: string;
  name: string | null;
  phone: string;
}

export interface ConversationResponse {
  id: string;
  contact: ContactBrief;
  status: string;
  handling: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  session_expires_at: string | null;
  assigned_agent_id: string | null;
  created_at: string;
}

export interface MessageResponse {
  id: string;
  wamid: string | null;
  direction: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  status: string;
  sent_by_id: string | null;
  created_at: string;
}

export interface ConversationListResponse {
  items: ConversationResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface MessageListResponse {
  items: MessageResponse[];
  total: number;
}
