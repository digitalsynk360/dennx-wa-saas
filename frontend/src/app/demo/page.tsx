"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, getErrorMessage } from "@/lib/api";

const BUSINESS_TYPES = [
  "Retail / E-commerce", "Real Estate", "Education", "Healthcare",
  "Travel & Tourism", "Restaurant / Food", "Services / Consulting",
  "Manufacturing", "Franchise", "Other",
];

export default function DemoRequestPage() {
  const [form, setForm] = useState({
    full_name: "", business_name: "", phone: "", email: "", business_type: "", message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.business_name.trim() || !form.phone.trim() || !form.email.trim()) {
      setError("Naam, business naam, phone aur email zaroori hain");
      return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.post("/demo", form);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Kuch galat ho gaya — dobara try karo"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <AuthLayout title="Thank You!" description="Hum jald aapse contact karenge">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500" />
          <p className="text-sm text-muted-foreground">
            Aapka demo request mil gaya hai. Hamari team 24 ghanton ke andar aapse contact karegi
            aapka WhatsApp Business account setup karne ke liye.
          </p>
          <Link href="/login" className="mt-2 text-sm font-medium text-primary hover:underline">
            Already account hai? Login karo →
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Book a Free Demo"
      description="WhatsApp Business automation — apna account 24 ghanton mein live karo"
      footer={
        <>
          Already account hai?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Login karo
          </Link>
        </>
      }
    >
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Aapka Naam *</Label>
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Rahul Sharma"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Business Naam *</Label>
          <Input
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            placeholder="Rahul Traders"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Phone Number *</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="98765 43210"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="rahul@example.com"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Business Type</Label>
          <Select
            value={form.business_type}
            onChange={(e) => setForm({ ...form, business_type: e.target.value })}
          >
            <option value="">Select karo (optional)</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Message (optional)</Label>
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Aapko kis type ka WhatsApp automation chahiye..."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Sending..." : "Request Free Demo"}
        </Button>
      </form>
    </AuthLayout>
  );
}