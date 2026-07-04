"use client";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Pause, Play, Plus, X } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { CampaignListResponse, CampaignResponse } from "@/types/campaigns";
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
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<CampaignListResponse>("/campaigns?page_size=50");
      setCampaigns(data.items);
    } catch { setError("Failed to load campaigns"); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to create campaign");
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
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] || ""}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">{c.total_count}</td>
                  <td className="px-4 py-3">{c.sent_count}</td>
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
          <div className="space-y-1.5">
            <Label>Contacts * ({selectedContacts.size} selected)</Label>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-1">
              {contacts.map((c) => (
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