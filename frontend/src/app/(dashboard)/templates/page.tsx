"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { TemplateListResponse, TemplateResponse } from "@/types/templates";

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  paused: "bg-gray-100 text-gray-700",
  rejected: "bg-red-100 text-red-700",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", language: "en", category: "UTILITY", body_text: "", footer_text: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<TemplateListResponse>("/templates");
      setTemplates(data.items);
    } catch { setError("Failed to load templates"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post("/templates/sync");
      await load();
      setSuccess("Synced with Meta successfully.");
      setTimeout(() => setSuccess(null), 3000);
    } catch { setError("Sync failed — check WhatsApp connection in Settings"); }
    finally { setSyncing(false); }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post("/templates", {
        ...form,
        header_type: "none",
        buttons: [],
        variable_samples: {},
      });
      setModalOpen(false);
      setForm({ name: "", language: "en", category: "UTILITY", body_text: "", footer_text: "" });
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to create template");
    } finally { setSaving(false); }
  };

  const handleSubmit = async (id: string) => {
    try {
      await api.post(`/templates/${id}/submit`);
      await load();
      setSuccess("Submitted to Meta for approval.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Submission failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try { await api.delete(`/templates/${id}`); await load(); }
    catch { setError("Failed to delete"); }
  };

  return (
    <>
      <Topbar title="Templates" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Message Templates</h2>
            <p className="text-sm text-muted-foreground">Templates require Meta approval before use in campaigns.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync from Meta
            </Button>
            <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New Template</Button>
          </div>
        </div>

        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No templates yet.</td></tr>
              )}
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground max-w-xs truncate">{t.body_text}</p>
                  </td>
                  <td className="px-4 py-3"><span className="rounded bg-muted px-2 py-0.5 text-xs">{t.category}</span></td>
                  <td className="px-4 py-3 uppercase text-xs">{t.language}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] || ""}`}>{t.status.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {t.status === "pending" && !t.meta_template_id && (
                      <Button size="sm" variant="outline" onClick={() => handleSubmit(t.id)}>
                        <Send className="h-3.5 w-3.5" /> Submit
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader><DialogTitle>Create WhatsApp Template</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Template Name *</Label>
            <Input placeholder="order_confirmed" value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} />
            <p className="text-xs text-muted-foreground">Lowercase + underscores only.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="UTILITY">Utility — Order, alerts, updates</option>
                <option value="MARKETING">Marketing — Offers & promotions</option>
                <option value="AUTHENTICATION">Authentication — OTP, login codes</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={form.language} onChange={(e) => setForm(f => ({ ...f, language: e.target.value }))}>
                <option value="en">English (US)</option>
                <option value="en_GB">English (UK)</option>
                <option value="hi">Hindi</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Body Text *</Label>
            <textarea
              className="w-full rounded-md border border-border px-3 py-2 text-sm min-h-[100px]"
              placeholder={"Hello {{1}},\n\nYour order *{{2}}* is confirmed!"}
              value={form.body_text}
              onChange={(e) => setForm(f => ({ ...f, body_text: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Use {"{{1}}, {{2}}"} for variables.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Footer (optional)</Label>
            <Input placeholder="Reply STOP to unsubscribe" value={form.footer_text}
              onChange={(e) => setForm(f => ({ ...f, footer_text: e.target.value }))} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !form.name || !form.body_text}>
            {saving ? "Saving..." : "Save Draft"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}