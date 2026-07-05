"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Building2, MessageSquare, Search, Shield, ShieldCheck,
  Users as UsersIcon, Phone,
} from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

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

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"workspaces" | "users">("workspaces");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [wsRows, setWsRows] = useState<WsRow[]>([]);
  const [userRows, setUserRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, w, u] = await Promise.all([
        api.get<Overview>("/admin/overview"),
        api.get<WsRow[]>("/admin/workspaces", { params: { search } }),
        api.get<UserRow[]>("/admin/users", { params: { search } }),
      ]);
      setOverview(o.data); setWsRows(w.data); setUserRows(u.data);
    } catch {
      setError("Load failed — kya aap superadmin hain?");
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

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

  const toggleUser = async (id: string, patch: Partial<Pick<UserRow, "is_active" | "is_superuser">>) => {
    try {
      const { data } = await api.patch<UserRow>(`/admin/users/${id}`, patch);
      setUserRows((r) => r.map((u) => (u.id === id ? data : u)));
    } catch { setError("Update failed"); }
  };

  if (user && !user.is_superuser) {
    return (
      <>
        <Topbar title="Super Admin" />
        <div className="p-8 text-center text-muted-foreground">
          <Shield className="mx-auto mb-3 h-10 w-10" />
          Sirf platform superadmin is page ko dekh sakte hain.
        </div>
      </>
    );
  }

  const stats = overview ? [
    { icon: Building2, label: "Workspaces", value: `${overview.active_workspaces}/${overview.total_workspaces}`, sub: "active/total" },
    { icon: UsersIcon, label: "Users", value: overview.total_users, sub: "registered" },
    { icon: Phone, label: "WhatsApp", value: overview.connected_whatsapp, sub: "connected" },
    { icon: MessageSquare, label: "Messages", value: overview.messages_30d, sub: "last 30 days" },
  ] : [];

  return (
    <>
      <Topbar title="Super Admin" />
      <div className="p-4 sm:p-6">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}...`} className="pl-8" />
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
                          disabled={u.id === user?.id}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          size="sm"
                          checked={u.is_active}
                          onCheckedChange={(v) => toggleUser(u.id, { is_active: v })}
                          disabled={u.id === user?.id}
                        />
                      </td>
                    </tr>
                  ))}
                  {userRows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No users</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}