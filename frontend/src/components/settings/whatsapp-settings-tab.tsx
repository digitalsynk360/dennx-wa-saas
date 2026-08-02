"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getErrorMessage } from "@/lib/api";
import type { WhatsAppAccountResponse } from "@/types/whatsapp";

/**
 * Primary: real Meta Embedded Signup (Tech Provider flow) — see
 * backend/app/services/whatsapp_service.py for the full server-side
 * half. The customer never sees or types an App ID, App Secret,
 * access token, WABA ID or phone number ID — Meta's own popup
 * collects everything and hands it back to this page automatically.
 *
 * Fallback: a manual credentials form, collapsed under "Advanced",
 * for cases where Embedded Signup itself is unavailable (e.g. the
 * Meta app is still in Development Mode / missing Business
 * Verification / App Review) — same backend endpoint that existed
 * before Embedded Signup was built.
 */

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        callback: (response: { status?: string; authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>
      ) => void;
    };
  }
}

type WaEmbeddedSignupMessage = {
  type: string;
  event: "FINISH" | "FINISH_ONLY_WABA" | "CANCEL" | string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
    error_message?: string;
  };
};

export function WhatsAppSettingsTab() {
  const [account, setAccount] = useState<WhatsAppAccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<{ app_id: string; config_id: string; configured: boolean } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    waba_id: "", phone_number_id: "", display_phone_number: "",
    business_name: "", access_token: "",
  });

  // Holds whichever pieces have arrived so far — the popup's
  // `code` (from FB.login's callback) and `waba_id`/`phone_number_id`
  // (from Meta's postMessage) arrive as two independent async
  // events, in no guaranteed order.
  const pending = useRef<{ code?: string; waba_id?: string; phone_number_id?: string }>({});

  const loadAccount = useCallback(async () => {
    try {
      const { data } = await api.get<WhatsAppAccountResponse | null>("/whatsapp/account");
      setAccount(data);
    } catch {
      setError("Couldn't load WhatsApp account.");
    } finally {
      setLoading(false);
    }
  }, []);

  const finishIfReady = useCallback(async () => {
    const { code, waba_id, phone_number_id } = pending.current;
    if (!code || !waba_id || !phone_number_id) return; // still waiting on one of the two events

    setConnecting(true);
    setError(null);
    try {
      const { data } = await api.post<WhatsAppAccountResponse>("/whatsapp/embedded-signup/complete", {
        code, waba_id, phone_number_id,
      });
      setAccount(data);
      setSuccess("WhatsApp connected! It's ready to use right away.");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Couldn't complete the connection — please try again."));
    } finally {
      setConnecting(false);
      pending.current = {};
    }
  }, []);

  // 1) Fetch the (non-secret) app_id + config_id our backend has configured
  useEffect(() => {
    api.get<{ app_id: string; config_id: string; configured: boolean }>("/whatsapp/embedded-signup/config")
      .then(({ data }) => setConfig(data))
      .catch(() => {});
    loadAccount();
  }, [loadAccount]);

  // 2) Load the Facebook JS SDK once config_id/app_id is known
  useEffect(() => {
    if (!config?.app_id || typeof window === "undefined") return;
    if (document.getElementById("facebook-jssdk")) { setSdkReady(true); return; }

    window.fbAsyncInit = () => {
      window.FB?.init({ appId: config.app_id, cookie: true, xfbml: false, version: "v22.0" });
      setSdkReady(true);
    };

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [config?.app_id]);

  // 3) Listen for Meta's postMessage — this is the ONLY way we get
  // waba_id / phone_number_id; they are never typed by the user.
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let data: WaEmbeddedSignupMessage;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // not a JSON message meant for us
      }
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        pending.current.waba_id = data.data?.waba_id;
        pending.current.phone_number_id = data.data?.phone_number_id;
        finishIfReady();
      } else if (data.event === "CANCEL") {
        setError(data.data?.error_message || "Signup was cancelled — please try again.");
        setConnecting(false);
        pending.current = {};
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [finishIfReady]);

  const launchSignup = () => {
    setError(null); setSuccess(null);
    if (!window.FB || !config?.config_id) {
      setError("Facebook SDK is still loading — please try again in a moment.");
      return;
    }
    setConnecting(true);
    pending.current = {};
    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          pending.current.code = response.authResponse.code;
          finishIfReady();
        } else {
          setConnecting(false);
          setError("Facebook login was cancelled or didn't complete.");
        }
      },
      {
        config_id: config.config_id,
        response_type: "code",
        override_default_response_type: true,
        extras: { sessionInfoVersion: "3" },
      }
    );
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect this WhatsApp account? Messaging will stop immediately.")) return;
    try {
      await api.delete("/whatsapp/disconnect");
      setAccount(null);
      setSuccess("Disconnected.");
    } catch {
      setError("Couldn't disconnect. Please try again.");
    }
  };

  const handleManualConnect = async () => {
    if (!manualForm.waba_id.trim() || !manualForm.phone_number_id.trim() || !manualForm.access_token.trim()) {
      setError("WABA ID, Phone Number ID and Access Token are required.");
      return;
    }
    setSavingManual(true); setError(null);
    try {
      const { data } = await api.post<WhatsAppAccountResponse>("/whatsapp/connect", manualForm);
      setAccount(data);
      setSuccess("WhatsApp connected manually!");
      setManualForm({ waba_id: "", phone_number_id: "", display_phone_number: "", business_name: "", access_token: "" });
      setShowManual(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Manual connection failed."));
    } finally {
      setSavingManual(false);
    }
  };

  if (loading) {
    return <div className="max-w-2xl text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="max-w-2xl">
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">WhatsApp Business API</h2>
            <p className="text-sm text-muted-foreground">Connect with Meta in one click</p>
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
          <div className="mb-5 space-y-1 rounded-md bg-muted p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Business Name</span><span className="font-medium">{account.verified_business_name || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Phone Number</span><span className="font-medium">{account.display_phone_number || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">WABA ID</span><span className="font-mono text-xs">{account.waba_id}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quality Rating</span><span>{account.quality_rating || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Webhook</span><span>{account.webhook_subscribed ? "✅ Subscribed" : "⚠️ Not subscribed"}</span></div>
          </div>
        )}

        {!config?.configured ? (
          <Alert variant="destructive">
            The Meta Tech Provider app isn&apos;t configured on the server (META_APP_ID / META_APP_SECRET / META_EMBEDDED_SIGNUP_CONFIG_ID missing). Set these in .env.production before deploying.
          </Alert>
        ) : (
          <>
            <button
              onClick={launchSignup}
              disabled={connecting || !sdkReady}
              className="flex items-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1864d9] disabled:opacity-60"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {connecting ? "Connecting..." : account ? "Reconnect WhatsApp" : "Connect WhatsApp"}
            </button>
            <p className="mt-2 text-[10px] text-muted-foreground">
              A Facebook popup will open — select or create your Business Portfolio, WABA and phone number. There&apos;s no need to enter the Access Token, WABA ID or Phone Number ID manually.
            </p>
          </>
        )}

        {account && (
          <div className="mt-4 border-t border-border pt-4">
            <Button variant="outline" onClick={handleDisconnect} className="border-red-200 text-red-600 hover:bg-red-50">
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {/* ── Manual fallback — for when Embedded Signup itself is unavailable ── */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
        <button
          type="button"
          onClick={() => setShowManual((s) => !s)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h3 className="font-semibold">Advanced: Manual Setup</h3>
            <p className="text-sm text-muted-foreground">
              If &quot;Connect WhatsApp&quot; doesn&apos;t work (the Meta app is still in Development mode or verification is pending), you can enter your credentials manually here.
            </p>
          </div>
          <span className="ml-3 text-lg text-muted-foreground">{showManual ? "−" : "+"}</span>
        </button>

        {showManual && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              You&apos;ll find these values in Meta App Dashboard → WhatsApp → API Setup.
            </p>
            <div className="space-y-1.5">
              <Label>Business Name</Label>
              <Input
                placeholder="Deenx Consultancy"
                value={manualForm.business_name}
                onChange={(e) => setManualForm((f) => ({ ...f, business_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number ID *</Label>
              <Input
                placeholder="106911733..."
                value={manualForm.phone_number_id}
                onChange={(e) => setManualForm((f) => ({ ...f, phone_number_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>WABA ID *</Label>
              <Input
                placeholder="133294082..."
                value={manualForm.waba_id}
                onChange={(e) => setManualForm((f) => ({ ...f, waba_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Display Phone Number</Label>
              <Input
                placeholder="+91 98969 00461"
                value={manualForm.display_phone_number}
                onChange={(e) => setManualForm((f) => ({ ...f, display_phone_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Permanent Access Token *</Label>
              <Input
                type="password"
                placeholder="EAAxxxxxxx..."
                value={manualForm.access_token}
                onChange={(e) => setManualForm((f) => ({ ...f, access_token: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">The token is encrypted at rest — it&apos;s never stored in plain text.</p>
            </div>
            <Button
              onClick={handleManualConnect}
              disabled={savingManual || !manualForm.waba_id || !manualForm.phone_number_id || !manualForm.access_token}
            >
              {savingManual ? "Connecting..." : "Manually Connect"}
            </Button>
          </div>
        )}
      </div>

      {/* Webhook URL — informational, already auto-subscribed during Connect */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
        <h3 className="mb-2 font-semibold">Webhook URL</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          This is already configured in the Meta App Dashboard — as soon as you connect WhatsApp, this customer&apos;s WABA is subscribed automatically too.
        </p>
        <code className="block rounded bg-muted px-3 py-2 text-sm">
          {process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "")}/api/v1/webhooks/whatsapp
        </code>
      </div>
    </div>
  );
}