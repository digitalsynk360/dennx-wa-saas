"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Check } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { InvoiceResponse, SubscriptionResponse, UsageResponse } from "@/types/billing";

const PLANS = [
  { id: "free", name: "Free", price: "₹0", messages: "1,000", seats: "2" },
  { id: "starter", name: "Starter", price: "₹999/mo", messages: "10,000", seats: "5" },
  { id: "growth", name: "Growth", price: "₹2,999/mo", messages: "50,000", seats: "15" },
  { id: "enterprise", name: "Enterprise", price: "Contact us", messages: "Unlimited", seats: "Unlimited" },
];

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [invoices, setInvoices] = useState<InvoiceResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const load = () => {
    Promise.all([
      api.get<SubscriptionResponse>("/billing/subscription"),
      api.get<UsageResponse>("/billing/usage"),
      api.get<{ items: InvoiceResponse[] }>("/billing/invoices"),
    ]).then(([sub, use, inv]) => {
      setSubscription(sub.data);
      setUsage(use.data);
      setInvoices(inv.data.items);
    }).catch(() => setError("Failed to load billing info"));
  };

  useEffect(() => { load(); }, []);

  const handleChangePlan = async (plan: string) => {
    setChanging(true);
    try {
      await api.post("/billing/change-plan", { plan });
      load();
    } catch { setError("Failed to change plan"); }
    finally { setChanging(false); }
  };

  const messagePercent = usage?.messages_quota
    ? Math.min(100, Math.round((usage.messages_used_this_period / usage.messages_quota) * 100))
    : 0;

  return (
    <>
      <Topbar title="Billing & Usage" />
      <div className="p-6 max-w-4xl">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        {usage && (
          <div className="mb-6 rounded-lg border border-border bg-white p-5">
            <h3 className="font-semibold mb-3">Usage this period</h3>
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Messages sent</span>
                <span>{usage.messages_used_this_period} / {usage.messages_quota ?? "∞"}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${messagePercent}%` }} />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Seats used</span>
              <span>{usage.seats_used} / {usage.seats_quota}</span>
            </div>
          </div>
        )}

        <h3 className="font-semibold mb-3">Plans</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {PLANS.map((plan) => {
            const isCurrent = subscription?.plan === plan.id;
            return (
              <div key={plan.id} className={`rounded-lg border-2 bg-white p-4 ${isCurrent ? "border-primary" : "border-border"}`}>
                <p className="font-semibold">{plan.name}</p>
                <p className="text-xl font-bold mt-1">{plan.price}</p>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-green-600" /> {plan.messages} messages/mo</li>
                  <li className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-green-600" /> {plan.seats} seats</li>
                </ul>
                <Button
                  size="sm"
                  variant={isCurrent ? "outline" : "default"}
                  className="mt-4 w-full"
                  disabled={isCurrent || changing}
                  onClick={() => handleChangePlan(plan.id)}
                >
                  {isCurrent ? "Current Plan" : "Switch"}
                </Button>
              </div>
            );
          })}
        </div>

        <h3 className="font-semibold mb-3">Invoice history</h3>
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b border-border">
              <tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th></tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No invoices yet.</td></tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{inv.number}</td>
                  <td className="px-4 py-3">{inv.currency} {(inv.amount / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 capitalize">{inv.status}</td>
                  <td className="px-4 py-3 text-muted-foreground">{format(new Date(inv.created_at), "dd MMM yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
