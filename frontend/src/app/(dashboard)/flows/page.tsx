"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, Plus, Trash2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { FlowListResponse, FlowResponse } from "@/types/chatbot";

export default function FlowsPage() {
  const [flows, setFlows] = useState<FlowResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<FlowListResponse>("/flows");
      setFlows(data.items);
    } catch { setError("Failed to load flows"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name) return;
    setSaving(true);
    try {
      const { data } = await api.post<FlowResponse>("/flows", { name, trigger_type: "keyword" });
      window.location.href = `/flows/${data.id}`;
    } catch { setError("Failed to create flow"); setSaving(false); }
  };

  const handleToggle = async (flow: FlowResponse) => {
    try {
      await api.post(`/flows/${flow.id}/${flow.is_active ? "deactivate" : "activate"}`);
      await load();
    } catch { setError("Failed to update flow"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this flow?")) return;
    try { await api.delete(`/flows/${id}`); await load(); }
    catch { setError("Failed to delete flow"); }
  };

  return (
    <>
      <Topbar title="Flows" />
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Flow Builder</h2>
            <p className="text-sm text-muted-foreground">Design multi-step conversation flows visually</p>
          </div>
          <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New Flow</Button>
        </div>

        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        {flows.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-12 text-center">
            <GitBranch className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <p className="font-medium">No flows yet</p>
            <p className="text-sm text-muted-foreground">Create a flow to build multi-step automated conversations</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {flows.map((flow) => (
              <div key={flow.id} className="rounded-lg border border-border bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/flows/${flow.id}`} className="font-medium hover:underline">{flow.name}</Link>
                    <p className="text-xs text-muted-foreground mt-0.5">{flow.nodes.length} nodes · v{flow.version}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(flow.id)} className="text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground capitalize">{flow.trigger_type} trigger</span>
                  <button
                    onClick={() => handleToggle(flow)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${flow.is_active ? "bg-primary" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${flow.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader><DialogTitle>New Flow</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Flow Name *</Label>
            <Input placeholder="Order Support Flow" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !name}>{saving ? "Creating..." : "Create & Open Editor"}</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
