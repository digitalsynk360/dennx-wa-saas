"use client";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { WhatsAppAccountResponse } from "@/types/whatsapp";

export function WhatsAppSettingsTab() {
  const [account, setAccount] = useState<WhatsAppAccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    waba_id: "", phone_number_id: "", display_phone_number: "",
    business_name: "", access_token: "",
  });

  useEffect(() => {
    // Load Facebook SDK for Embedded Signup
    if (typeof window !== "undefined" && !document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        (window as { fbAsyncInit?: () => void }).fbAsyncInit = () => {
          (window as { FB?: { init: (opts: object) => void } }).FB?.init({
            appId: process.env.NEXT_PUBLIC_META_APP_ID || "",
            cookie: true, xfbml: true, version: "v21.0",
          });
        };
      };
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    api.get<WhatsAppAccountResponse | null>("/whatsapp/account")
      .then(({ data }) => {
        setAccount(data);
        if (data) {
          setForm(f => ({
            ...f,
            waba_id: data.waba_id,
            phone_number_id: data.phone_number_id,
            display_phone_number: data.display_phone_number || "",
            business_name: data.verified_business_name || "",
          }));
        }
      })
      .catch(() => setError("Failed to load WhatsApp account"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(null); setSuccess(null); setSaving(true);
    try {
      const { data } = await api.post<WhatsAppAccountResponse>("/whatsapp/connect", form);
      setAccount(data);
      setSuccess("WhatsApp account connected successfully!");
      setForm(f => ({ ...f, access_token: "" }));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to connect");
    } finally { setSaving(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect WhatsApp account?")) return;
    try {
      await api.delete("/whatsapp/disconnect");
      setAccount(null);
      setSuccess("Disconnected.");
    } catch { setError("Failed to disconnect"); }
  };

  return (
    <div className="max-w-2xl">
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {/* WhatsApp Status Card */}
        <div className="mb-6 rounded-lg border border-border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">WhatsApp Business API</h2>
              <p className="text-sm text-muted-foreground">Connect your WhatsApp Business account</p>
            </div>
            {account ? (
              <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                <span className="h-2 w-2 rounded-full bg-green-500" /> LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                <span className="h-2 w-2 rounded-full bg-red-500" /> NOT CONNECTED
              </span>
            )}
          </div>

          {account && (
            <div className="mb-4 rounded-md bg-muted p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Business Name</span><span className="font-medium">{account.verified_business_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone Number</span><span className="font-medium">{account.display_phone_number}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">WABA ID</span><span className="font-mono text-xs">{account.waba_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Quality Rating</span><span>{account.quality_rating || "—"}</span></div>
            </div>
          )}
        </div>

        {/* ── Embedded Signup (recommended) ── */}
        <div className="rounded-xl border border-border bg-white p-5">
          <h3 className="mb-1 text-sm font-semibold">Quick Connect (Recommended)</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Facebook se seedha connect karo — Phone Number ID manually dhundhne ki zarurat nahi.
          </p>
          <button
            onClick={() => {
              // Facebook Embedded Signup flow
              if (typeof window !== "undefined" && (window as { FB?: { login: (cb: (r: { authResponse?: { accessToken: string } }) => void, opts: object) => void } }).FB) {
                const FB = ((window as unknown) as { FB: { login: (cb: (r: { authResponse?: { accessToken: string } }) => void, opts: object) => void } }).FB;
                FB.login(
                  (response: { authResponse?: { accessToken: string } }) => {
                    if (response.authResponse?.accessToken) {
                      setSuccess("Token received — please enter your Phone Number ID below to complete setup.");
                      setForm((f) => ({ ...f, access_token: response.authResponse!.accessToken }));
                    }
                  },
                  {
                    scope: "whatsapp_business_messaging,whatsapp_business_management",
                    extras: { feature: "whatsapp_embedded_signup" },
                  }
                );
              } else {
                setError("Facebook SDK load nahi hua. Page refresh karo ya manual setup use karo.");
              }
            }}
            className="flex items-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1864d9] transition-colors"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Continue with Facebook
          </button>
          <p className="mt-2 text-[10px] text-muted-foreground">
            WhatsApp Business API access required. Meta approval ke baad activate hoga.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ya manual setup karo</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Connect Form */}
        <div className="rounded-lg border border-border bg-white p-5">
          <h3 className="font-semibold mb-4">WhatsApp API Credentials (manual)</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Get these from Meta App Dashboard → WhatsApp → API Setup
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Business Name</Label>
              <Input placeholder="MannuBhai Service Expert" value={form.business_name}
                onChange={(e) => setForm(f => ({ ...f, business_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number ID *</Label>
              <Input placeholder="113027286016..." value={form.phone_number_id}
                onChange={(e) => setForm(f => ({ ...f, phone_number_id: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>WABA ID *</Label>
              <Input placeholder="116671626887..." value={form.waba_id}
                onChange={(e) => setForm(f => ({ ...f, waba_id: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Display Phone Number</Label>
              <Input placeholder="+91 93115 87730" value={form.display_phone_number}
                onChange={(e) => setForm(f => ({ ...f, display_phone_number: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Permanent Access Token *</Label>
              <Input type="password" placeholder="EAAxxxxxxx..." value={form.access_token}
                onChange={(e) => setForm(f => ({ ...f, access_token: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Token is encrypted before storage. Never logged or exposed.</p>
            </div>
          </div>
          <div className="mt-5 flex justify-between">
            {account && (
              <Button variant="outline" onClick={handleDisconnect} className="text-red-600 border-red-200 hover:bg-red-50">
                Disconnect
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || !form.phone_number_id || !form.waba_id || !form.access_token} className="ml-auto">
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>

        {/* Webhook URL */}
        <div className="mt-6 rounded-lg border border-border bg-white p-5">
          <h3 className="font-semibold mb-2">Webhook URL</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Configure this URL in your Meta App Dashboard → WhatsApp → Configuration
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">
              {process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "")}/api/v1/webhooks/whatsapp
            </code>
            <Button variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "")}/api/v1/webhooks/whatsapp`);
            }}>Copy</Button>
          </div>
        </div>
    </div>
  );
}