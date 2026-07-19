"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Bot, Brain, CheckCircle2, Cpu, Database, DollarSign,
  FileText, Globe, Loader2, Lock, Plus, RefreshCw, Shield, Sparkles, Trash2,
  Upload, Wrench, XCircle, Zap,
} from "lucide-react";

import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Topbar } from "@/components/layout/topbar";
import { useWorkspaceWebSocket } from "@/hooks/shared/use-workspace-ws";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, getErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────
interface UsageAgg { requests: number; success: number; input_tokens: number; output_tokens: number; cost_usd: number }
interface Overview {
  status: string; mode: string; provider: string; model: string; enabled: boolean;
  usage: { today: UsageAgg; week: UsageAgg; month: UsageAgg; success_rate: number };
  tokens: { input: number; output: number; total: number; estimated_cost_usd: number };
  health: Record<string, { status: string; latency_ms?: number; error?: string; note?: string; docs?: number; last_check?: string }>;
}
interface AiSettings {
  enabled: boolean; mode: string; provider: string; model: string;
  api_key_masked: string | null; has_api_key: boolean;
  base_url: string | null; organization: string | null;
  temperature: number; top_p: number; frequency_penalty: number; presence_penalty: number;
  max_tokens: number; timeout_s: number;
  assistant_name: string; system_prompt: string; language: string; tone: string;
  memory_window: number; summarizer_enabled: boolean;
  crm_confidence: number; crm_auto_apply: boolean;
  error_responses: Record<string, string>;
  tools: Record<string, boolean>;
  security: Record<string, boolean>;
  last_test_status: string | null; last_test_at: string | null;
}

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Claude (Anthropic)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "grok", label: "Grok (xAI)" },
  { id: "azure", label: "Azure OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "mistral", label: "Mistral" },
  { id: "perplexity", label: "Perplexity" },
  { id: "ollama", label: "Ollama (Self-hosted)" },
];

const MODES = [
  { id: "platform", title: "Platform AI", desc: "Deenx AI credits use hote hain — apni key ki zarurat nahi" },
  { id: "hybrid", title: "Hybrid AI", desc: "Apni API key + platform features dono" },
  { id: "strict", title: "Strict Own AI", desc: "Sirf aapki API key — full control" },
];

const TEST_LABELS: Record<string, { label: string; ok: boolean }> = {
  connected: { label: "✅ Connected", ok: true },
  invalid_key: { label: "❌ Invalid API Key", ok: false },
  billing_required: { label: "💳 Billing Required", ok: false },
  quota_exceeded: { label: "📊 Quota Exceeded", ok: false },
  rate_limited: { label: "⏳ Rate Limited", ok: false },
  provider_down: { label: "🔴 Provider Down", ok: false },
};

const HEALTH_LABELS: Record<string, string> = {
  database: "Database", redis: "Redis", vector_db: "Vector DB",
  provider_api: "Provider API", worker: "Worker", memory: "Memory",
  knowledge_base: "Knowledge Base",
};

const ERROR_TABS: { key: string; label: string; desc: string }[] = [
  { key: "429", label: "429 Rate Limit", desc: "Jab bahut zyada requests aa rahi hon" },
  { key: "timeout", label: "Timeout", desc: "Provider response slow ho" },
  { key: "provider_down", label: "Provider Down", desc: "AI provider unavailable ho" },
  { key: "network", label: "Network Error", desc: "Connection issue" },
  { key: "maintenance", label: "Maintenance", desc: "Planned downtime" },
  { key: "unknown", label: "Unknown", desc: "Koi bhi anjaan error" },
];

const TOOL_META: { key: string; label: string; desc: string }[] = [
  { key: "search_product", label: "Search Product", desc: "Catalogue mein products dhundhna" },
  { key: "search_customer", label: "Search Customer", desc: "Contact records access" },
  { key: "search_orders", label: "Search Orders", desc: "Order history dekhna" },
  { key: "create_order", label: "Create Order", desc: "Naya order banana" },
  { key: "cancel_order", label: "Cancel Order", desc: "Order cancel karna" },
  { key: "refund", label: "Refund", desc: "Refund initiate karna" },
  { key: "payment_link", label: "Payment Link", desc: "Payment link bhejna" },
  { key: "book_appointment", label: "Book Appointment", desc: "Appointment schedule" },
  { key: "crm_update", label: "CRM Update", desc: "Tags/leads update karna" },
  { key: "webhook", label: "Webhook", desc: "External webhook trigger" },
  { key: "api_request", label: "API Request", desc: "Custom API calls" },
  { key: "human_handoff", label: "Human Handoff", desc: "Chat human ko transfer" },
  { key: "send_whatsapp", label: "Send WhatsApp", desc: "WhatsApp messages bhejna" },
  { key: "send_email", label: "Send Email", desc: "Email bhejna" },
];

const SECURITY_META: { key: string; label: string; desc: string }[] = [
  { key: "prompt_injection_protection", label: "Prompt Injection Protection", desc: "Malicious prompts block" },
  { key: "jailbreak_detection", label: "Jailbreak Detection", desc: "Bypass attempts detect" },
  { key: "pii_masking", label: "PII Masking", desc: "Personal info mask in logs" },
  { key: "audit_logs", label: "Audit Logs", desc: "Har action logged" },
  { key: "content_moderation", label: "Content Moderation", desc: "Unsafe content filter" },
  { key: "rate_limiting", label: "Rate Limiting", desc: "Per-user request limits" },
];


export default function AiChatbotPage() {
  const [tab, setTab] = useState<"overview" | "provider" | "settings" | "knowledge" | "errors" | "tools" | "advanced" | "analytics">("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [s, setS] = useState<AiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Provider form
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // ── Knowledge Base ──
  const [kbStats, setKbStats] = useState<{
    total_chunks: number; by_type: Record<string, number>;
    website_pages: number; last_sync: string | null;
    task: { state: string; task?: string; pages_done?: number; chunks_done?: number; error?: string; filename?: string; url?: string };
  } | null>(null);
  const [kbDocs, setKbDocs] = useState<{ id: string; title: string | null; source: string | null; created_at: string }[]>([]);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [maxPages, setMaxPages] = useState(15);
  const [kbBusy, setKbBusy] = useState(false);
  const [qaTitle, setQaTitle] = useState("");
  const [qaContent, setQaContent] = useState("");

  const loadKb = useCallback(async () => {
    try {
      const [st, docs] = await Promise.all([
        api.get("/ai-hub/knowledge/stats"),
        api.get<{ items: { id: string; title: string | null; source: string | null; created_at: string }[] }>("/ai/knowledge"),
      ]);
      setKbStats(st.data);
      setKbDocs(docs.data.items.slice(0, 100));
    } catch {}
  }, []);

  useEffect(() => { if (tab === "knowledge") loadKb(); }, [tab, loadKb]);

  // Live task progress via WebSocket — replaces the old 3s poll.
  // Backend pushes "kb_task_update" on every crawl page / upload chunk.
  const handleKbWsEvent = useCallback((msg: { event: string; data: unknown }) => {
    if (msg.event !== "kb_task_update") return;
    const task = msg.data as { state?: string; pages_done?: number; chunks_done?: number; error?: string; filename?: string; url?: string };
    setKbStats((prev) => (prev ? { ...prev, task: { ...prev.task, ...task } } : prev));
    // Once a task finishes, refresh the stats/doc list once (counts, last_sync, docs table)
    if (task.state === "done" || task.state === "error") loadKb();
  }, [loadKb]);
  useWorkspaceWebSocket(handleKbWsEvent);

  const startCrawl = async () => {
    if (!crawlUrl.trim()) return;
    setKbBusy(true); setError(null);
    try {
      await api.post("/ai-hub/knowledge/crawl", { url: crawlUrl.trim(), max_pages: maxPages });
      setSuccess("Crawl started! Progress neeche live dikhega.");
      await loadKb();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Crawl start failed"));
    } finally { setKbBusy(false); }
  };

  const uploadKbFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setKbBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/ai-hub/knowledge/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSuccess(`${file.name} processing started!`);
      await loadKb();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Upload failed"));
    } finally { setKbBusy(false); e.target.value = ""; }
  };

  const addManualQa = async () => {
    if (!qaContent.trim()) return;
    setKbBusy(true); setError(null);
    try {
      await api.post("/ai/knowledge", { title: qaTitle.trim() || null, content: qaContent.trim(), source: "manual" });
      setSuccess("Knowledge added!");
      setQaTitle(""); setQaContent("");
      await loadKb();
    } catch { setError("Add failed — OPENAI_API_KEY backend mein set hai?"); }
    finally { setKbBusy(false); }
  };

  const deleteKbDoc = async (id: string) => {
    try { await api.delete(`/ai/knowledge/${id}`); await loadKb(); }
    catch { setError("Delete failed"); }
  };

  const reindexKb = async () => {
    if (!confirm("Sab chunks dobara embed honge — API cost lagegi. Continue?")) return;
    try { await api.post("/ai-hub/knowledge/reindex"); setSuccess("Reindex started!"); await loadKb(); }
    catch { setError("Reindex failed"); }
  };

  const deleteAllKb = async () => {
    if (!confirm("PURI knowledge base delete ho jayegi (embeddings + docs). Pakka?")) return;
    try {
      const { data } = await api.delete<{ deleted: number }>("/ai-hub/knowledge/all");
      setSuccess(`${data.deleted} chunks deleted`);
      await loadKb();
    } catch { setError("Delete failed"); }
  };

  // ── Phase 3: errors / tools / advanced ──
  const [errorTab, setErrorTab] = useState("429");
  const [previewChannel, setPreviewChannel] = useState<"whatsapp" | "livechat" | "email">("whatsapp");
  const [flushing, setFlushing] = useState(false);

  const setErrorResponse = (key: string, val: string) => {
    if (!s) return;
    setS({ ...s, error_responses: { ...s.error_responses, [key]: val } });
  };

  const restoreErrorDefaults = async () => {
    try {
      const { data } = await api.get<{ error_responses: Record<string, string> }>("/ai-hub/defaults");
      if (s) setS({ ...s, error_responses: data.error_responses });
      setSuccess("Defaults restored — Save dabana mat bhoolna");
    } catch { setError("Defaults load failed"); }
  };

  const toggleTool = async (key: string, val: boolean) => {
    if (!s) return;
    const nextTools = { ...s.tools, [key]: val };
    setS({ ...s, tools: nextTools });
    await patch({ tools: nextTools }, val ? "Tool enabled — AI ab use kar sakta hai" : "Tool disabled");
  };

  const toggleSecurity = async (key: string, val: boolean) => {
    if (!s) return;
    const next = { ...s.security, [key]: val };
    setS({ ...s, security: next });
    await patch({ security: next }, "Security setting updated");
  };

  const flushMemoryCache = async () => {
    if (!confirm("Redis conversation memory delete hogi (Vector DB/knowledge safe rahegi). Continue?")) return;
    setFlushing(true);
    try {
      const { data } = await api.post<{ keys_deleted: number }>("/ai-hub/memory/flush");
      setSuccess(`Memory flushed — ${data.keys_deleted} keys deleted`);
    } catch { setError("Flush failed — Redis check karo"); }
    finally { setFlushing(false); }
  };

  // ── Analytics ──
  const [analytics, setAnalytics] = useState<{
    total_requests: number; success: number; failed: number; success_rate: number;
    input_tokens: number; output_tokens: number; total_tokens: number;
    total_cost_usd: number; avg_cost_usd: number; avg_latency_ms: number;
    daily: { date: string; requests: number; tokens: number; failures: number }[];
    top_models: { model: string; requests: number }[];
    top_sources: { source: string; requests: number }[];
  } | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);

  useEffect(() => {
    if (tab !== "analytics") return;
    api.get(`/ai-hub/analytics?days=${analyticsDays}`)
      .then(({ data }) => setAnalytics(data))
      .catch(() => setError("Analytics load failed"));
  }, [tab, analyticsDays]);



  const load = useCallback(async () => {
    try {
      const [o, st] = await Promise.all([
        api.get<Overview>("/ai-hub/overview"),
        api.get<AiSettings>("/ai-hub/settings"),
      ]);
      setOverview(o.data);
      setS(st.data);
    } catch { setError("AI Hub load nahi hua — backend check karo"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadModels = useCallback(async (provider: string) => {
    setModelsLoading(true);
    try {
      const { data } = await api.get<{ models: string[] }>(`/ai-hub/models?provider=${provider}`);
      setModels(data.models);
    } catch { setModels([]); }
    finally { setModelsLoading(false); }
  }, []);

  useEffect(() => { if (s?.provider) loadModels(s.provider); }, [s?.provider, loadModels]);

  const patch = async (data: Record<string, unknown>, msg = "Saved!") => {
    setSaving(true); setError(null);
    try {
      await api.patch("/ai-hub/settings", data);
      setSuccess(msg);
      setTimeout(() => setSuccess(null), 2500);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Save failed"));
    } finally { setSaving(false); }
  };

  const saveProvider = async () => {
    if (!s) return;
    const payload: Record<string, unknown> = {
      mode: s.mode, provider: s.provider, model: s.model,
      base_url: s.base_url || null, organization: s.organization || null,
      temperature: s.temperature, max_tokens: s.max_tokens, timeout_s: s.timeout_s,
    };
    if (apiKey.trim()) payload.api_key = apiKey.trim();
    await patch(payload, "Provider configuration saved!");
    setApiKey("");
  };

  const testConnection = async () => {
    if (!s) return;
    setTesting(true); setTestResult(null);
    try {
      const { data } = await api.post<{ result: string; detail: string }>("/ai-hub/test-connection", {
        provider: s.provider,
        api_key: apiKey.trim() || undefined,
      });
      setTestResult(data.result);
      await load();
    } catch { setTestResult("provider_down"); }
    finally { setTesting(false); }
  };

  const statusColor = overview?.status === "online" ? "bg-green-100 text-green-700"
    : overview?.status === "disabled" ? "bg-gray-100 text-gray-600"
    : overview?.status === "initializing" ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";

  const dot = (st: string) => st === "green" ? "bg-green-500" : st === "yellow" ? "bg-amber-400" : "bg-red-500";

  return (
    <>
      <Topbar title="AI Chatbot" />
      <div className="p-4 sm:p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {/* Tabs */}
        <div className="mb-6 flex overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([["overview", "Overview"], ["provider", "AI Provider"], ["settings", "AI Settings"], ["knowledge", "Knowledge Base"], ["errors", "Error Responses"], ["tools", "Tools"], ["advanced", "Memory & Security"], ["analytics", "Analytics"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors",
                tab === id ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ═══ OVERVIEW ═══ */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {/* Status card */}
              <button onClick={() => setTab("provider")} className="rounded-xl border border-border bg-white p-4 text-left transition-shadow hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-4.5 w-4.5 h-[18px] w-[18px]" /></span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", statusColor)}>
                    {overview?.status || "..."}
                  </span>
                </div>
                <p className="text-sm font-semibold">AI Status</p>
                <p className="text-xs text-muted-foreground capitalize">Mode: {overview?.mode || "—"}</p>
              </button>

              {/* Model card */}
              <button onClick={() => setTab("provider")} className="rounded-xl border border-border bg-white p-4 text-left transition-shadow hover:shadow-md">
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Cpu className="h-[18px] w-[18px]" /></span>
                <p className="text-sm font-semibold">Current Model</p>
                <p className="truncate text-xs text-muted-foreground">{overview?.provider} · {overview?.model}</p>
              </button>

              {/* Actions card */}
              <div className="rounded-xl border border-border bg-white p-4">
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><Zap className="h-[18px] w-[18px]" /></span>
                <p className="text-sm font-semibold">AI Actions</p>
                <p className="text-xs text-muted-foreground">
                  Today {overview?.usage.today.requests ?? 0} · Week {overview?.usage.week.requests ?? 0} · Month {overview?.usage.month.requests ?? 0}
                </p>
                <p className="mt-1 text-xs">
                  <span className="font-semibold text-green-600">{overview?.usage.success_rate ?? 100}%</span>
                  <span className="text-muted-foreground"> success rate</span>
                </p>
              </div>

              {/* Tokens card */}
              <div className="rounded-xl border border-border bg-white p-4">
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600"><DollarSign className="h-[18px] w-[18px]" /></span>
                <p className="text-sm font-semibold">Token Usage (30d)</p>
                <p className="text-xs text-muted-foreground">
                  In {(overview?.tokens.input ?? 0).toLocaleString()} · Out {(overview?.tokens.output ?? 0).toLocaleString()}
                </p>
                <p className="mt-1 text-xs">
                  <span className="font-semibold">${overview?.tokens.estimated_cost_usd ?? 0}</span>
                  <span className="text-muted-foreground"> est. cost</span>
                </p>
              </div>
            </div>

            {/* Health grid */}
            <div className="rounded-xl border border-border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" /> System Health</p>
                <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {overview && Object.entries(overview.health).map(([key, h]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-border p-2.5 text-center"
                    title={[
                      h.latency_ms != null ? `Latency: ${h.latency_ms}ms` : null,
                      h.note ? `Note: ${h.note}` : null,
                      h.error ? `Error: ${h.error}` : null,
                      h.docs != null ? `Docs: ${h.docs}` : null,
                    ].filter(Boolean).join(" · ") || "Healthy"}
                  >
                    <span className={cn("mx-auto mb-1.5 block h-2.5 w-2.5 rounded-full", dot(h.status))} />
                    <p className="text-[11px] font-medium">{HEALTH_LABELS[key] || key}</p>
                    {h.latency_ms != null && <p className="text-[10px] text-muted-foreground">{h.latency_ms}ms</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PROVIDER ═══ */}
        {tab === "provider" && s && (
          <div className="max-w-3xl space-y-5">
            {/* Mode cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setS({ ...s, mode: m.id })}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left transition-all",
                    s.mode === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <Sparkles className={cn("h-5 w-5", s.mode === m.id ? "text-primary" : "text-muted-foreground")} />
                    {s.mode === m.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-sm font-semibold">{m.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.desc}</p>
                </button>
              ))}
            </div>

            {s.mode === "platform" ? (
              <div className="rounded-xl border border-border bg-white p-5">
                <p className="mb-1 text-sm font-semibold">Platform AI Active</p>
                <p className="text-sm text-muted-foreground">
                  Deenx AI platform credits use ho rahe hain. Apni API key ki zarurat nahi.
                  Is month: <span className="font-semibold">{overview?.usage.month.requests ?? 0} requests</span> ·
                  <span className="font-semibold"> {(overview?.tokens.total ?? 0).toLocaleString()} tokens</span>
                </p>
                <Button className="mt-4" onClick={() => patch({ mode: "platform" }, "Platform AI activated!")} disabled={saving}>
                  {saving ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-border bg-white p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Provider</Label>
                    <Select value={s.provider} onChange={(e) => { setS({ ...s, provider: e.target.value, model: "" }); }}>
                      {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model {modelsLoading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}</Label>
                    <Select value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })}>
                      <option value="">Select model...</option>
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                      {s.model && !models.includes(s.model) && <option value={s.model}>{s.model}</option>}
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> API Key</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={s.has_api_key ? `Saved: ${s.api_key_masked} — nayi key daalo replace ke liye` : "sk-..."}
                  />
                  <p className="text-xs text-muted-foreground">Key encrypt hokar store hoti hai (Fernet AES-128). Kabhi plain text mein save nahi hoti.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Base URL (optional — Azure/Ollama)</Label>
                    <Input value={s.base_url || ""} onChange={(e) => setS({ ...s, base_url: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Organization (optional)</Label>
                    <Input value={s.organization || ""} onChange={(e) => setS({ ...s, organization: e.target.value })} placeholder="org-..." />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Temperature: {s.temperature}</Label>
                    <input type="range" min={0} max={2} step={0.1} value={s.temperature}
                      onChange={(e) => setS({ ...s, temperature: Number(e.target.value) })} className="w-full accent-[var(--primary,#16a34a)]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Tokens</Label>
                    <Input type="number" min={1} max={32768} value={s.max_tokens} onChange={(e) => setS({ ...s, max_tokens: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timeout (s)</Label>
                    <Input type="number" min={5} max={300} value={s.timeout_s} onChange={(e) => setS({ ...s, timeout_s: Number(e.target.value) })} />
                  </div>
                </div>

                {/* Test result */}
                {(testResult || s.last_test_status) && (
                  <div className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-sm",
                    TEST_LABELS[testResult || s.last_test_status || ""]?.ok
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  )}>
                    {TEST_LABELS[testResult || s.last_test_status || ""]?.ok
                      ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {TEST_LABELS[testResult || s.last_test_status || ""]?.label || testResult || s.last_test_status}
                    {s.last_test_at && <span className="ml-auto text-xs opacity-70">{new Date(s.last_test_at).toLocaleString("en-IN")}</span>}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={testConnection} disabled={testing}>
                    {testing ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing...</> : "Test Connection"}
                  </Button>
                  <Button onClick={saveProvider} disabled={saving || !s.model}>
                    {saving ? "Saving..." : "Save Configuration"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab === "settings" && s && (
          <div className="max-w-3xl space-y-5">
            {/* Master switch */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-white p-5">
              <div>
                <p className="text-sm font-semibold">AI Master Switch</p>
                <p className="text-xs text-muted-foreground">
                  OFF karne par AI band, sab chats human agents ko jayengi
                </p>
              </div>
              <Switch
                checked={s.enabled}
                onCheckedChange={(v) => { setS({ ...s, enabled: v }); patch({ enabled: v }, v ? "AI enabled!" : "AI disabled — chats human ko assign hongi"); }}
              />
            </div>

            {/* Assistant persona */}
            <div className="space-y-4 rounded-xl border border-border bg-white p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Assistant Name</Label>
                  <Input value={s.assistant_name} onChange={(e) => setS({ ...s, assistant_name: e.target.value })} placeholder="Priya" />
                </div>
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select value={s.language} onChange={(e) => setS({ ...s, language: e.target.value })}>
                    {["Hinglish", "Hindi", "English", "Auto-detect"].map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tone</Label>
                  <Select value={s.tone} onChange={(e) => setS({ ...s, tone: e.target.value })}>
                    {["friendly", "professional", "casual", "formal", "enthusiastic"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>System Prompt</Label>
                  <span className="text-xs text-muted-foreground">~{Math.ceil(s.system_prompt.length / 4)} tokens</span>
                </div>
                <textarea
                  value={s.system_prompt}
                  onChange={(e) => setS({ ...s, system_prompt: e.target.value })}
                  rows={8}
                  placeholder="Tum Deenx AI ki sales assistant ho. Customer se Hinglish mein friendly baat karo..."
                  className="w-full resize-y rounded-md border border-border px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Temperature: {s.temperature}</Label>
                  <input type="range" min={0} max={2} step={0.1} value={s.temperature}
                    onChange={(e) => setS({ ...s, temperature: Number(e.target.value) })} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label>Top P: {s.top_p}</Label>
                  <input type="range" min={0} max={1} step={0.05} value={s.top_p}
                    onChange={(e) => setS({ ...s, top_p: Number(e.target.value) })} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label>Freq. Penalty: {s.frequency_penalty}</Label>
                  <input type="range" min={-2} max={2} step={0.1} value={s.frequency_penalty}
                    onChange={(e) => setS({ ...s, frequency_penalty: Number(e.target.value) })} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label>Pres. Penalty: {s.presence_penalty}</Label>
                  <input type="range" min={-2} max={2} step={0.1} value={s.presence_penalty}
                    onChange={(e) => setS({ ...s, presence_penalty: Number(e.target.value) })} className="w-full" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Max Response Tokens</Label>
                  <Input type="number" min={1} max={32768} value={s.max_tokens} onChange={(e) => setS({ ...s, max_tokens: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Memory Window (messages)</Label>
                  <Input type="number" min={1} max={100} value={s.memory_window} onChange={(e) => setS({ ...s, memory_window: Number(e.target.value) })} />
                </div>
              </div>

              <Button
                onClick={() => patch({
                  assistant_name: s.assistant_name, language: s.language, tone: s.tone,
                  system_prompt: s.system_prompt, temperature: s.temperature, top_p: s.top_p,
                  frequency_penalty: s.frequency_penalty, presence_penalty: s.presence_penalty,
                  max_tokens: s.max_tokens, memory_window: s.memory_window,
                }, "AI settings saved!")}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        )}
        {/* ═══ KNOWLEDGE BASE ═══ */}
        {tab === "knowledge" && (
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: Database, label: "Total Chunks", value: kbStats?.total_chunks ?? 0 },
                { icon: Globe, label: "Website Pages", value: kbStats?.website_pages ?? 0 },
                { icon: FileText, label: "Sources", value: Object.keys(kbStats?.by_type || {}).length },
                { icon: RefreshCw, label: "Last Sync", value: kbStats?.last_sync ? new Date(kbStats.last_sync).toLocaleDateString("en-IN") : "—" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border bg-white p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><s.icon className="h-[18px] w-[18px]" /></span>
                  <span>
                    <span className="block text-lg font-bold leading-tight">{s.value}</span>
                    <span className="block text-xs text-muted-foreground">{s.label}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Live task banner */}
            {kbStats?.task && ["crawling", "processing", "reindexing"].includes(kbStats.task.state) && (
              <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold capitalize">{kbStats.task.state}... {kbStats.task.url || kbStats.task.filename || ""}</p>
                  <p className="text-xs">
                    {kbStats.task.pages_done != null && `Pages: ${kbStats.task.pages_done} · `}
                    Chunks embedded: {kbStats.task.chunks_done ?? 0}
                  </p>
                </div>
              </div>
            )}
            {kbStats?.task?.state === "error" && (
              <Alert variant="destructive">Task failed: {kbStats.task.error}</Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Website crawler */}
              <div className="space-y-3 rounded-xl border border-border bg-white p-5">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Globe className="h-4 w-4 text-primary" /> Business Website</p>
                <p className="text-xs text-muted-foreground">URL daalo — crawler pages nikalega, duplicate hatayega, chunks banakar embeddings PGVector mein store karega.</p>
                <Input value={crawlUrl} onChange={(e) => setCrawlUrl(e.target.value)} placeholder="https://yourbusiness.com" />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Label className="whitespace-nowrap text-xs">Max pages</Label>
                    <Input type="number" min={1} max={50} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} className="h-8 w-20 text-sm" />
                  </div>
                  <Button size="sm" onClick={startCrawl} disabled={kbBusy || !crawlUrl.trim()}>
                    {kbBusy ? "Starting..." : "Start Crawl"}
                  </Button>
                </div>
              </div>

              {/* File upload */}
              <div className="space-y-3 rounded-xl border border-border bg-white p-5">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Upload className="h-4 w-4 text-primary" /> Upload Document</p>
                <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, CSV, MD — max 20 MB. Extract → chunk → embed → store.</p>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-6 text-center hover:border-primary/50">
                  <input type="file" accept=".pdf,.docx,.txt,.csv,.md" className="hidden" onChange={uploadKbFile} disabled={kbBusy} />
                  <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium text-primary">Click to upload</p>
                  <p className="text-xs text-muted-foreground">PDF / DOCX / TXT / CSV / MD</p>
                </label>
              </div>
            </div>

            {/* Manual QA */}
            <div className="space-y-3 rounded-xl border border-border bg-white p-5">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Plus className="h-4 w-4 text-primary" /> Manual Knowledge / FAQ</p>
              <Input value={qaTitle} onChange={(e) => setQaTitle(e.target.value)} placeholder="Title (e.g. Refund Policy)" />
              <textarea
                value={qaContent}
                onChange={(e) => setQaContent(e.target.value)}
                rows={3}
                placeholder="Q: Refund kaise milega? A: 7 din ke andar..."
                className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button size="sm" onClick={addManualQa} disabled={kbBusy || !qaContent.trim()}>Add Knowledge</Button>
            </div>

            {/* Docs table + actions */}
            <div className="rounded-xl border border-border bg-white">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Knowledge Documents ({kbDocs.length})</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={reindexKb}><RefreshCw className="h-3.5 w-3.5" /> Reindex</Button>
                  <Button variant="outline" size="sm" onClick={deleteAllKb} className="text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete All</Button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-border bg-white text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Title</th>
                      <th className="px-4 py-2.5">Source</th>
                      <th className="px-4 py-2.5">Added</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {kbDocs.map((d) => (
                      <tr key={d.id}>
                        <td className="max-w-[240px] truncate px-4 py-2.5 font-medium">{d.title || "Untitled"}</td>
                        <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-muted-foreground">{d.source || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => deleteKbDoc(d.id)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                    {kbDocs.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Knowledge base khali hai — website crawl karo ya file upload karo!</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {/* ═══ ERROR RESPONSES ═══ */}
        {tab === "errors" && s && (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {/* Error type tabs */}
              <div className="flex flex-wrap gap-2">
                {ERROR_TABS.map((et) => (
                  <button
                    key={et.key}
                    onClick={() => setErrorTab(et.key)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                      errorTab === et.key ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {et.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-white p-5">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    {ERROR_TABS.find((e) => e.key === errorTab)?.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{ERROR_TABS.find((e) => e.key === errorTab)?.desc} — customer ko yeh message dikhega</p>
                </div>
                <textarea
                  value={s.error_responses?.[errorTab] || ""}
                  onChange={(e) => setErrorResponse(errorTab, e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="Customer-friendly error message..."
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => patch({ error_responses: s.error_responses }, "Error responses saved!")} disabled={saving}>
                    {saving ? "Saving..." : "Save All Responses"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={restoreErrorDefaults}>Restore Defaults</Button>
                </div>
              </div>
            </div>

            {/* Preview simulator */}
            <div className="space-y-3 rounded-xl border border-border p-4" style={{ backgroundColor: "hsl(90,20%,94%)" }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview Simulator</p>
                <div className="flex gap-1">
                  {(["whatsapp", "livechat", "email"] as const).map((ch) => (
                    <button
                      key={ch}
                      onClick={() => setPreviewChannel(ch)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[10px] font-semibold uppercase",
                        previewChannel === ch ? "bg-primary text-white" : "bg-white text-muted-foreground"
                      )}
                    >
                      {ch === "whatsapp" ? "WA" : ch === "livechat" ? "Chat" : "Email"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl p-3" style={{ backgroundColor: "hsl(90,25%,90%)" }}>
                {/* Customer message */}
                <div className="mb-2 ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-xs text-gray-800 shadow-sm">
                  Order kab tak aayega?
                  <p className="mt-0.5 text-right text-[9px] text-gray-500">10:32</p>
                </div>
                {/* Bot error reply */}
                <div className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-xs text-gray-800 shadow-sm whitespace-pre-wrap",
                  previewChannel === "email" ? "bg-gray-50 border border-gray-200 rounded-md" : "rounded-tl-none bg-white"
                )}>
                  {previewChannel === "email" && <p className="mb-1 border-b border-gray-200 pb-1 text-[10px] font-semibold text-gray-500">Subject: Re: Your query</p>}
                  {s.error_responses?.[errorTab] || "..."}
                  <p className="mt-0.5 text-right text-[9px] text-gray-400">{s.assistant_name} · 10:32</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Channel: {previewChannel === "whatsapp" ? "WhatsApp" : previewChannel === "livechat" ? "Live Chat" : "Email"} — real-time preview jaise customer dekhega</p>
            </div>
          </div>
        )}

        {/* ═══ TOOLS & PERMISSIONS ═══ */}
        {tab === "tools" && s && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-4">
              <Wrench className="h-4 w-4 text-primary" />
              <p className="text-sm">
                <span className="font-semibold">{Object.values(s.tools || {}).filter(Boolean).length} tools enabled</span>
                <span className="text-muted-foreground"> — toggle karte hi turant register/unregister hota hai, AI agla message se use kar payega</span>
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOOL_META.map((t) => {
                const on = Boolean(s.tools?.[t.key]);
                return (
                  <div key={t.key} className={cn("flex items-start justify-between gap-3 rounded-xl border p-4 transition-colors", on ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-white")}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
                    </div>
                    <Switch checked={on} onCheckedChange={(v) => toggleTool(t.key, v)} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ MEMORY / CRM / SECURITY ═══ */}
        {tab === "advanced" && s && (
          <div className="max-w-3xl space-y-5">
            {/* Memory */}
            <div className="space-y-4 rounded-xl border border-border bg-white p-5">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Brain className="h-4 w-4 text-primary" /> Memory</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Sliding Window (messages)</Label>
                  <Input type="number" min={1} max={100} value={s.memory_window}
                    onChange={(e) => setS({ ...s, memory_window: Number(e.target.value) })} />
                  <p className="text-xs text-muted-foreground">AI ko last N messages yaad rahenge (default 15)</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Background Summarizer</p>
                    <p className="text-xs text-muted-foreground">Lambi chats summarize → token bachao</p>
                  </div>
                  <Switch checked={s.summarizer_enabled} onCheckedChange={(v) => { setS({ ...s, summarizer_enabled: v }); patch({ summarizer_enabled: v }); }} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={() => patch({ memory_window: s.memory_window }, "Memory limit updated!")} disabled={saving}>Save Memory Settings</Button>
                <Button variant="outline" size="sm" onClick={flushMemoryCache} disabled={flushing} className="text-red-600 hover:bg-red-50">
                  {flushing ? "Flushing..." : "Flush Cache"}
                </Button>
              </div>
            </div>

            {/* CRM Intelligence */}
            <div className="space-y-4 rounded-xl border border-border bg-white p-5">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Zap className="h-4 w-4 text-primary" /> CRM Intelligence</p>
              <div className="space-y-1.5">
                <Label>Confidence Threshold: <span className="font-bold text-primary">{s.crm_confidence}%</span></Label>
                <input
                  type="range" min={50} max={100} step={1}
                  value={s.crm_confidence}
                  onChange={(e) => setS({ ...s, crm_confidence: Number(e.target.value) })}
                  onMouseUp={() => patch({ crm_confidence: s.crm_confidence }, `Threshold ${s.crm_confidence}% set!`)}
                  onTouchEnd={() => patch({ crm_confidence: s.crm_confidence }, `Threshold ${s.crm_confidence}% set!`)}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">AI itne % sure hone par hi CRM action lega (50–100%)</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Auto Apply</p>
                  <p className="text-xs text-muted-foreground">ON: tags/labels/lead score khud lagenge · OFF: sirf suggestions</p>
                </div>
                <Switch checked={s.crm_auto_apply} onCheckedChange={(v) => { setS({ ...s, crm_auto_apply: v }); patch({ crm_auto_apply: v }, v ? "Auto-apply ON" : "Suggestions-only mode"); }} />
              </div>
            </div>

            {/* Security */}
            <div className="space-y-3 rounded-xl border border-border bg-white p-5">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Shield className="h-4 w-4 text-primary" /> Security</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {SECURITY_META.map((sec) => {
                  const on = Boolean(s.security?.[sec.key]);
                  return (
                    <div key={sec.key} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{sec.label}</p>
                        <p className="text-xs text-muted-foreground">{sec.desc}</p>
                      </div>
                      <Switch checked={on} onCheckedChange={(v) => toggleSecurity(sec.key, v)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {/* ═══ ANALYTICS ═══ */}
        {tab === "analytics" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">AI Usage Analytics</p>
              <Select value={String(analyticsDays)} onChange={(e) => setAnalyticsDays(Number(e.target.value))} className="w-36">
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </Select>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[
                { label: "Requests", value: analytics?.total_requests ?? 0 },
                { label: "Success Rate", value: `${analytics?.success_rate ?? 100}%` },
                { label: "Failures", value: analytics?.failed ?? 0 },
                { label: "Total Tokens", value: (analytics?.total_tokens ?? 0).toLocaleString() },
                { label: "Total Cost", value: `$${analytics?.total_cost_usd ?? 0}` },
                { label: "Avg Latency", value: `${analytics?.avg_latency_ms ?? 0}ms` },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-border bg-white p-4 text-center">
                  <p className="text-xl font-bold">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="mb-3 text-sm font-semibold">Daily Requests</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={analytics?.daily || []}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={30} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="requests" stroke="#16a34a" strokeWidth={2} dot={false} name="Requests" />
                    <Line type="monotone" dataKey="failures" stroke="#dc2626" strokeWidth={2} dot={false} name="Failures" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="mb-3 text-sm font-semibold">Daily Tokens</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics?.daily || []}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={40} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="tokens" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Tokens" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top lists */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="mb-2 text-sm font-semibold">Top Models</p>
                {(analytics?.top_models || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No usage yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {analytics!.top_models.map((m) => (
                      <div key={m.model} className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">{m.model}</span>
                        <span className="text-muted-foreground">{m.requests} req</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="mb-2 text-sm font-semibold">Top Sources</p>
                {(analytics?.top_sources || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No usage yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {analytics!.top_sources.map((sc) => (
                      <div key={sc.source} className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{sc.source}</span>
                        <span className="text-muted-foreground">{sc.requests} req</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}