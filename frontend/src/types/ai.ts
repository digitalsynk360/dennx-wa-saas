export interface KnowledgeDocumentResponse {
  id: string;
  title: string | null;
  content: string;
  source: string | null;
  created_at: string;
}

export interface KnowledgeDocumentListResponse {
  items: KnowledgeDocumentResponse[];
  total: number;
}

export interface SuggestReplyResponse {
  suggestion: string;
  used_knowledge_chunks: number;
}

export interface SummarizeConversationResponse {
  summary: string;
  sentiment: string;
  key_points: string[];
}

export interface AskAssistantResponse {
  answer: string;
  used_knowledge_chunks: number;
}
