"use client";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { ApiKeyResponse, CreateApiKeyResponse } from "@/types/billing";

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: ApiKeyResponse[] }>("/api-keys");
      setKeys(data.items);
    } catch { setError("Failed to load API keys"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name) return;
    setSaving(true);
    try {
      const { data } = await api.post<CreateApiKeyResponse>("/api-keys", { name });
      setNewKey(data.api_key);
      setName("");
      await load();
    } catch { setError("Failed to create key"); }
    finally { setSaving(false); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this API key? Apps using it will stop working immediately.")) return;
    try { await api.delete(`/api-keys/${id}`); await load(); }
    catch { setError("Failed to revoke key"); }
  };

  return (
    <div className="max-w-2xl">
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Use these keys to integrate with the API from your own apps.</p>
        <Button size="sm" onClick={() => { setModalOpen(true); setNewKey(null); }}><Plus className="h-4 w-4" /> New Key</Button>
      </div>

      <div className="rounded-lg border border-border bg-white divide-y divide-border">
        {keys.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No API keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Key className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{k.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}...</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {k.last_used_at ? `Used ${format(new Date(k.last_used_at), "dd MMM")}` : "Never used"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => handleRevoke(k.id)} className="text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}>
        <DialogHeader><DialogTitle>New API Key</DialogTitle></DialogHeader>
        <DialogContent>
          {newKey ? (
            <div className="space-y-2">
              <Label>Your new API key (shown only once)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">{newKey}</code>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(newKey)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-red-600">Copy this now — you won&apos;t be able to see it again.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Key Name *</Label>
              <Input placeholder="My Integration" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          {newKey ? (
            <Button onClick={() => setModalOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving || !name}>{saving ? "Creating..." : "Create Key"}</Button>
            </>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}
