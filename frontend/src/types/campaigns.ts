export interface CampaignRecipientResponse {
  id: string;
  contact_id: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface CampaignResponse {
  id: string;
  name: string;
  campaign_type: string;
  template_id: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  pause_reason: string | null;
  total_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
}

export interface CampaignDetailResponse extends CampaignResponse {
  recipients: CampaignRecipientResponse[];
}

export interface CampaignListResponse {
  items: CampaignResponse[];
  total: number;
  page: number;
  page_size: number;
}