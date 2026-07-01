export interface ChatbotRuleResponse {
  id: string;
  name: string;
  keywords: string[];
  match_type: string;
  reply_text: string | null;
  reply_payload: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  flow_id: string | null;
  created_at: string;
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string;
}

export interface FlowResponse {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: Record<string, unknown>;
  version: number;
  created_at: string;
}

export interface FlowListResponse {
  items: FlowResponse[];
  total: number;
}
