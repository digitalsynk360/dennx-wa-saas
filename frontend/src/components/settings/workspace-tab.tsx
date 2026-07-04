"use client";
import { useState } from "react";
import { Building2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";

export function WorkspaceTab() {
  const { activeWorkspace } = useAuth();
  const [name, setName] = useState(activeWorkspace?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManage = ["owner", "admin"].includes(
    (activeWorkspace?.role ?? "").toLowerCase()
  );

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.patch("/workspaces/current", { name: name.trim() });
      setSuccess("Workspace updated. Page refresh ho raha hai...");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Update failed");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" /> Workspace
        </h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Workspace name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
            />
            {!canManage && (
              <p className="text-xs text-muted-foreground">
                Sirf owner/admin workspace ka naam badal sakte hain.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Current plan</p>
              <p className="mt-0.5 text-sm font-medium capitalize">{activeWorkspace?.plan ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Your role</p>
              <p className="mt-0.5 text-sm font-medium capitalize">{activeWorkspace?.role ?? "—"}</p>
            </div>
          </div>
          {canManage && (
            <Button onClick={handleSave} disabled={saving || !name.trim() || name.trim() === activeWorkspace?.name}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}