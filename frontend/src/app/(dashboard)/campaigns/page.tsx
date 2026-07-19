"use client";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, Megaphone, Pause, Play, Plus, Search, Send as SendIcon, X } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { useWorkspaceWebSocket } from "@/hooks/shared/use-workspace-ws";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CampaignListResponse, CampaignResponse } from "@/types/campaigns";
import type { TagResponse } from "@/types/contacts";
import type { ContactListResponse, ContactResponse } from "@/types/contacts";
import type { TemplateListResponse, TemplateResponse } from "@/types/templates";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700",
  running: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignResponse[]>([]);
  const [templates, setTemplates] = useState<TemplateResponse[]>([]);
  const [contacts, setContacts] = useState<ContactResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", template_id: "" });
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState("");
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    id: string; name: string; status: string;
    total_count: number; sent_count: number; delivered_count: number;
    read_count: number; failed_count: number;
    recipients: { id: string; status: string; error_message: string | null; contact_name: string | null; contact_phone: string | null }[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    api.get<TagResponse[]>("/tags").then(({ data }) => setAllTags(data)).catch(() => {});
    try {
      const { data } = await api.get<CampaignListResponse>("/campaigns?page_size=50");
      setCampaigns(data.items);
    } catch { setError("Failed to load campaigns"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates via WebSocket — no more polling. Backend pushes
  // "campaign_update" (status changes) and "campaign_recipient_update"
  // (every delivered/read/failed webhook) the instant they happen.
  const handleWsEvent = useCallback((msg: { event: string; data: unknown }) => {
    if (msg.event === "campaign_update") {
      const d = msg.data as { campaign_id: string; status: string };
      setCampaigns((prev) => prev.map((c) => (c.id === d.campaign_id ? { ...c, status: d.status } : c)));
    }
    if (msg.event === "campaign_recipient_update") {
      const d = msg.data as {
        campaign_id: string; recipient_id: string; status: string; error_message: string | null;
        total_count: number; sent_count: number; delivered_count: number; read_count: number; failed_count: number;
      };
      // Update the campaigns list row counts
      setCampaigns((prev) => prev.map((c) => (
        c.id === d.campaign_id
          ? { ...c, sent_count: d.sent_count, delivered_count: d.delivered_count, read_count: d.read_count, failed_count: d.failed_count }
          : c
      )));
      // Update the open detail modal, if this campaign is the one shown
      setDetail((prev) => {
        if (!prev || prev.id !== d.campaign_id) return prev;
        return {
          ...prev,
          total_count: d.total_count, sent_count: d.sent_count, delivered_count: d.delivered_count,
          read_count: d.read_count, failed_count: d.failed_count,
          recipients: prev.recipients.map((r) => (
            r.id === d.recipient_id ? { ...r, status: d.status, error_message: d.error_message } : r
          )),
        };
      });
    }
  }, []);
  useWorkspaceWebSocket(handleWsEvent);

  // Fetch detail once when the modal opens (subsequent updates come via WS above)
  useEffect(() => {
    if (!detailId) { setDetail(null); return; }
    api.get(`/campaigns/${detailId}`).then(({ data }) => setDetail(data)).catch(() => setError("Detail load failed"));
  }, [detailId]);

  const openModal = async () => {
    setModalOpen(true);
    try {
      const [tplRes, contactRes] = await Promise.all([
        api.get<TemplateListResponse>("/templates"),
        api.get<ContactListResponse>("/contacts?page_size=100"),
      ]);
      setTemplates(tplRes.data.items.filter((t) => t.status === "approved"));
      setContacts(contactRes.data.items);
    } catch { setError("Failed to load templates/contacts"); }
  };

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!form.name || !form.template_id || selectedContacts.size === 0) return;
    setSaving(true);
    try {
      await api.post("/campaigns", {
        name: form.name,
        campaign_type: "broadcast",
        template_id: form.template_id,
        contact_ids: Array.from(selectedContacts),
      });
      setModalOpen(false);
      setForm({ name: "", template_id: "" });
      setSelectedContacts(new Set());
      await load();
      setSuccess("Campaign created. Click Launch to send.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to create campaign"));
    } finally { setSaving(false); }
  };

  const handleAction = async (id: string, action: "launch" | "pause" | "cancel") => {
    try {
      await api.post(`/campaigns/${id}/${action}`);
      await load();
    } catch { setError(`Failed to ${action} campaign`); }
  };

  return (
    <>
      <Topbar title="Campaigns" />
      <div className="p-4 sm:p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {/* ── Stats ── */}
        {(() => {
          const running = campaigns.filter((c) => ["running", "sending"].includes(c.status)).length;
          const completed = campaigns.filter((c) => c.status === "completed").length;
          const totalSent = campaigns.reduce((s, c) => s + c.sent_count, 0);
          const cards = [
            { icon: Megaphone, label: "Total Campaigns", value: campaigns.length, cls: "bg-purple-100 text-purple-600" },
            { icon: Loader2, label: "Running", value: running, cls: "bg-blue-100 text-blue-600" },
            { icon: CheckCircle2, label: "Completed", value: completed, cls: "bg-green-100 text-green-600" },
            { icon: SendIcon, label: "Messages Sent", value: totalSent, cls: "bg-amber-100 text-amber-600" },
          ];
          return (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {cards.map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border bg-white p-3.5">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.cls}`}>
                    <s.icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-lg font-bold leading-tight">{s.value}</span>
                    <span className="block text-xs text-muted-foreground">{s.label}</span>
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="mb-4 flex justify-end">
          <Button onClick={openModal}><Plus className="h-4 w-4" /> New Campaign</Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Delivered</th>
                <th className="px-4 py-3">Failed</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No campaigns yet.</td></tr>
              )}
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <button onClick={() => setDetailId(c.id)} className="font-medium text-left hover:text-primary hover:underline">
                      {c.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] || ""}`}>{c.status}</span>
                    {c.scheduled_at && c.status === "scheduled" && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        📅 {new Date(c.scheduled_at).toLocaleString("en-IN")}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.total_count}</td>
                  <td className="px-4 py-3">
                    <span className="block">{c.sent_count}</span>
                    {c.total_count > 0 && ["running", "sending", "paused"].includes(c.status) && (
                      <span className="mt-1 block h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                        <span
                          className="block h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min((c.sent_count / c.total_count) * 100, 100)}%` }}
                        />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.delivered_count}</td>
                  <td className="px-4 py-3 text-red-600">{c.failed_count}</td>
                  <td className="px-4 py-3 text-muted-foreground">{format(new Date(c.created_at), "dd MMM, HH:mm")}</td>
                  <td className="px-4 py-3 text-right">
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <Button size="sm" variant="outline" onClick={() => handleAction(c.id, "launch")}>
                        <Play className="h-3.5 w-3.5" /> Launch
                      </Button>
                    )}
                    {c.status === "running" && (
                      <Button size="sm" variant="outline" onClick={() => handleAction(c.id, "pause")}>
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </Button>
                    )}
                    {c.status === "paused" && (
                      <Button size="sm" variant="outline" onClick={() => handleAction(c.id, "launch")}>
                        <Play className="h-3.5 w-3.5" /> Resume
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* ── Campaign Detail Modal (per-recipient status) ── */}
      {detailId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
              <div>
                <h2 className="font-semibold">{detail?.name || "Campaign"}</h2>
                <p className="text-xs text-muted-foreground capitalize">Status: {detail?.status || "—"} · live updates har 4s</p>
              </div>
              <button onClick={() => setDetailId(null)} className="rounded-lg p-2 hover:bg-muted">✕</button>
            </div>

            {detail && (
              <div className="grid flex-shrink-0 grid-cols-5 gap-2 border-b border-border px-5 py-3 text-center">
                {[
                  ["Total", detail.total_count, "text-gray-700"],
                  ["Sent", detail.sent_count, "text-blue-600"],
                  ["Delivered", detail.delivered_count, "text-green-600"],
                  ["Read", detail.read_count, "text-emerald-600"],
                  ["Failed", detail.failed_count, "text-red-600"],
                ].map(([l, v, cls]) => (
                  <div key={l as string}>
                    <p className={`text-lg font-bold ${cls}`}>{v}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {!detail ? (
                <p className="py-10 text-center text-muted-foreground">Loading...</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-border bg-white text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2.5">Contact</th>
                      <th className="px-5 py-2.5">Status</th>
                      <th className="px-5 py-2.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detail.recipients.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-2.5">
                          <p className="font-medium">{r.contact_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{r.contact_phone || ""}</p>
                        </td>
                        <td className="px-5 py-2.5">
                          <span className={cn(
                            "rounded px-2 py-0.5 text-xs font-medium capitalize",
                            r.status === "read" ? "bg-emerald-100 text-emerald-700"
                            : r.status === "delivered" ? "bg-green-100 text-green-700"
                            : r.status === "sent" ? "bg-blue-100 text-blue-700"
                            : r.status === "failed" ? "bg-red-100 text-red-700"
                            : r.status === "skipped" ? "bg-gray-100 text-gray-600"
                            : "bg-amber-100 text-amber-700"
                          )}>
                            {r.status}
                          </span>
                        </td>
                        <td className="max-w-[220px] px-5 py-2.5">
                          {r.error_message ? (
                            <p className="text-xs text-red-600" title={r.error_message}>{r.error_message}</p>
                          ) : r.status === "skipped" ? (
                            <p className="text-xs text-muted-foreground">Opted out / blocked</p>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Campaign Name *</Label>
            <Input placeholder="Diwali Offer 2026" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Template (Approved only) *</Label>
            <Select value={form.template_id} onChange={(e) => setForm(f => ({ ...f, template_id: e.target.value }))}>
              <option value="">Select template...</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
            </Select>
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground">No approved templates. Create one in Templates first.</p>
            )}
          </div>
          {form.template_id && (() => {
            const t = templates.find((x) => x.id === form.template_id);
            if (!t) return null;
            return (
              <div className="rounded-xl bg-[hsl(90,25%,92%)] p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                <div className="ml-auto max-w-[95%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-xs text-gray-800 shadow-sm whitespace-pre-wrap">
                  {t.body_text}
                  {t.footer_text && <span className="mt-1 block text-[10px] text-gray-500">{t.footer_text}</span>}
                </div>
              </div>
            );
          })()}
          <div className="space-y-1.5">
            <Label>Contacts * ({selectedContacts.size} selected)</Label>
            {allTags.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Group se select karo (click = us group ke sab contacts select):</p>
                <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                  {allTags.map((t) => {
                    const groupContacts = contacts.filter((c) => c.tags?.some((ct) => ct.id === t.id));
                    if (groupContacts.length === 0) return null;
                    const allIn = groupContacts.every((c) => selectedContacts.has(c.id));
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedContacts((prev) => {
                            const next = new Set(prev);
                            groupContacts.forEach((c) => (allIn ? next.delete(c.id) : next.add(c.id)));
                            return next;
                          });
                        }}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                          allIn ? "bg-primary text-white" : "border border-border bg-white text-muted-foreground hover:border-primary hover:text-primary"
                        )}
                      >
                        {allIn && "✓ "}{t.name} ({groupContacts.length})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Search contacts..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const filtered = contacts.filter((c) =>
                    (c.name || "").toLowerCase().includes(contactSearch.toLowerCase()) ||
                    c.phone.includes(contactSearch)
                  );
                  const allSelected = filtered.every((c) => selectedContacts.has(c.id));
                  setSelectedContacts((prev) => {
                    const next = new Set(prev);
                    filtered.forEach((c) => (allSelected ? next.delete(c.id) : next.add(c.id)));
                    return next;
                  });
                }}
                className="whitespace-nowrap rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Select all
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-1">
              {contacts
                .filter((c) =>
                  (c.name || "").toLowerCase().includes(contactSearch.toLowerCase()) ||
                  c.phone.includes(contactSearch)
                )
                .map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/50 rounded cursor-pointer">
                  <input type="checkbox" checked={selectedContacts.has(c.id)} onChange={() => toggleContact(c.id)} />
                  <span>{c.name || c.phone}</span>
                  <span className="text-muted-foreground text-xs ml-auto">{c.phone}</span>
                </label>
              ))}
              {contacts.length === 0 && <p className="text-xs text-muted-foreground p-2">No contacts available.</p>}
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !form.name || !form.template_id || selectedContacts.size === 0}>
            {saving ? "Creating..." : "Create Campaign"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}