"use client";
import { useCallback, useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ArrowDownRight, ArrowUpRight, MessageCircle, Users, Clock, Megaphone } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AnalyticsOverviewResponse } from "@/types/analytics";

const PERIOD_OPTIONS = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        {label}
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null);
  const [period, setPeriod] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<AnalyticsOverviewResponse>(`/analytics/overview?period_days=${period}`);
      setData(data);
    } catch { setError("Failed to load analytics"); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Topbar title="Analytics" />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex justify-end">
          <Select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="w-40">
            {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </div>

        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
              <MetricCard icon={<MessageCircle className="h-4 w-4" />} label="Conversations" value={data.metrics.total_conversations}
                sub={`${data.metrics.open_conversations} open · ${data.metrics.resolved_conversations} resolved`} />
              <MetricCard icon={<Users className="h-4 w-4" />} label="Contacts" value={data.metrics.total_contacts}
                sub={`+${data.metrics.new_contacts_this_period} this period`} />
              <MetricCard icon={<ArrowUpRight className="h-4 w-4" />} label="Messages Sent" value={data.metrics.messages_sent}
                sub={`${data.metrics.messages_received} received`} />
              <MetricCard icon={<Clock className="h-4 w-4" />} label="Avg Response Time" value={data.metrics.avg_response_time_minutes ? `${data.metrics.avg_response_time_minutes}m` : "—"} />
            </div>

            <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 text-sm font-semibold">Messages over time</h3>
              {data.daily_messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No message data for this period yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.daily_messages}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sent" fill="#16a34a" name="Sent" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="received" fill="#3b82f6" name="Received" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Megaphone className="h-4 w-4 text-primary" /> Campaign Performance</h3>
              {data.campaign_performance.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No campaigns in this period yet.</p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Campaign</th>
                      <th className="py-2">Sent</th>
                      <th className="py-2">Delivery Rate</th>
                      <th className="py-2">Read Rate</th>
                      <th className="py-2">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaign_performance.map((c) => (
                      <tr key={c.campaign_id} className="border-b border-border last:border-0">
                        <td className="py-2 font-medium">{c.name}</td>
                        <td className="py-2">{c.sent}</td>
                        <td className="py-2">{c.delivery_rate}%</td>
                        <td className="py-2">{c.read_rate}%</td>
                        <td className="py-2 text-red-600">{c.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}