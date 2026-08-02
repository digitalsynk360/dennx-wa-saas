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
import { Textarea } from "@/components/ui/textarea";
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
      setError("Name, business name, phone and email are required.");
      return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.post("/demo", form);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Something went wrong — please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <AuthLayout title="Thank You!" description="We'll be in touch soon">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500" />
          <p className="text-sm text-muted-foreground">
            We&apos;ve received your demo request. Our team will contact you within 24 hours
            to set up your WhatsApp Business account.
          </p>
          <Link href="/login" className="mt-2 text-sm font-medium text-primary hover:underline">
            Already have an account? Sign in →
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Book a Free Demo"
      description="WhatsApp Business automation — get your account live within 24 hours"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Your Name *</Label>
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Rahul Sharma"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Business Name *</Label>
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
            <option value="">Select (optional)</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Message (optional)</Label>
          <Textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="What kind of WhatsApp automation are you looking for…"
            rows={3}
          />
        </div>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Sending..." : "Request Free Demo"}
        </Button>
      </form>
    </AuthLayout>
  );
}