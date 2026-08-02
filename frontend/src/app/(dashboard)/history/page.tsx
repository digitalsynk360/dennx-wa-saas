"use client";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { MessagesSquare } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import type { ConversationListResponse, ConversationResponse, MessageListResponse, MessageResponse } from "@/types/inbox";

export default function HistoryPage() {
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ConversationListResponse>("/conversations/history?page_size=50")
      .then(({ data }) => setConversations(data.items))
      .catch(() => setError("Failed to load history"));
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const { data } = await api.get<MessageListResponse>(`/conversations/${id}/messages?page_size=100`);
      setMessages(data.items);
    } catch { setError("Failed to load messages"); }
  }, []);

  const handleSelect = (id: string) => { setSelectedId(id); loadMessages(id); };

  return (
    <>
      <Topbar title="History" />
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        <div className="w-80 flex-shrink-0 overflow-y-auto border-r border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resolved ({conversations.length})</p>
          </div>
          {error && <Alert variant="destructive" className="m-2">{error}</Alert>}
          {conversations.map((conv) => (
            <button key={conv.id} onClick={() => handleSelect(conv.id)}
              className={`w-full border-b border-border p-3 text-left hover:bg-muted/50 ${selectedId === conv.id ? "bg-muted/70" : ""}`}>
              <div className="flex justify-between">
                <span className="font-medium text-sm">{conv.contact.name || conv.contact.phone}</span>
                {conv.last_message_at && (
                  <span className="text-xs text-muted-foreground">{format(new Date(conv.last_message_at), "HH:mm")}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{conv.contact.phone}</p>
            </button>
          ))}
        </div>
        <div className="flex-1 flex flex-col">
          {selectedId ? (
            <div className="flex-1 overflow-y-auto bg-[#f0f2f5] p-4 space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${msg.direction === "outbound" ? "bg-[#d9fdd3]" : "bg-white"}`}>
                    <p>{msg.content}</p>
                    <p className="text-xs text-muted-foreground text-right mt-1">{format(new Date(msg.created_at), "HH:mm")}</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-border bg-card p-3 text-center text-sm text-muted-foreground">
                24-hour session expired — send a template to re-engage
              </div>
            </div>
          ) : (
            <EmptyState
              className="flex-1"
              icon={MessagesSquare}
              title="Select a conversation"
              description="Pick a resolved conversation from the list to view its full message history."
            />
          )}
        </div>
      </div>
    </>
  );
}
