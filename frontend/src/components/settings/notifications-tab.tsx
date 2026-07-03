"use client";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { NotificationPreferences } from "@/types/billing";

const TOGGLES: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: "email_new_message", label: "New message email", description: "Get emailed when a contact sends a new message" },
  { key: "email_campaign_complete", label: "Campaign completed", description: "Get emailed when a broadcast campaign finishes" },
  { key: "email_template_status", label: "Template approval updates", description: "Get emailed when Meta approves/rejects a template" },
  { key: "email_weekly_summary", label: "Weekly summary", description: "A weekly digest of conversations and campaign performance" },
  { key: "push_new_message", label: "Push notifications", description: "Browser push notification for new messages" },
];

export function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<NotificationPreferences>("/notifications/preferences")
      .then(({ data }) => setPrefs(data))
      .catch(() => setError("Failed to load preferences"));
  }, []);

  const handleToggle = async (key: keyof NotificationPreferences) => {
    if (!prefs) return;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    try {
      await api.patch("/notifications/preferences", { [key]: updated[key] });
    } catch {
      setError("Failed to save preference");
      setPrefs(prefs); // revert
    }
  };

  return (
    <div className="max-w-2xl">
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
      <div className="rounded-lg border border-border bg-white divide-y divide-border">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-medium text-sm">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </div>
            <Switch
              size="sm"
              checked={Boolean(prefs?.[t.key])}
              onCheckedChange={() => handleToggle(t.key)}
              disabled={!prefs}
            />
          </div>
        ))}
      </div>
    </div>
  );
}