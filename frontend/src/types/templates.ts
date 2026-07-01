export interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface TemplateResponse {
  id: string;
  meta_template_id: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  rejection_reason: string | null;
  header_type: string | null;
  header_content: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: TemplateButton[];
  variable_samples: Record<string, unknown>;
  created_at: string;
}

export interface TemplateListResponse {
  items: TemplateResponse[];
  total: number;
}
