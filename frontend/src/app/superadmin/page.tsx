"use client";
/**
 * Super Admin panel — standalone (no dashboard sidebar).
 * URL: /superadmin  ·  Login: /superadmin/login
 * Guards itself: non-superusers are bounced to the admin login.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookUser, Building2, LogIn, LogOut, MessageSquare, Phone, Search,
  ShieldCheck, UserPlus, Users as UsersIcon,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, getErrorMessage } from "@/lib/api";
import { clearTokens, getAccessToken, getRefreshToken, setTokens, startImpersonation } from "@/lib/auth-storage";
import { cn } from "@/lib/utils";
import type { MeResponse } from "@/types/auth";

interface Overview {
  total_workspaces: number; active_workspaces: number; total_users: number;
  total_contacts: number; messages_30d: number; connected_whatsapp: number;
}
interface WsRow {
  id: string; name: string; plan: string; is_active: boolean;
  created_at: string; members: number; contacts: number; messages_30d: number;
}
interface UserRow {
  id: string; full_name: string; email: string; is_active: boolean;
  is_superuser: boolean; created_at: string; workspaces: number;
}

const PLANS = ["free", "starter", "growth", "scale"];

export default function SuperAdminPanel() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"workspaces" | "users">("workspaces");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [wsRows, setWsRows] = useState<WsRow[]>([]);
  const [userRows, setUserRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", password: "", workspace_id: "", role_name: "" });

  // ── Guard: superuser only ──
  useEffect(() => {
    api.get<MeResponse>("/auth/me")
      .then(({ data }) => {
        if (!data.user.is_superuser) throw new Error("not superuser");
        setMe(data.user);
        setChecking(false);
      })
      .catch(() => router.replace("/superadmin/login"));
  }, [router]);

  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const [o, w, u] = await Promise.all([
        api.get<Overview>("/admin/overview"),
        api.get<WsRow[]>("/admin/workspaces", { params: { search } }),
        api.get<UserRow[]>("/admin/users", { params: { search } }),
      ]);
      setOverview(o.data); setWsRows(w.data); setUserRows(u.data);
    } catch { setError("Data load failed"); }
  }, [search]);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>("/workspaces/roles").then(({ data }) => setRoles(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (checking) return;
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [checking, load]);

  const changePlan = async (id: string, plan: string) => {
    try {
      await api.patch(`/admin/workspaces/${id}`, { plan });
      setWsRows((r) => r.map((w) => (w.id === id ? { ...w, plan } : w)));
    } catch { setError("Plan update failed"); }
  };

  const toggleWs = async (id: string, is_active: boolean) => {
    try {
      await api.patch(`/admin/workspaces/${id}`, { is_active });
      setWsRows((r) => r.map((w) => (w.id === id ? { ...w, is_active } : w)));
    } catch { setError("Update failed"); }
  };

  const toggleUser = async (
    id: string,
    patch: Partial<Pick<UserRow, "is_active" | "is_superuser">>
  ) => {
    try {
      const { data } = await api.patch<UserRow>(`/admin/users/${id}`, patch);
      setUserRows((r) => r.map((u) => (u.id === id ? data : u)));
    } catch { setError("Update failed"); }
  };

  const handleLogout = () => {
    clearTokens();
    router.replace("/superadmin/login");
  };

  const loginAsUser = async (userId: string, userEmail: string) => {
    if (!confirm(`${userEmail} ke roop mein login karoge? Dashboard pe ek "Return to Admin" button milega wapas aane ke liye.`)) return;
    setImpersonating(userId);
    try {
      const { data } = await api.post<{ access_token: string; refresh_token: string }>(`/admin/users/${userId}/impersonate`);
      // Stash the superadmin's own tokens so the dashboard's "Return
      // to Admin" banner can restore them — without this, switching
      // to the target user's session is a one-way trip that requires
      // a full logout + password login to get back.
      const adminAccess = getAccessToken();
      const adminRefresh = getRefreshToken();
      if (adminAccess && adminRefresh) {
        startImpersonation(adminAccess, adminRefresh);
      }
      setTokens(data.access_token, data.refresh_token);
      window.location.href = "/dashboard";
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Impersonation failed"));
      setImpersonating(null);
    }
  };

  const createUser = async () => {
    if (!newUser.full_name.trim() || !newUser.email.trim() || newUser.password.length < 8) {
      setError("Naam, email zaroori hain — password kam se kam 8 characters ka ho");
      return;
    }
    if (newUser.workspace_id && !newUser.role_name) {
      setError("Workspace select kiya hai toh Role bhi select karo");
      return;
    }
    setSavingUser(true); setError(null);
    try {
      await api.post("/admin/users", {
        full_name: newUser.full_name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        workspace_id: newUser.workspace_id || null,
        role_name: newUser.role_name || null,
      });
      setSuccess("User create ho gaya!");
      setAddUserOpen(false);
      setNewUser({ full_name: "", email: "", password: "", workspace_id: "", role_name: "" });
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "User create failed"));
    } finally {
      setSavingUser(false);
    }
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-400">
        Verifying access...
      </main>
    );
  }

  const planCounts = wsRows.reduce<Record<string, number>>((acc, w) => {
    acc[w.plan] = (acc[w.plan] || 0) + 1;
    return acc;
  }, {});
  const recentUsers = [...userRows]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 5);

  const stats = overview ? [
    { icon: Building2, label: "Workspaces", value: `${overview.active_workspaces}/${overview.total_workspaces}`, sub: "active/total" },
    { icon: UsersIcon, label: "Users", value: overview.total_users, sub: "registered" },
    { icon: BookUser, label: "Contacts", value: overview.total_contacts, sub: "platform-wide" },
    { icon: Phone, label: "WhatsApp", value: overview.connected_whatsapp, sub: "connected" },
    { icon: MessageSquare, label: "Messages", value: overview.messages_30d, sub: "last 30 days" },
    { icon: ShieldCheck, label: "Superadmins", value: userRows.filter((u) => u.is_superuser).length, sub: "with access" },
  ] : [];

  return (
    <main className="min-h-screen bg-gray-100">
      {/* ── Admin topbar ── */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-gray-900 px-4 text-white sm:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" /> Super Admin
        </span>
        <span className="flex items-center gap-3 text-sm">
          <span className="hidden text-gray-400 sm:inline">{me?.email}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-gray-300 hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </span>
      </header>

      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border bg-white p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xl font-bold leading-tight">{s.value}</span>
                <span className="block text-xs text-muted-foreground">{s.label} · {s.sub}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Plan distribution + recent signups */}
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="mb-3 text-sm font-semibold">Plan Distribution</p>
            {Object.keys(planCounts).length === 0 ? (
              <p className="text-sm text-muted-foreground">No workspaces</p>
            ) : (
              <div className="space-y-2">
                {PLANS.filter((p) => planCounts[p]).map((p) => {
                  const total = wsRows.length || 1;
                  const pct = Math.round(((planCounts[p] || 0) / total) * 100);
                  return (
                    <div key={p} className="flex items-center gap-3 text-sm">
                      <span className="w-16 capitalize text-muted-foreground">{p}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-14 text-right text-xs text-muted-foreground">{planCounts[p]} · {pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <UserPlus className="h-4 w-4 text-primary" /> Recent Signups
            </p>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet</p>
            ) : (
              <div className="divide-y divide-border">
                {recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{u.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                    </span>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs + search */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg border border-border bg-white p-0.5">
            {(["workspaces", "users"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                  tab === t ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}...`} className="pl-8" />
            </div>
            {tab === "users" && (
              <Button size="sm" onClick={() => setAddUserOpen(true)} className="whitespace-nowrap">
                <UserPlus className="h-4 w-4" /> Add User
              </Button>
            )}
          </div>
        </div>

        {/* Workspaces table */}
        {tab === "workspaces" && (
          <div className="rounded-lg border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Workspace</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Members</th>
                    <th className="px-4 py-3">Contacts</th>
                    <th className="px-4 py-3">Msgs (30d)</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {wsRows.map((w) => (
                    <tr key={w.id} className={cn(!w.is_active && "opacity-50")}>
                      <td className="px-4 py-3 font-medium">{w.name}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={w.plan}
                          onChange={(e) => changePlan(w.id, e.target.value)}
                          className="h-8 w-28 text-xs"
                        >
                          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      </td>
                      <td className="px-4 py-3">{w.members}</td>
                      <td className="px-4 py-3">{w.contacts}</td>
                      <td className="px-4 py-3">{w.messages_30d}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(w.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Switch size="sm" checked={w.is_active} onCheckedChange={(v) => toggleWs(w.id, v)} />
                      </td>
                    </tr>
                  ))}
                  {wsRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No workspaces</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users table */}
        {tab === "users" && (
          <div className="rounded-lg border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Workspaces</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Superadmin</th>
                    <th className="px-4 py-3">Active</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {userRows.map((u) => (
                    <tr key={u.id} className={cn(!u.is_active && "opacity-50")}>
                      <td className="px-4 py-3 font-medium">
                        <span className="flex items-center gap-1.5">
                          {u.is_superuser && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                          {u.full_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">{u.workspaces}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          size="sm"
                          checked={u.is_superuser}
                          onCheckedChange={(v) => toggleUser(u.id, { is_superuser: v })}
                          disabled={u.id === me?.id}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          size="sm"
                          checked={u.is_active}
                          onCheckedChange={(v) => toggleUser(u.id, { is_active: v })}
                          disabled={u.id === me?.id}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {!u.is_superuser && u.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loginAsUser(u.id, u.email)}
                            disabled={impersonating === u.id}
                            title="Is user ke roop mein login karo (support/debugging ke liye)"
                          >
                            <LogIn className="h-3.5 w-3.5" />
                            {impersonating === u.id ? "..." : "Login as"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {userRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No users</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Add User Dialog ── */}
      <Dialog open={addUserOpen} onClose={() => setAddUserOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Naya User Add Karo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                placeholder="Rahul Sharma"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="rahul@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Kam se kam 8 characters"
              />
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Workspace mein add karo (optional)</p>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={newUser.workspace_id}
                  onChange={(e) => setNewUser({ ...newUser, workspace_id: e.target.value })}
                >
                  <option value="">Koi workspace nahi</option>
                  {wsRows.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </Select>
                <Select
                  value={newUser.role_name}
                  onChange={(e) => setNewUser({ ...newUser, role_name: e.target.value })}
                  disabled={!newUser.workspace_id}
                >
                  <option value="">Role select karo</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
            <Button onClick={createUser} disabled={savingUser}>
              {savingUser ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}