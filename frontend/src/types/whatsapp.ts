export interface WhatsAppAccountResponse {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_business_name: string | null;
  quality_rating: string | null;
  status: string;
  webhook_subscribed: boolean;
  connected_at: string | null;
  created_at: string;
}
