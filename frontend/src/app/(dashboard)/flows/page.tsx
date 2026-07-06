"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart2, GitBranch, Plus, Trash2, X } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import type { FlowListResponse, FlowResponse } from "@/types/chatbot";

export default function FlowsPage() {
  const [flows, setFlows] = useState<FlowResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analyticsFlow, setAnalyticsFlow] = useState<FlowResponse | null>(null);
  const [analytics, setAnalytics] = useState<{
    total_sessions: number; completed: number; waiting: number;
    errors: number; completion_rate: number;
    daily_chart: { date: string; sessions: number; completed: number }[];
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
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


  const openAnalytics = async (flow: FlowResponse) => {
    setAnalyticsFlow(flow);
    setAnalytics(null);
    setAnalyticsLoading(true);
    try {
      const { data } = await api.get(`/flows/${flow.id}/analytics?days=30`);
      setAnalytics(data);
    } catch { setAnalytics(null); }
    finally { setAnalyticsLoading(false); }
  };

  return (
    <>
      <Topbar title="Flows" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                  <div className="min-w-0">
                    <Link href={`/flows/${flow.id}`} className="font-medium hover:underline truncate block">{flow.name}</Link>
                    <p className="text-xs text-muted-foreground mt-0.5">{flow.nodes.length} nodes · v{flow.version}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openAnalytics(flow)} className="text-muted-foreground hover:bg-muted flex-shrink-0" title="Analytics">
                    <BarChart2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(flow.id)} className="text-red-600 hover:bg-red-50 flex-shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground capitalize">{flow.trigger_type} trigger</span>
                  <Switch
                    size="sm"
                    checked={flow.is_active}
                    onCheckedChange={() => handleToggle(flow)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analytics Modal */}
      {analyticsFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="font-semibold">{analyticsFlow.name}</p>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </div>
              <button onClick={() => setAnalyticsFlow(null)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              {analyticsLoading ? (
                <p className="py-10 text-center text-muted-foreground">Loading...</p>
              ) : analytics ? (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: "Total Sessions", value: analytics.total_sessions },
                      { label: "Completed", value: analytics.completed },
                      { label: "Waiting", value: analytics.waiting },
                      { label: "Completion %", value: `${analytics.completion_rate}%` },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-border bg-muted/40 p-3 text-center">
                        <p className="text-xl font-bold">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={analytics.daily_chart} barGap={2}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="sessions" name="Sessions" fill="#3b82f6" radius={[4,4,0,0]} />
                      <Bar dataKey="completed" name="Completed" fill="#16a34a" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <p className="py-10 text-center text-muted-foreground">No analytics data yet — flow run karo.</p>
              )}
            </div>
          </div>
        </div>
      )}

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