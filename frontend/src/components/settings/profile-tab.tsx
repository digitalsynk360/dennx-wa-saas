"use client";
import { useState } from "react";
import { KeyRound, UserRound } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";

export function ProfileTab() {
  const { user, activeWorkspace } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChangePassword = async () => {
    setError(null);
    if (next !== confirm) {
      setError("New password aur confirm password match nahi karte.");
      return;
    }
    if (next.length < 8) {
      setError("New password kam se kam 8 characters ka hona chahiye.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      setSuccess("Password successfully changed.");
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Password change failed — current password check karo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* ── Account info ── */}
      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <UserRound className="h-4 w-4 text-primary" /> Account
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Full name</p>
            <p className="mt-0.5 text-sm font-medium">{user?.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="mt-0.5 text-sm font-medium">{user?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Role in workspace</p>
            <p className="mt-0.5 text-sm font-medium capitalize">{activeWorkspace?.role ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email verified</p>
            <p className="mt-0.5 text-sm font-medium">{user?.email_verified_at ? "Yes ✅" : "Pending"}</p>
          </div>
        </div>
      </div>

      {/* ── Change password ── */}
      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" /> Change Password
        </h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current password</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <Button onClick={handleChangePassword} disabled={saving || !current || !next || !confirm}>
            {saving ? "Saving..." : "Update Password"}
          </Button>
        </div>
      </div>
    </div>
  );
}