// frontend/src/app/(dashboard)/dashboard/page.tsx
// Replace existing dashboard page with this real metrics version

"use client";
import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  MessageSquare, Users, Zap, Clock,
  TrendingUp, TrendingDown, Bot, CheckCircle,
  Send, Activity,
} from "lucide-react";
import { api } from "@/lib/api";
import { Topbar } from "@/components/layout/topbar";

interface DashboardData {
  conversations: { open: number; bot_handling: number; resolved_today: number };
  messages: { today: number; inbound_today: number; outbound_today: number; this_month: number; growth_pct: number | null };
  contacts: { total: number; new_this_week: number; growth_pct: number | null };
  campaigns: { active: number; total_sent: number };
  flows: { active: number; active_sessions: number };
  avg_response_minutes: number | null;
  daily_chart: { date: string; inbound: number; outbound: number }[];
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardData>("/analytics/dashboard")
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    </div>
    </>
  );
}