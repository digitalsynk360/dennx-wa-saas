export interface TagResponse {
  id: string;
  name: string;
  color: string | null;
}

export interface ContactResponse {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  city: string | null;
  source: string;
  status: string;
  opted_in: boolean;
  is_blocked: boolean;
  last_message_at: string | null;
  tags: TagResponse[];
  created_at: string;
}

export interface ContactListResponse {
  items: ContactResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}
