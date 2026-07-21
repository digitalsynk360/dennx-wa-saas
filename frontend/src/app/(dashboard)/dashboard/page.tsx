// frontend/src/app/(dashboard)/dashboard/page.tsx
// Replace existing dashboard page with this real metrics version

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  MessageSquare, Users, Zap, Clock,
  TrendingUp, TrendingDown, Bot, CheckCircle,
  Send, Activity, ArrowRight, GitBranch, Upload, FileText, UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { Topbar } from "@/components/layout/topbar";
import type { ConversationListResponse, ConversationResponse } from "@/types/inbox";

interface DashboardData {
  conversations: { open: number; bot_handling: number; resolved_today: number };
  messages: { today: number; inbound_today: number; outbound_today: number; this_month: number; growth_pct: number | null };
  contacts: { total: number; new_this_week: number; growth_pct: number | null };
  campaigns: { active: number; total_sent: number };
  flows: { active: number; active_sessions: number };
  avg_response_minutes: number | null;
  daily_chart: { date: string; inbound: number; outbound: number }[];
  meta_insights: {
    period_days: number;
    sent: number;
    delivered: number;
    delivery_rate: number | null;
    daily: { date: string; sent: number; delivered: number }[];
    phone_health: {
      display_phone_number: string | null;
      verified_name: string | null;
      quality_rating: string | null;
      name_status: string | null;
      code_verification_status: string | null;
      messaging_limit_tier: string | null;
      tier_limit_24h: number;
      safe_daily_volume: number;
    } | null;
  } | null;
}

function StatCard({
  label, value, sub, icon: Icon, growth, color = "blue"
}: {
  label: string; value: string | number; sub?: string;
  icon: any; growth?: number | null; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    teal: "bg-teal-50 text-teal-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </span>
        {growth !== null && growth !== undefined && (
          <span className={`flex items-center gap-1 text-xs font-medium rounded-full px-2 py-1 ${
            growth >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
          }`}>
            {growth >= 0
              ? <TrendingUp className="h-3 w-3" />
              : <TrendingDown className="h-3 w-3" />}
            {Math.abs(growth)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-0.5">{value}</p>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recent, setRecent] = useState<ConversationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaDays, setMetaDays] = useState(7);
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    api.get<ConversationListResponse>("/conversations", { params: { page_size: 5 } })
      .then(({ data }) => setRecent(data.items))
      .catch(() => {});
    api.get<DashboardData>("/analytics/dashboard", { params: { days: metaDays } })
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Refetch only the Meta insights block when the period changes —
  // no need to reload the whole dashboard.
  useEffect(() => {
    if (loading) return; // skip the very first mount (covered above)
    setMetaLoading(true);
    api.get<DashboardData>("/analytics/dashboard", { params: { days: metaDays } })
      .then(({ data }) => setData((prev) => (prev ? { ...prev, meta_insights: data.meta_insights } : data)))
      .catch(() => {})
      .finally(() => setMetaLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaDays]);

  if (loading) return (
    <><Topbar title="Dashboard" />
    <div className="p-8 flex items-center justify-center min-h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
    </div>
    </>
  );

  if (!data) return (
    <><Topbar title="Dashboard" /><div className="p-8 text-center text-gray-400">Failed to load dashboard.</div></>
  );

  return (
    <>
    <Topbar title="Dashboard" />
    <div className="p-4 sm:p-6 space-y-6">
      <p className="text-sm text-gray-500">Overview of your WhatsApp workspace</p>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/campaigns", icon: Send, label: "New Campaign" },
          { href: "/flows", icon: GitBranch, label: "New Flow" },
          { href: "/contacts", icon: Upload, label: "Import Contacts" },
          { href: "/templates", icon: FileText, label: "Templates" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-primary hover:text-primary hover:shadow-md"
          >
            <a.icon className="h-4 w-4 text-gray-400 transition-colors group-hover:text-primary" />
            {a.label}
          </Link>
        ))}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Conversations"
          value={data.conversations.open}
          sub={`${data.conversations.bot_handling} handled by bot`}
          icon={MessageSquare}
          color="blue"
        />
        <StatCard
          label="Messages Today"
          value={data.messages.today}
          sub={`↓ ${data.messages.inbound_today} in · ↑ ${data.messages.outbound_today} out`}
          icon={Send}
          growth={data.messages.growth_pct}
          color="green"
        />
        <StatCard
          label="Total Contacts"
          value={data.contacts.total.toLocaleString()}
          sub={`+${data.contacts.new_this_week} this week`}
          icon={Users}
          growth={data.contacts.growth_pct}
          color="purple"
        />
        <StatCard
          label="Avg Response Time"
          value={data.avg_response_minutes !== null
            ? `${data.avg_response_minutes}m`
            : "—"}
          sub="Last 7 days"
          icon={Clock}
          color="orange"
        />
      </div>

      {/* Secondary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Resolved Today"
          value={data.conversations.resolved_today}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          label="Active Flows"
          value={data.flows.active}
          sub={`${data.flows.active_sessions} sessions waiting`}
          icon={Zap}
          color="purple"
        />
        <StatCard
          label="Active Campaigns"
          value={data.campaigns.active}
          sub={`${data.campaigns.total_sent} total sent`}
          icon={Activity}
          color="orange"
        />
        <StatCard
          label="Messages This Month"
          value={data.messages.this_month.toLocaleString()}
          icon={Bot}
          growth={data.messages.growth_pct}
          color="teal"
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Messages — Last 7 Days</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.daily_chart} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }}
              cursor={{ fill: "#f9fafb" }}
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
            <Bar dataKey="inbound"  name="Inbound"  fill="#3b82f6" radius={[6, 6, 0, 0]} />
            <Bar dataKey="outbound" name="Outbound" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Meta WhatsApp Insights (live from Meta, selectable period) ── */}
      {data.meta_insights && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-700">
              WhatsApp Insights (Meta) {metaLoading && <span className="text-gray-400">— updating...</span>}
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={metaDays}
                onChange={(e) => setMetaDays(Number(e.target.value))}
                disabled={metaLoading}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              <span className="text-[10px] uppercase tracking-wide text-gray-400">Live from WhatsApp Manager</span>
            </div>
          </div>

          {/* Phone number identity + health */}
          {data.meta_insights.phone_health && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-800">
                  {data.meta_insights.phone_health.verified_name || "—"}
                </p>
                <p className="text-xs text-gray-500">{data.meta_insights.phone_health.display_phone_number || "—"}</p>
              </div>
              {(() => {
                const q = (data.meta_insights.phone_health.quality_rating || "UNKNOWN").toUpperCase();
                const map: Record<string, { label: string; cls: string }> = {
                  GREEN: { label: "High Quality", cls: "bg-green-100 text-green-700" },
                  YELLOW: { label: "Medium Quality", cls: "bg-amber-100 text-amber-700" },
                  RED: { label: "Low Quality", cls: "bg-red-100 text-red-700" },
                  UNKNOWN: { label: "Unknown", cls: "bg-gray-200 text-gray-600" },
                };
                const info = map[q] || map.UNKNOWN;
                return (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${info.cls}`}>
                    ● {info.label}
                  </span>
                );
              })()}
              {data.meta_insights.phone_health.name_status && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 capitalize">
                  Name: {data.meta_insights.phone_health.name_status.toLowerCase().replace(/_/g, " ")}
                </span>
              )}
              {data.meta_insights.phone_health.messaging_limit_tier && (
                <span
                  className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600"
                  title="Meta's per-24h unique-contact messaging tier for this number"
                >
                  {data.meta_insights.phone_health.messaging_limit_tier.replace("TIER_", "").replace("K", ",000")}/24h tier
                </span>
              )}
              {data.meta_insights.phone_health.safe_daily_volume > 0 && (
                <span
                  className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-600"
                  title="80% of your tier ceiling — the volume campaigns auto-pace themselves under to protect your Quality Rating"
                >
                  Safe daily volume: {data.meta_insights.phone_health.safe_daily_volume.toLocaleString()}
                </span>
              )}
            </div>
          )}

          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
              <p className="text-xl font-bold text-gray-800">{data.meta_insights.sent}</p>
              <p className="text-xs text-gray-500">Messages Sent</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
              <p className="text-xl font-bold text-green-600">{data.meta_insights.delivered}</p>
              <p className="text-xs text-gray-500">Delivered</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
              <p className="text-xl font-bold text-blue-600">
                {data.meta_insights.delivery_rate !== null ? `${data.meta_insights.delivery_rate}%` : "—"}
              </p>
              <p className="text-xs text-gray-500">Delivery Rate</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.meta_insights.daily} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} cursor={{ fill: "#f9fafb" }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="sent" name="Sent" fill="#94a3b8" radius={[6, 6, 0, 0]} />
              <Bar dataKey="delivered" name="Delivered" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Handling split + Recent conversations ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Bot vs Human donut */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Open Chats — Who&apos;s Handling</h2>
          {(() => {
            const bot = data.conversations.bot_handling;
            const human = Math.max(data.conversations.open - bot, 0);
            const pie = [
              { name: "Bot", value: bot },
              { name: "Human", value: human },
            ];
            const COLORS = ["#16a34a", "#3b82f6"];
            return data.conversations.open === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No open conversations</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={pie} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                      {pie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 flex justify-center gap-5 text-xs">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" /> Bot: {bot}</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" /> Human: {human}</span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Recent conversations */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Recent Conversations</h2>
            <Link href="/inbox" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Open Inbox <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No conversations yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {recent.map((c) => (
                <Link
                  key={c.id}
                  href="/inbox"
                  className="flex items-center gap-3 py-2.5 transition-colors hover:bg-gray-50 -mx-2 px-2 rounded-lg"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800">
                      {c.contact.name || c.contact.phone}
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                      {c.last_message_preview || "—"}
                    </span>
                  </span>
                  <span
                    className={
                      "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                      (c.handling === "bot"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700")
                    }
                  >
                    {c.handling}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                      {c.unread_count}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}