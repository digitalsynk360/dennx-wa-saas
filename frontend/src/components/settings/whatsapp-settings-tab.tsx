"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, getErrorMessage } from "@/lib/api";
import type { WhatsAppAccountResponse } from "@/types/whatsapp";

/**
 * Real Meta Embedded Signup (Tech Provider flow) — see
 * backend/app/services/whatsapp_service.py for the full server-side
 * half. The customer never sees or types an App ID, App Secret,
 * access token, WABA ID or phone number ID — Meta's own popup
 * collects everything and hands it back to this page automatically.
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
      setError("WhatsApp account load nahi hua");
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
      setSuccess("WhatsApp connected! Turant use karne ke liye ready hai.");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Connect complete nahi hua — dobara try karo"));
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
        setError(data.data?.error_message || "Signup cancel ho gaya — dobara try karo.");
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
      setError("Facebook SDK abhi load ho raha hai — 2 second baad try karo.");
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
          setError("Facebook login cancel ho gaya ya complete nahi hua.");
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
    if (!confirm("WhatsApp account disconnect karoge? Messaging turant ruk jaayegi.")) return;
    try {
      await api.delete("/whatsapp/disconnect");
      setAccount(null);
      setSuccess("Disconnected.");
    } catch {
      setError("Disconnect fail hua");
    }
  };

  if (loading) {
    return <div className="max-w-2xl text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="max-w-2xl">
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

      <div className="rounded-xl border border-border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">WhatsApp Business API</h2>
            <p className="text-sm text-muted-foreground">Meta ke saath ek-click mein connect karo</p>
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
            Meta Tech Provider app server pe configure nahi hai (META_APP_ID / META_APP_SECRET / META_EMBEDDED_SIGNUP_CONFIG_ID missing). Deploy se pehle .env.production mein set karo.
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
              Facebook popup khulega — apna Business Portfolio, WABA aur phone number select/create karo. Access Token, WABA ID, Phone Number ID — kuch bhi manually daalne ki zarurat nahi.
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

      {/* Webhook URL — informational, already auto-subscribed during Connect */}
      <div className="mt-6 rounded-lg border border-border bg-white p-5">
        <h3 className="mb-2 font-semibold">Webhook URL</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Yeh Meta App Dashboard mein already configure hai — &quot;Connect WhatsApp&quot; karte hi is customer ke WABA ke liye bhi automatically subscribe ho jaata hai.
        </p>
        <code className="block rounded bg-muted px-3 py-2 text-sm">
          {process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "")}/api/v1/webhooks/whatsapp
        </code>
      </div>
    </div>
  );
}