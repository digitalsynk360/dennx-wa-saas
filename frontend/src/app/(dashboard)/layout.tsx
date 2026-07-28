"use client";

/**
 * Shared authenticated app shell: left sidebar + content area.
 * SidebarProvider lets the Topbar hamburger open the mobile drawer.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { useAuth } from "@/context/auth-context";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { api } from "@/lib/api";
import { endImpersonation, isImpersonating, setTokens } from "@/lib/auth-storage";

interface SubscriptionInfo {
  plan: string;
  status: string;
  current_period_end: string | null;
}

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const { isLoading } = useRequireAuth();
  const { isAuthenticated, activeWorkspace, workspaces } = useAuth();
  const router = useRouter();
  const [impersonating, setImpersonatingFlag] = useState(false);
  const [planExpired, setPlanExpired] = useState(false);
  const [expiringSoonDays, setExpiringSoonDays] = useState<number | null>(null);

  useEffect(() => {
    setImpersonatingFlag(isImpersonating());
  }, []);

  const returnToAdmin = () => {
    const admin = endImpersonation();
    if (!admin) return;
    setTokens(admin.access, admin.refresh);
    window.location.href = "/superadmin";
  };

  const checkPlanStatus = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const { data } = await api.get<SubscriptionInfo>("/billing/subscription");
      if (data.status !== "active") {
        setPlanExpired(true);
        setExpiringSoonDays(null);
        return;
      }
      if (!data.current_period_end) { setPlanExpired(false); setExpiringSoonDays(null); return; }
      const daysLeft = Math.ceil((new Date(data.current_period_end).getTime() - Date.now()) / 86400000);
      if (daysLeft < 0) { setPlanExpired(true); setExpiringSoonDays(null); }
      else { setPlanExpired(false); setExpiringSoonDays(daysLeft <= 3 ? daysLeft : null); }
    } catch { /* billing check is best-effort — don't block the app if it fails */ }
  }, [activeWorkspace]);

  useEffect(() => { checkPlanStatus(); }, [checkPlanStatus]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaces.length === 0) {
      router.replace("/demo");
    }
  }, [isLoading, isAuthenticated, workspaces.length, router]);

  if (isLoading || !isAuthenticated || !activeWorkspace) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen flex-col">
        {impersonating && (
          <div className="flex h-9 flex-shrink-0 items-center justify-center gap-2 bg-amber-500 px-4 text-xs font-medium text-white">
            👁️ Superadmin ke roop mein — is user ke account ko dekh rahe ho
            <button
              onClick={returnToAdmin}
              className="ml-2 rounded-full bg-white/20 px-2.5 py-0.5 font-semibold hover:bg-white/30"
            >
              ← Return to Admin
            </button>
          </div>
        )}
        {planExpired && (
          <div className="flex h-9 flex-shrink-0 items-center justify-center gap-2 bg-red-600 px-4 text-xs font-medium text-white">
            ⚠️ Aapka plan expire ho gaya hai — naye campaigns/messages bhejne se pehle plan renew karo. Aapka existing data safe hai.
          </div>
        )}
        {!planExpired && expiringSoonDays !== null && (
          <div className="flex h-9 flex-shrink-0 items-center justify-center gap-2 bg-amber-100 px-4 text-xs font-medium text-amber-800">
            ⏳ Aapka plan {expiringSoonDays === 0 ? "aaj" : `${expiringSoonDays} din mein`} expire ho raha hai — renew karne ke liye admin se contact karo.
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <div className="min-w-0 flex-1 bg-background">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}