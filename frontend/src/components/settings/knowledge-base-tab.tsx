"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { KnowledgeDocumentResponse } from "@/types/ai";

export function KnowledgeBaseTab() {
  const [docs, setDocs] = useState<KnowledgeDocumentResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: KnowledgeDocumentResponse[] }>("/ai/knowledge");
      setDocs(data.items);
    } catch { setError("Failed to load knowledge base"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.content) return;
    setSaving(true);
    try {
      await api.post("/ai/knowledge", form);
      setModalOpen(false);
      setForm({ title: "", content: "" });
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to add document — check OPENAI_API_KEY is set in backend/.env");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this knowledge document?")) return;
    try { await api.delete(`/ai/knowledge/${id}`); await load(); }
    catch { setError("Failed to delete"); }
  };

  return (
    <div className="max-w-2xl">
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Add business info, FAQs, and policies here — the AI assistant and Suggest Reply feature use this to answer accurately.
        </p>
        <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Add Document</Button>
      </div>

      <div className="space-y-2">
        {docs.length === 0 && (
          <p className="rounded-lg border border-border bg-white p-6 text-center text-sm text-muted-foreground">
            No knowledge base entries yet.
          </p>
        )}
        {docs.map((d) => (
          <div key={d.id} className="rounded-lg border border-border bg-white p-4 flex items-start justify-between">
            <div>
              <p className="font-medium text-sm">{d.title || "Untitled"}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.content}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(d.id)} className="text-red-600 hover:bg-red-50 flex-shrink-0">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader><DialogTitle>Add Knowledge Document</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Title (optional)</Label>
            <Input placeholder="Refund Policy" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Content *</Label>
            <textarea
              className="w-full rounded-md border border-border px-3 py-2 text-sm min-h-[140px]"
              placeholder="We offer full refunds within 7 days of purchase..."
              value={form.content}
              onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={saving || !form.content}>{saving ? "Adding..." : "Add Document"}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
