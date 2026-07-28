"use client";
/**
 * Super Admin panel — standalone (no dashboard sidebar).
 * URL: /superadmin  ·  Login: /superadmin/login
 * Guards itself: non-superusers are bounced to the admin login.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BookUser, Building2, CreditCard, LogIn, LogOut, MessageSquare, Phone, Search,
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
interface PlanCatalogEntry {
  plan: string; label: string; monthly_price_paise: number | null;
  messages: number | null; contacts: number | null; seats: number | null;
  whatsapp_numbers: number | null; ai_chatbot: boolean;
}
interface SubscriptionInfo {
  plan: string; billing_cycle: string; status: string;
  monthly_message_quota: number | null; contact_limit: number | null; seats: number;
  whatsapp_number_limit: number | null; ai_chatbot_enabled: boolean; addons: Record<string, unknown>;
  base_price_paise: number; gst_percent: number;
  current_period_start: string | null; current_period_end: string | null; trial_used: boolean;
}
interface PricePreview {
  base_price_paise: number; addons_price_paise: number; subtotal_paise: number;
  gst_paise: number; total_paise: number; months: number;
}
interface DemoLead {
  id: string; full_name: string; business_name: string; phone: string; email: string;
  business_type: string | null; message: string | null; status: string;
  admin_notes: string | null; contacted_at: string | null; created_at: string;
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function SuperAdminPanel() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"workspaces" | "users" | "leads">("workspaces");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [wsRows, setWsRows] = useState<WsRow[]>([]);
  const [userRows, setUserRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", password: "", workspace_id: "", role_name: "", new_workspace_name: "" });
  const [wsMode, setWsMode] = useState<"existing" | "new">("existing");
  const [assignWsUser, setAssignWsUser] = useState<UserRow | null>(null);
  const [assignWsForm, setAssignWsForm] = useState({ workspace_id: "", role_name: "", new_workspace_name: "" });
  const [assignWsMode, setAssignWsMode] = useState<"existing" | "new">("existing");

  // ── Plan management (per-workspace) ──
  const [planExpiry, setPlanExpiry] = useState<Record<string, string | null>>({});
  const [planCatalog, setPlanCatalog] = useState<PlanCatalogEntry[]>([]);
  const [planDialogWs, setPlanDialogWs] = useState<WsRow | null>(null);
  const [planSub, setPlanSub] = useState<SubscriptionInfo | null>(null);
  const [planTab, setPlanTab] = useState<"assign" | "edit">("assign");
  const [planForm, setPlanForm] = useState({
    plan: "starter", billing_cycle: "monthly",
    extra_seats: 0, extra_numbers: 0, extra_contacts_blocks: 0,
    ai_chatbot: false, priority_support: false,
    custom_monthly_rupees: "",
  });
  const [planPreview, setPlanPreview] = useState<PricePreview | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    seats: "", contact_limit: "", whatsapp_number_limit: "", monthly_message_quota: "",
    current_period_end: "", status: "",
  });
  const [assigningWs, setAssigningWs] = useState(false);

  // ── Demo Requests (leads) ──
  const [leadRows, setLeadRows] = useState<DemoLead[]>([]);
  const [leadDialog, setLeadDialog] = useState<DemoLead | null>(null);
  const [leadNotes, setLeadNotes] = useState("");
  const [leadSaving, setLeadSaving] = useState(false);
  const newLeadCount = leadRows.filter((l) => l.status === "new").length;

  const loadLeads = useCallback(async () => {
    try {
      const { data } = await api.get<DemoLead[]>("/admin/demo-requests");
      setLeadRows(data);
    } catch { setError("Demo requests load failed"); }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const updateLeadStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/admin/demo-requests/${id}`, { status });
      await loadLeads();
    } catch { setError("Update failed"); }
  };

  const saveLeadNotes = async () => {
    if (!leadDialog) return;
    setLeadSaving(true);
    try {
      await api.patch(`/admin/demo-requests/${leadDialog.id}`, { admin_notes: leadNotes });
      setLeadDialog(null);
      await loadLeads();
    } catch { setError("Notes save failed"); }
    finally { setLeadSaving(false); }
  };


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
    api.get<PlanCatalogEntry[]>("/admin/plans/catalog").then(({ data }) => setPlanCatalog(data)).catch(() => {});
  }, []);

  // Real per-workspace expiry dates — shown in the Workspaces table.
  useEffect(() => {
    if (wsRows.length === 0) return;
    Promise.all(
      wsRows.map((w) =>
        api.get<SubscriptionInfo>(`/admin/workspaces/${w.id}/subscription`)
          .then(({ data }) => [w.id, data.current_period_end] as const)
          .catch(() => [w.id, null] as const)
      )
    ).then((pairs) => setPlanExpiry(Object.fromEntries(pairs)));
  }, [wsRows]);

  useEffect(() => {
    if (checking) return;
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [checking, load]);

  const openPlanDialog = async (w: WsRow) => {
    setPlanDialogWs(w);
    setPlanTab("assign");
    setPlanPreview(null);
    try {
      const { data } = await api.get<SubscriptionInfo>(`/admin/workspaces/${w.id}/subscription`);
      setPlanSub(data);
      setPlanForm({
        plan: data.plan === "trial" ? "starter" : data.plan,
        billing_cycle: data.billing_cycle === "trial" ? "monthly" : data.billing_cycle,
        extra_seats: Number(data.addons?.extra_seats || 0),
        extra_numbers: Number(data.addons?.extra_numbers || 0),
        extra_contacts_blocks: Number(data.addons?.extra_contacts_blocks || 0),
        ai_chatbot: Boolean(data.addons?.ai_chatbot),
        priority_support: Boolean(data.addons?.priority_support),
        custom_monthly_rupees: "",
      });
      setEditForm({
        seats: String(data.seats ?? ""),
        contact_limit: data.contact_limit != null ? String(data.contact_limit) : "",
        whatsapp_number_limit: data.whatsapp_number_limit != null ? String(data.whatsapp_number_limit) : "",
        monthly_message_quota: data.monthly_message_quota != null ? String(data.monthly_message_quota) : "",
        current_period_end: data.current_period_end ? data.current_period_end.slice(0, 10) : "",
        status: data.status,
      });
    } catch { setError("Subscription load failed"); }
  };

  const refreshPlanPreview = useCallback(async () => {
    if (!planDialogWs) return;
    try {
      const addons: Record<string, unknown> = {};
      if (planForm.extra_seats) addons.extra_seats = planForm.extra_seats;
      if (planForm.extra_numbers) addons.extra_numbers = planForm.extra_numbers;
      if (planForm.extra_contacts_blocks) addons.extra_contacts_blocks = planForm.extra_contacts_blocks;
      if (planForm.ai_chatbot) addons.ai_chatbot = true;
      if (planForm.priority_support) addons.priority_support = true;
      const { data } = await api.post<PricePreview>("/admin/plans/preview", {
        plan: planForm.plan, billing_cycle: planForm.billing_cycle, addons,
        custom_monthly_paise: planForm.plan === "enterprise" && planForm.custom_monthly_rupees
          ? Math.round(Number(planForm.custom_monthly_rupees) * 100) : null,
      });
      setPlanPreview(data);
    } catch { /* preview is best-effort */ }
  }, [planDialogWs, planForm]);

  useEffect(() => { if (planDialogWs) refreshPlanPreview(); }, [planDialogWs, refreshPlanPreview]);

  const submitAssignPlan = async () => {
    if (!planDialogWs) return;
    setPlanSaving(true); setError(null);
    try {
      const addons: Record<string, unknown> = {};
      if (planForm.extra_seats) addons.extra_seats = planForm.extra_seats;
      if (planForm.extra_numbers) addons.extra_numbers = planForm.extra_numbers;
      if (planForm.extra_contacts_blocks) addons.extra_contacts_blocks = planForm.extra_contacts_blocks;
      if (planForm.ai_chatbot) addons.ai_chatbot = true;
      if (planForm.priority_support) addons.priority_support = true;
      await api.post(`/admin/workspaces/${planDialogWs.id}/subscription/assign`, {
        plan: planForm.plan, billing_cycle: planForm.billing_cycle, addons,
        custom_monthly_paise: planForm.plan === "enterprise" && planForm.custom_monthly_rupees
          ? Math.round(Number(planForm.custom_monthly_rupees) * 100) : null,
      });
      setSuccess(`Plan assigned: ${planForm.plan} (${planForm.billing_cycle})`);
      setPlanDialogWs(null);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Plan assign failed"));
    } finally { setPlanSaving(false); }
  };

  const submitRenewPlan = async () => {
    if (!planDialogWs) return;
    setPlanSaving(true); setError(null);
    try {
      await api.post(`/admin/workspaces/${planDialogWs.id}/subscription/renew`);
      setSuccess("Plan renewed!");
      setPlanDialogWs(null);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Renew failed — trial plans can't be renewed, assign a paid plan instead."));
    } finally { setPlanSaving(false); }
  };

  const submitEditPlan = async () => {
    if (!planDialogWs) return;
    setPlanSaving(true); setError(null);
    try {
      await api.patch(`/admin/workspaces/${planDialogWs.id}/subscription`, {
        seats: editForm.seats ? Number(editForm.seats) : null,
        contact_limit: editForm.contact_limit ? Number(editForm.contact_limit) : null,
        whatsapp_number_limit: editForm.whatsapp_number_limit ? Number(editForm.whatsapp_number_limit) : null,
        monthly_message_quota: editForm.monthly_message_quota ? Number(editForm.monthly_message_quota) : null,
        current_period_end: editForm.current_period_end ? new Date(editForm.current_period_end).toISOString() : null,
        status: editForm.status || null,
      });
      setSuccess("Subscription updated!");
      setPlanDialogWs(null);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Edit failed"));
    } finally { setPlanSaving(false); }
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
    if (wsMode === "existing" && (!newUser.workspace_id || !newUser.role_name)) {
      setError("Workspace aur Role dono select karo — ya 'Naya Workspace' tab pe switch karo.");
      return;
    }
    if (wsMode === "new" && !newUser.new_workspace_name.trim()) {
      setError("Naye workspace ka naam do");
      return;
    }
    setSavingUser(true); setError(null);
    try {
      const { data: created } = await api.post<{ id: string }>("/admin/users", {
        full_name: newUser.full_name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        ...(wsMode === "existing"
          ? { workspace_id: newUser.workspace_id, role_name: newUser.role_name }
          : { new_workspace_name: newUser.new_workspace_name.trim() }),
      });
      setSuccess(wsMode === "new" ? "User + naya workspace dono create ho gaye! Ab plan assign karo." : "User create ho gaya! Ab plan assign karo.");
      setAddUserOpen(false);
      setNewUser({ full_name: "", email: "", password: "", workspace_id: "", role_name: "", new_workspace_name: "" });
      setWsMode("existing");
      await load();

      // Jump straight into the plan dialog for their workspace — a
      // brand-new user has zero plan otherwise (just the 3-day
      // trial), so this is almost always the very next thing an
      // admin wants to do after creating someone.
      try {
        const { data: detail } = await api.get<{ workspace_memberships: { workspace_id: string }[] }>(`/admin/users/${created.id}`);
        const wsId = detail.workspace_memberships[0]?.workspace_id;
        if (wsId) {
          const { data: freshWs } = await api.get<WsRow[]>("/admin/workspaces", { params: { search: "" } });
          const ws = freshWs.find((w) => w.id === wsId);
          if (ws) await openPlanDialog(ws);
        }
      } catch { /* not critical — admin can still open Manage Plan manually */ }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "User create failed"));
    } finally {
      setSavingUser(false);
    }
  };

  const assignWorkspaceToUser = async () => {
    if (!assignWsUser) return;
    if (assignWsMode === "existing" && (!assignWsForm.workspace_id || !assignWsForm.role_name)) {
      setError("Workspace aur Role dono select karo");
      return;
    }
    if (assignWsMode === "new" && !assignWsForm.new_workspace_name.trim()) {
      setError("Naye workspace ka naam do");
      return;
    }
    setAssigningWs(true); setError(null);
    try {
      await api.post(`/admin/users/${assignWsUser.id}/workspaces`,
        assignWsMode === "existing"
          ? { workspace_id: assignWsForm.workspace_id, role_name: assignWsForm.role_name }
          : { new_workspace_name: assignWsForm.new_workspace_name.trim() }
      );
      setSuccess(`${assignWsUser.email} ab workspace mein add ho gaya — ab login kar payega!`);
      setAssignWsUser(null);
      setAssignWsForm({ workspace_id: "", role_name: "", new_workspace_name: "" });
      setAssignWsMode("existing");
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Workspace assign failed"));
    } finally {
      setAssigningWs(false);
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
                {Object.keys(planCounts).filter((p) => planCounts[p]).map((p) => {
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
            {([["workspaces", "Workspaces"], ["users", "Users"], ["leads", "Demo Requests"]] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  tab === t ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
                {t === "leads" && newLeadCount > 0 && (
                  <span className={cn("rounded-full px-1.5 text-xs font-bold", tab === t ? "bg-white/25" : "bg-red-100 text-red-600")}>
                    {newLeadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {tab !== "leads" && (
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}...`} className="pl-8" />
              </div>
            )}
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
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Members</th>
                    <th className="px-4 py-3">Contacts</th>
                    <th className="px-4 py-3">Msgs (30d)</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Active</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {wsRows.map((w) => (
                    <tr key={w.id} className={cn(!w.is_active && "opacity-50")}>
                      <td className="px-4 py-3 font-medium">{w.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize">{w.plan}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {planExpiry[w.id] ? new Date(planExpiry[w.id]!).toLocaleDateString() : "—"}
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
                      <td className="px-4 py-3">
                        <Button variant="outline" size="sm" onClick={() => openPlanDialog(w)}>
                          <CreditCard className="h-3.5 w-3.5" /> Manage Plan
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {wsRows.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No workspaces</td></tr>
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
                        <div className="flex items-center gap-1.5">
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
                          {u.workspaces === 0 && !u.is_superuser && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAssignWsUser(u)}
                              className="text-amber-600 hover:bg-amber-50"
                              title="Is user ke paas koi workspace nahi hai — bina workspace ke yeh login karne ke baad stuck ho jaayega"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" /> Fix: No Workspace
                            </Button>
                          )}
                        </div>
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

        {/* Demo Requests table */}
        {tab === "leads" && (
          <div className="rounded-lg border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Received</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {leadRows.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-3 font-medium">{l.full_name}</td>
                      <td className="px-4 py-3">{l.business_name}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          <a href={`tel:${l.phone}`} className="block hover:underline">{l.phone}</a>
                          <a href={`mailto:${l.email}`} className="block text-muted-foreground hover:underline">{l.email}</a>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{l.business_type || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={l.status}
                          onChange={(e) => updateLeadStatus(l.id, e.target.value)}
                          className={cn(
                            "h-8 w-32 text-xs font-medium",
                            l.status === "new" && "text-blue-600",
                            l.status === "contacted" && "text-amber-600",
                            l.status === "converted" && "text-green-600",
                            l.status === "rejected" && "text-red-500"
                          )}
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="converted">Converted</option>
                          <option value="rejected">Rejected</option>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => { setLeadDialog(l); setLeadNotes(l.admin_notes || ""); }}
                        >
                          {l.admin_notes ? "Edit Notes" : "Add Notes"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {leadRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No demo requests yet</td></tr>
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
              <p className="mb-2 text-xs font-medium text-muted-foreground">Workspace * (zaroori)</p>
              <div className="mb-2 flex rounded-lg border border-border bg-muted p-0.5">
                {([["existing", "Existing Workspace"], ["new", "Naya Workspace Banao"]] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setWsMode(id)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      wsMode === id ? "bg-white shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {wsMode === "existing" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={newUser.workspace_id}
                    onChange={(e) => setNewUser({ ...newUser, workspace_id: e.target.value })}
                  >
                    <option value="">Workspace select karo *</option>
                    {wsRows.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </Select>
                  <Select
                    value={newUser.role_name}
                    onChange={(e) => setNewUser({ ...newUser, role_name: e.target.value })}
                    disabled={!newUser.workspace_id}
                  >
                    <option value="">Role select karo *</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div>
                  <Input
                    value={newUser.new_workspace_name}
                    onChange={(e) => setNewUser({ ...newUser, new_workspace_name: e.target.value })}
                    placeholder="Naye workspace ka naam (jaise: Rahul's Business)"
                  />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    User is naye workspace ka <strong>owner + Admin</strong> banega
                  </p>
                </div>
              )}
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

      {/* ── Fix: Assign Workspace (for orphaned 0-workspace users) ── */}
      <Dialog open={assignWsUser !== null} onClose={() => setAssignWsUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Workspace Assign Karo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              <strong>{assignWsUser?.email}</strong> ke paas abhi koi workspace nahi hai — isliye yeh login karne ke baad stuck ho jaata hai.
            </p>
            <div className="flex rounded-lg border border-border bg-muted p-0.5">
              {([["existing", "Existing Workspace"], ["new", "Naya Workspace Banao"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAssignWsMode(id)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    assignWsMode === id ? "bg-white shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {assignWsMode === "existing" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Workspace</Label>
                  <Select
                    value={assignWsForm.workspace_id}
                    onChange={(e) => setAssignWsForm({ ...assignWsForm, workspace_id: e.target.value })}
                  >
                    <option value="">Workspace select karo</option>
                    {wsRows.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={assignWsForm.role_name}
                    onChange={(e) => setAssignWsForm({ ...assignWsForm, role_name: e.target.value })}
                  >
                    <option value="">Role select karo</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label>Naye Workspace ka Naam</Label>
                <Input
                  value={assignWsForm.new_workspace_name}
                  onChange={(e) => setAssignWsForm({ ...assignWsForm, new_workspace_name: e.target.value })}
                  placeholder="jaise: Rahul's Business"
                />
                <p className="text-[10px] text-muted-foreground">User is naye workspace ka owner + Admin banega</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignWsUser(null)}>Cancel</Button>
            <Button onClick={assignWorkspaceToUser} disabled={assigningWs}>
              {assigningWs ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage Plan (Assign / Renew / Edit) ── */}
      <Dialog open={planDialogWs !== null} onClose={() => setPlanDialogWs(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Plan — {planDialogWs?.name}</DialogTitle>
          </DialogHeader>

          {planSub && (
            <div className="mb-3 rounded-lg bg-muted p-3 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Current Plan</span><span className="font-semibold capitalize">{planSub.plan} ({planSub.billing_cycle})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={cn("font-semibold capitalize", planSub.status === "active" ? "text-green-600" : "text-red-600")}>{planSub.status}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Expires</span><span>{planSub.current_period_end ? new Date(planSub.current_period_end).toLocaleDateString() : "Never"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seats / Contacts</span><span>{planSub.seats} / {planSub.contact_limit ?? "∞"}</span></div>
            </div>
          )}

          <div className="mb-3 flex rounded-lg border border-border bg-muted p-0.5">
            {([["assign", "Assign / Change Plan"], ["edit", "Manual Edit"]] as const).map(([id, label]) => (
              <button
                key={id} type="button" onClick={() => setPlanTab(id)}
                className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors", planTab === id ? "bg-white shadow-sm" : "text-muted-foreground")}
              >
                {label}
              </button>
            ))}
          </div>

          {planTab === "assign" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Plan</Label>
                  <Select value={planForm.plan} onChange={(e) => setPlanForm({ ...planForm, plan: e.target.value })}>
                    {planCatalog.filter((p) => p.plan !== "trial").map((p) => (
                      <option key={p.plan} value={p.plan}>{p.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Billing Cycle</Label>
                  <Select value={planForm.billing_cycle} onChange={(e) => setPlanForm({ ...planForm, billing_cycle: e.target.value })}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly (12% off)</option>
                    <option value="yearly">Yearly (25% off)</option>
                  </Select>
                </div>
              </div>

              {planForm.plan === "enterprise" && (
                <div className="space-y-1.5">
                  <Label>Custom Monthly Price (₹)</Label>
                  <Input
                    type="number" placeholder="25000"
                    value={planForm.custom_monthly_rupees}
                    onChange={(e) => setPlanForm({ ...planForm, custom_monthly_rupees: e.target.value })}
                  />
                </div>
              )}

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Add-ons</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Extra Seats (₹299/ea)</Label>
                    <Input type="number" min={0} value={planForm.extra_seats}
                      onChange={(e) => setPlanForm({ ...planForm, extra_seats: Number(e.target.value) })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Extra Numbers (₹1,199/ea)</Label>
                    <Input type="number" min={0} value={planForm.extra_numbers}
                      onChange={(e) => setPlanForm({ ...planForm, extra_numbers: Number(e.target.value) })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Extra +5k Contacts (₹239/ea)</Label>
                    <Input type="number" min={0} value={planForm.extra_contacts_blocks}
                      onChange={(e) => setPlanForm({ ...planForm, extra_contacts_blocks: Number(e.target.value) })} className="h-8" />
                  </div>
                  <div className="flex flex-col justify-center gap-1.5 pt-4">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={planForm.ai_chatbot} onChange={(e) => setPlanForm({ ...planForm, ai_chatbot: e.target.checked })} /> AI Chatbot (₹1,799)</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={planForm.priority_support} onChange={(e) => setPlanForm({ ...planForm, priority_support: e.target.checked })} /> Priority Support (₹949)</label>
                  </div>
                </div>
              </div>

              {planPreview && (
                <div className="rounded-lg bg-primary/5 p-3 text-xs">
                  <div className="flex justify-between"><span>Subtotal ({planPreview.months} mo)</span><span>{rupees(planPreview.subtotal_paise)}</span></div>
                  <div className="flex justify-between"><span>GST (18%)</span><span>{rupees(planPreview.gst_paise)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm font-bold"><span>Total</span><span>{rupees(planPreview.total_paise)}</span></div>
                </div>
              )}

              <Button onClick={submitAssignPlan} disabled={planSaving} className="w-full">
                {planSaving ? "Assigning..." : "Assign Plan"}
              </Button>
            </div>
          )}

          {planTab === "edit" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Seats</Label>
                  <Input value={editForm.seats} onChange={(e) => setEditForm({ ...editForm, seats: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact Limit</Label>
                  <Input value={editForm.contact_limit} onChange={(e) => setEditForm({ ...editForm, contact_limit: e.target.value })} className="h-8" placeholder="blank = unlimited" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">WhatsApp Numbers</Label>
                  <Input value={editForm.whatsapp_number_limit} onChange={(e) => setEditForm({ ...editForm, whatsapp_number_limit: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Message Quota</Label>
                  <Input value={editForm.monthly_message_quota} onChange={(e) => setEditForm({ ...editForm, monthly_message_quota: e.target.value })} className="h-8" placeholder="blank = unlimited" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Expires On</Label>
                  <Input type="date" value={editForm.current_period_end} onChange={(e) => setEditForm({ ...editForm, current_period_end: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="h-8">
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Manual overrides — for goodwill extensions or custom Enterprise limits. Doesn&apos;t change the plan/billing cycle or create an invoice.</p>
              <Button onClick={submitEditPlan} disabled={planSaving} className="w-full">
                {planSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}

          <DialogFooter className="mt-3 justify-between border-t border-border pt-3">
            <Button
              variant="outline" onClick={submitRenewPlan} disabled={planSaving || planSub?.plan === "trial"}
              title={planSub?.plan === "trial" ? "Trial can't be renewed — assign a paid plan" : "Extend current plan by one more billing period"}
            >
              🔄 Renew (same plan)
            </Button>
            <Button variant="outline" onClick={() => setPlanDialogWs(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Demo Lead Notes ── */}
      <Dialog open={leadDialog !== null} onClose={() => setLeadDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{leadDialog?.full_name} — {leadDialog?.business_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {leadDialog?.message && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Their message</p>
                <p>{leadDialog.message}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Admin Notes</Label>
              <textarea
                value={leadNotes}
                onChange={(e) => setLeadNotes(e.target.value)}
                rows={4}
                placeholder="Call ki, interested in Growth plan, follow up next week..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeadDialog(null)}>Cancel</Button>
            <Button onClick={saveLeadNotes} disabled={leadSaving}>{leadSaving ? "Saving..." : "Save Notes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}