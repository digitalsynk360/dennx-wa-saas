"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, CheckCheck, Plus, Send, Sparkles, Tag as TagIcon, Trash2, UserCheck, Users, X, Zap } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { useInboxWebSocket } from "@/hooks/inbox/use-inbox-ws";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  ConversationListResponse,
  ConversationResponse,
  MessageListResponse,
  MessageResponse,
} from "@/types/inbox";
import type { ContactResponse, TagResponse } from "@/types/contacts";
import type { SuggestReplyResponse } from "@/types/ai";

// Agent from /conversations/agents
interface AgentBrief {
  member_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  is_online: boolean;
}

const HANDLING_TABS = [
  { label: "All", value: undefined },
  { label: "Bot", value: "bot" },
  { label: "Requested", value: "requested" },
  { label: "Intervened", value: "intervened" },
];

const HANDLING_BADGE: Record<string, string> = {
  bot: "bg-blue-100 text-blue-700",
  requested: "bg-yellow-100 text-yellow-700",
  intervened: "bg-green-100 text-green-700",
};

export default function InboxPage() {
  const { user } = useAuth();

  // Conversation list
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [handling, setHandling] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Messages
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  // Compose
  const [sendText, setSendText] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [contactDetail, setContactDetail] = useState<ContactResponse | null>(null);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Assign agent modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [agents, setAgents] = useState<AgentBrief[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConv =
    conversations.find((c) => c.id === selectedId) ?? null;

  // ─── Load conversations ──────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: "1", page_size: "50" });
      if (handling) params.set("handling", handling);
      const { data } = await api.get<ConversationListResponse>(
        `/conversations?${params}`
      );
      setConversations(data.items);
      setTotal(data.total);
    } catch {
      setError("Failed to load conversations");
    }
  }, [handling]);

  // ─── Load messages ────────────────────────────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    setMsgLoading(true);
    try {
      const { data } = await api.get<MessageListResponse>(
        `/conversations/${convId}/messages?page_size=100`
      );
      setMessages(data.items);
    } catch {
      setError("Failed to load messages");
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Quick replies (saved on this device) ────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem("deenx_quick_replies");
      if (raw) setQuickReplies(JSON.parse(raw));
    } catch {}
  }, []);

  const saveQuickReplies = (list: string[]) => {
    setQuickReplies(list);
    try { localStorage.setItem("deenx_quick_replies", JSON.stringify(list)); } catch {}
  };

  const addQuickReply = () => {
    const text = sendText.trim();
    if (!text || quickReplies.includes(text)) return;
    saveQuickReplies([...quickReplies, text]);
  };

  const removeQuickReply = (idx: number) => {
    saveQuickReplies(quickReplies.filter((_, i) => i !== idx));
  };

  // ─── Contact detail + tags for right panel ───────────────────────────
  const loadContactDetail = useCallback(async (contactId: string) => {
    try {
      const { data } = await api.get<ContactResponse>(`/contacts/${contactId}`);
      setContactDetail(data);
    } catch { setContactDetail(null); }
  }, []);

  useEffect(() => {
    const cid = selectedConv?.contact.id;
    if (cid) loadContactDetail(cid);
    else setContactDetail(null);
    setTagPickerOpen(false);
  }, [selectedConv?.contact.id, loadContactDetail]);

  const openTagPicker = async () => {
    try {
      const { data } = await api.get<TagResponse[]>("/tags");
      setAllTags(data);
    } catch {}
    setTagPickerOpen((v) => !v);
  };

  const attachTag = async (tagId: string) => {
    if (!contactDetail) return;
    try {
      const { data } = await api.post<ContactResponse>(
        `/contacts/${contactDetail.id}/tags`,
        { tag_ids: [tagId] }
      );
      setContactDetail(data);
    } catch { setError("Failed to add tag"); }
  };

  const createAndAttachTag = async () => {
    const name = newTagName.trim();
    if (!name || !contactDetail) return;
    try {
      const { data: tag } = await api.post<TagResponse>("/tags", { name, color: null });
      setNewTagName("");
      await attachTag(tag.id);
      setAllTags((t) => [...t, tag]);
    } catch { setError("Failed to create tag"); }
  };

  // ─── Real-time WebSocket ──────────────────────────────────────────────
  useInboxWebSocket(
    useCallback(
      (event) => {
        if (event.event === "new_message") {
          loadConversations();
          const d = event.data as { conversation_id?: string };
          if (d?.conversation_id === selectedId) {
            loadMessages(selectedId!);
          }
        }
        if (event.event === "conversation_updated") {
          loadConversations();
        }
      },
      [loadConversations, loadMessages, selectedId]
    )
  );

  // ─── Send message ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!sendText.trim() || !selectedId) return;
    setSending(true);
    try {
      await api.post(`/conversations/${selectedId}/messages`, {
        content: sendText,
        message_type: "text",
      });
      setSendText("");
      await loadMessages(selectedId);
      await loadConversations(); // refresh handling badge
    } catch {
      setError("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // ─── AI Suggest Reply ─────────────────────────────────────────────────
  const handleSuggestReply = async () => {
    if (!selectedId) return;
    setSuggesting(true);
    try {
      const { data } = await api.post<SuggestReplyResponse>(
        "/ai/suggest-reply",
        { conversation_id: selectedId }
      );
      setSendText(data.suggestion);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(msg || "AI suggest failed — check OPENAI_API_KEY");
    } finally {
      setSuggesting(false);
    }
  };

  // ─── Resolve ──────────────────────────────────────────────────────────
  const handleResolve = async () => {
    if (!selectedId) return;
    try {
      await api.patch(`/conversations/${selectedId}`, { status: "resolved" });
      await loadConversations();
      setSelectedId(null);
    } catch {
      setError("Failed to resolve conversation");
    }
  };

  // ─── Intervene (take over from bot, assign to self) ───────────────────
  const handleIntervene = async () => {
    if (!selectedId || !user) return;
    try {
      await api.patch(`/conversations/${selectedId}`, {
        handling: "intervened",
        assigned_agent_id: user.id,
      });
      await loadConversations();
    } catch {
      setError("Failed to intervene");
    }
  };

  // ─── Assign to agent modal ────────────────────────────────────────────
  const openAssignModal = async () => {
    setAssignOpen(true);
    setAgentsLoading(true);
    try {
      const { data } = await api.get<AgentBrief[]>("/conversations/agents");
      setAgents(data);
    } catch {
      setError("Failed to load agents");
    } finally {
      setAgentsLoading(false);
    }
  };

  const handleAssign = async (agentUserId: string) => {
    if (!selectedId) return;
    setAssigning(true);
    try {
      await api.patch(`/conversations/${selectedId}`, {
        handling: "intervened",
        assigned_agent_id: agentUserId,
      });
      setAssignOpen(false);
      await loadConversations();
    } catch {
      setError("Failed to assign agent");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async () => {
    if (!selectedId) return;
    try {
      await api.patch(`/conversations/${selectedId}`, {
        handling: "bot",
        clear_agent: true,
      });
      setAssignOpen(false);
      await loadConversations();
    } catch {
      setError("Failed to unassign");
    }
  };

  return (
    <>
      <Topbar title="Inbox" />
      <div className="flex h-[calc(100dvh-56px)] sm:h-[calc(100dvh-64px)] overflow-hidden">
        {/* ── Conversation list ── */}
        <div
          className={cn(
            "w-full flex-col border-r border-border bg-white md:flex md:w-80 md:flex-shrink-0",
            selectedId ? "hidden" : "flex"
          )}
        >
          {/* Handling tabs */}
          <div className="flex border-b border-border px-2 overflow-x-auto">
            {HANDLING_TABS.map((tab) => (
              <button
                key={tab.label}
                onClick={() => {
                  setHandling(tab.value);
                  setSelectedId(null);
                }}
                className={cn(
                  "px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
                  handling === tab.value
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.value === undefined && total > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs text-white">
                    {total}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="border-b border-border p-2">
            <Input placeholder="Search contacts..." className="h-8 text-sm" />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                No conversations yet.
              </p>
            )}
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={cn(
                  "w-full border-b border-border p-3 text-left transition-colors hover:bg-muted/50",
                  selectedId === conv.id && "bg-muted/70"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    {conv.contact.name || conv.contact.phone}
                  </span>
                  {conv.last_message_at && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(conv.last_message_at), "HH:mm")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <p className="truncate text-xs text-muted-foreground max-w-[160px]">
                    {conv.last_message_preview || "No messages"}
                  </p>
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        HANDLING_BADGE[conv.handling] || "bg-muted text-muted-foreground"
                      )}
                    >
                      {conv.handling}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-white">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {conv.contact.phone}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Chat area ── */}
        {selectedConv ? (
          <div className="flex flex-1 flex-col min-w-0">
            {/* Chat header */}
            <div className="flex flex-col gap-2 border-b border-border bg-white px-3 sm:px-4 py-2.5 sm:py-3 flex-shrink-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  onClick={() => setSelectedId(null)}
                  className="rounded-md p-1.5 -ml-1 text-muted-foreground hover:bg-muted md:hidden flex-shrink-0"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">
                    {selectedConv.contact.name || selectedConv.contact.phone}
                  </p>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-medium",
                      HANDLING_BADGE[selectedConv.handling] || "bg-muted text-muted-foreground"
                    )}
                  >
                    {selectedConv.handling}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedConv.contact.phone}
                  {selectedConv.assigned_agent_id && (
                    <span className="ml-2 text-green-600">● Agent assigned</span>
                  )}
                </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-shrink-0 sm:justify-end">
                {/* Intervene — only show when bot is handling */}
                {selectedConv.handling === "bot" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleIntervene}
                    title="Take over from bot and assign to yourself"
                  >
                    <UserCheck className="h-4 w-4 mr-1" />
                    Intervene
                  </Button>
                )}
                {/* Assign to any agent */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openAssignModal}
                  title="Assign to a team member"
                >
                  <Users className="h-4 w-4 mr-1" />
                  Assign
                </Button>
                {/* Resolve */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResolve}
                  title="Mark resolved"
                >
                  <CheckCheck className="h-4 w-4 mr-1 text-green-600" />
                  Resolve
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-[#f0f2f5] p-4 space-y-2">
              {error && <Alert variant="destructive">{error}</Alert>}
              {msgLoading && (
                <p className="text-center text-sm text-muted-foreground">
                  Loading...
                </p>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.direction === "outbound" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm",
                      msg.direction === "outbound"
                        ? "bg-[#d9fdd3] text-foreground"
                        : "bg-white text-foreground"
                    )}
                  >
                    {/* Bot label */}
                    {msg.direction === "outbound" && !msg.sent_by_id && (
                      <p className="text-xs text-blue-500 font-medium mb-0.5">
                        🤖 Bot
                      </p>
                    )}
                    <p>{msg.content}</p>
                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {format(new Date(msg.created_at), "HH:mm")}
                      {msg.direction === "outbound" && (
                        <span className="ml-1 text-blue-500">
                          {msg.status === "read"
                            ? "✓✓"
                            : msg.status === "delivered"
                            ? "✓✓"
                            : "✓"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            {selectedConv.status === "resolved" ? (
              <div className="border-t border-border bg-white p-3 text-center text-sm text-muted-foreground">
                Conversation resolved. Send a template to re-engage.
              </div>
            ) : (
              <div className="relative border-t border-border bg-white flex-shrink-0">
                {qrOpen && (
                  <div className="absolute bottom-full left-2 right-2 z-20 mb-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-white p-2 shadow-lg sm:left-3 sm:right-auto sm:w-80">
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <p className="text-xs font-semibold text-muted-foreground">Quick Replies</p>
                      <button
                        onClick={addQuickReply}
                        disabled={!sendText.trim()}
                        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
                        title="Save current text as quick reply"
                      >
                        <Plus className="h-3 w-3" /> Save current
                      </button>
                    </div>
                    {quickReplies.length === 0 ? (
                      <p className="px-1 pb-1 text-xs text-muted-foreground">
                        Koi quick reply nahi. Message likho aur &quot;Save current&quot; dabao.
                      </p>
                    ) : (
                      quickReplies.map((qr, i) => (
                        <div key={i} className="group flex items-start gap-1 rounded-lg px-1.5 py-1 hover:bg-muted">
                          <button
                            onClick={() => { setSendText(qr); setQrOpen(false); }}
                            className="flex-1 truncate text-left text-sm"
                            title={qr}
                          >
                            {qr}
                          </button>
                          <button
                            onClick={() => removeQuickReply(i)}
                            className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-red-600 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              <div className="flex items-center gap-2 p-3">
                <Button
                  variant="outline"
                  onClick={() => setQrOpen((v) => !v)}
                  title="Quick Replies"
                  className={cn(qrOpen && "border-primary text-primary")}
                >
                  <Zap className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSuggestReply}
                  disabled={suggesting}
                  title="AI Suggest Reply"
                >
                  <Sparkles
                    className={cn(
                      "h-4 w-4",
                      suggesting && "animate-pulse text-primary"
                    )}
                  />
                </Button>
                <Input
                  value={sendText}
                  onChange={(e) => setSendText(e.target.value)}
                  placeholder="Type a message..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !sendText.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden flex-1 items-center justify-center text-muted-foreground md:flex">
            Select a conversation to start chatting
          </div>
        )}

        {/* ── Right panel — Contact info ── */}
        {selectedConv && (
          <div className="hidden w-64 flex-shrink-0 border-l border-border bg-white p-4 lg:block overflow-y-auto">
            <h3 className="font-semibold text-sm mb-3">Conversation Info</h3>

            {/* ── Contact Tags ── */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <TagIcon className="h-3.5 w-3.5" /> TAGS
                </p>
                <button
                  onClick={openTagPicker}
                  className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {contactDetail?.tags.length ? (
                  contactDetail.tags.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: (t.color || "#16a34a") + "1a",
                        color: t.color || "#16a34a",
                      }}
                    >
                      {t.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No tags</span>
                )}
              </div>
              {tagPickerOpen && (
                <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2">
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {allTags
                      .filter((t) => !contactDetail?.tags.some((ct) => ct.id === t.id))
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => attachTag(t.id)}
                          className="rounded-full border border-border bg-white px-2 py-0.5 text-xs hover:border-primary hover:text-primary"
                        >
                          + {t.name}
                        </button>
                      ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="New tag..."
                      className="h-7 text-xs"
                      onKeyDown={(e) => e.key === "Enter" && createAndAttachTag()}
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={createAndAttachTag} disabled={!newTagName.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="capitalize">{selectedConv.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Handling</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    HANDLING_BADGE[selectedConv.handling]
                  )}
                >
                  {selectedConv.handling}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unread</span>
                <span>{selectedConv.unread_count}</span>
              </div>
              {selectedConv.assigned_agent_id && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Assigned to</span>
                  <button
                    onClick={handleUnassign}
                    className="text-xs text-red-500 hover:underline"
                    title="Click to unassign"
                  >
                    Unassign
                  </button>
                </div>
              )}
              {selectedConv.session_expires_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Session ends</span>
                  <span className="text-xs">
                    {format(
                      new Date(selectedConv.session_expires_at),
                      "dd MMM HH:mm"
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Assign Agent Modal ── */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-96 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold">Assign Agent</h2>
              <button
                onClick={() => setAssignOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-3">
              {agentsLoading ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  Loading agents...
                </p>
              ) : agents.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  No agents found. Add team members in Sub Admins.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {agents.map((agent) => {
                    const isAssigned =
                      selectedConv?.assigned_agent_id === agent.user_id;
                    return (
                      <button
                        key={agent.member_id}
                        onClick={() => handleAssign(agent.user_id)}
                        disabled={assigning || isAssigned}
                        className={cn(
                          "w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-muted/60 transition-colors",
                          isAssigned && "bg-primary/10 border border-primary/30"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                              {agent.full_name.charAt(0).toUpperCase()}
                            </div>
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white",
                                agent.is_online ? "bg-green-500" : "bg-gray-300"
                              )}
                            />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {agent.full_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {agent.role} ·{" "}
                              {agent.is_online ? "Online" : "Offline"}
                            </p>
                          </div>
                        </div>
                        {isAssigned && (
                          <span className="text-xs text-primary font-medium">
                            Assigned
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedConv?.assigned_agent_id && (
              <div className="px-5 py-3 border-t border-border">
                <button
                  onClick={handleUnassign}
                  className="text-sm text-red-500 hover:underline"
                >
                  Remove assignment
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}