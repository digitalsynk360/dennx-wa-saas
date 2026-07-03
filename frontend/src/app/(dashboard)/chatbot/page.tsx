"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, GripVertical, Plus, Trash2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { ChatbotRuleResponse, FlowListResponse, FlowResponse } from "@/types/chatbot";

export default function ChatbotPage() {
  const [rules, setRules] = useState<ChatbotRuleResponse[]>([]);
  const [flows, setFlows] = useState<FlowResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [matchType, setMatchType] = useState("contains");
  const [replyText, setReplyText] = useState("");
  const [flowId, setFlowId] = useState("");

  const load = useCallback(async () => {
    try {
      const [rulesRes, flowsRes] = await Promise.all([
        api.get<ChatbotRuleResponse[]>("/chatbot/rules"),
        api.get<FlowListResponse>("/flows"),
      ]);
      setRules(rulesRes.data);
      setFlows(flowsRes.data.items);
    } catch {
      setError("Failed to load chatbot rules");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setName(""); setKeywords(""); setMatchType("contains");
    setReplyText(""); setFlowId("");
  };

  const handleCreate = async () => {
    if (!keywords || (!replyText && !flowId)) return;
    setSaving(true);
    try {
      await api.post("/chatbot/rules", {
        name: name || keywords.split(",")[0].trim(),
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        match_type: matchType,
        reply_text: replyText || null,
        flow_id: flowId || null,
      });
      setModalOpen(false);
      resetForm();
      await load();
    } catch {
      setError("Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: ChatbotRuleResponse) => {
    try {
      await api.patch(`/chatbot/rules/${rule.id}`, { is_active: !rule.is_active });
      await load();
    } catch {
      setError("Failed to update rule");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await api.delete(`/chatbot/rules/${id}`);
      await load();
    } catch {
      setError("Failed to delete rule");
    }
  };

  return (
    <>
      <Topbar title="Chatbot" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Keyword Rules</h2>
            <p className="text-sm text-muted-foreground">
              Auto-reply or trigger a flow when a message matches keywords
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> New Rule
          </Button>
        </div>

        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        {rules.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-12 text-center">
            <Bot className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <p className="font-medium">No rules yet</p>
            <p className="text-sm text-muted-foreground">
              Create a rule to automatically reply to common questions
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-white p-4"
              >
                <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{rule.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {rule.keywords.join(", ")} · {rule.match_type}
                    {rule.flow_id ? " · triggers flow" : " · text reply"}
                  </p>
                </div>
                <Switch
                  size="sm"
                  checked={rule.is_active}
                  onCheckedChange={() => handleToggle(rule)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(rule.id)}
                  className="flex-shrink-0 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader><DialogTitle>New Chatbot Rule</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-1.5">
            <Label>Rule Name</Label>
            <Input
              placeholder="Pricing question"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Keywords * (comma separated)</Label>
            <Input
              placeholder="price, pricing, cost"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Match Type</Label>
            <Select value={matchType} onChange={(e) => setMatchType(e.target.value)}>
              <option value="contains">Contains</option>
              <option value="exact">Exact match</option>
              <option value="starts_with">Starts with</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reply Text</Label>
            <Input
              placeholder="Our pricing starts at ₹999/month"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Or Trigger Flow</Label>
            <Select value={flowId} onChange={(e) => setFlowId(e.target.value)}>
              <option value="">None</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setModalOpen(false); resetForm(); }}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving || !keywords || (!replyText && !flowId)}>
            {saving ? "Creating..." : "Create Rule"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}