"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, Plus, Trash2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { ChatbotRuleResponse } from "@/types/chatbot";

export default function ChatbotPage() {
  const [rules, setRules] = useState<ChatbotRuleResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", keywords: "", match_type: "contains", reply_text: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<ChatbotRuleResponse[]>("/chatbot/rules");
      setRules(data);
    } catch { setError("Failed to load chatbot rules"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name || !form.keywords || !form.reply_text) return;
    setSaving(true);
    try {
      await api.post("/chatbot/rules", {
        name: form.name,
        keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
        match_type: form.match_type,
        reply_text: form.reply_text,
        priority: rules.length,
        is_active: true,
      });
      setModalOpen(false);
      setForm({ name: "", keywords: "", match_type: "contains", reply_text: "" });
      await load();
    } catch { setError("Failed to create rule"); }
    finally { setSaving(false); }
  };

  const handleToggle = async (rule: ChatbotRuleResponse) => {
    try {
      await api.patch(`/chatbot/rules/${rule.id}`, { is_active: !rule.is_active });
      await load();
    } catch { setError("Failed to update rule"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    try { await api.delete(`/chatbot/rules/${id}`); await load(); }
    catch { setError("Failed to delete rule"); }
  };

  return (
    <>
      <Topbar title="Chatbot" />
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Chatbot Rules</h2>
            <p className="text-sm text-muted-foreground">Auto-reply to incoming WhatsApp messages based on keywords</p>
          </div>
          <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Add Rule</Button>
        </div>

        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        <Alert className="mb-4">
          <strong>How it works:</strong> When a contact sends a message, the bot checks rules in priority order (highest first). First matching rule sends the reply automatically.
        </Alert>

        {rules.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-12 text-center">
            <Bot className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <p className="font-medium">No chatbot rules yet</p>
            <p className="text-sm text-muted-foreground">Add your first rule to start automating replies</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{rule.name}</p>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{rule.match_type}</span>
                    {!rule.is_active && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactive</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Keywords: {rule.keywords.join(", ")}
                  </p>
                  <p className="text-sm mt-1 text-muted-foreground truncate max-w-lg">{rule.reply_text}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(rule)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${rule.is_active ? "bg-primary" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${rule.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)} className="text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader><DialogTitle>Add Chatbot Rule</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Rule Name *</Label>
            <Input placeholder="Greeting" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Keywords * (comma-separated)</Label>
            <Input placeholder="hi, hello, hey" value={form.keywords} onChange={(e) => setForm(f => ({ ...f, keywords: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Match Type</Label>
            <Select value={form.match_type} onChange={(e) => setForm(f => ({ ...f, match_type: e.target.value }))}>
              <option value="contains">Contains</option>
              <option value="exact">Exact match</option>
              <option value="starts_with">Starts with</option>
              <option value="regex">Regex</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reply Text *</Label>
            <textarea
              className="w-full rounded-md border border-border px-3 py-2 text-sm min-h-[80px]"
              placeholder="Hi! Welcome to our business. How can we help you today?"
              value={form.reply_text}
              onChange={(e) => setForm(f => ({ ...f, reply_text: e.target.value }))}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !form.name || !form.keywords || !form.reply_text}>
            {saving ? "Adding..." : "Add Rule"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
