"use client";

/**
 * Shared authenticated app shell: left sidebar + content area.
 * SidebarProvider lets the Topbar hamburger open the mobile drawer.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { useAuth } from "@/context/auth-context";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { endImpersonation, isImpersonating, setTokens } from "@/lib/auth-storage";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const { isLoading } = useRequireAuth();
  const { isAuthenticated, activeWorkspace, workspaces } = useAuth();
  const router = useRouter();
  const [impersonating, setImpersonatingFlag] = useState(false);

  useEffect(() => {
    setImpersonatingFlag(isImpersonating());
  }, []);

  const returnToAdmin = () => {
    const admin = endImpersonation();
    if (!admin) return;
    setTokens(admin.access, admin.refresh);
    window.location.href = "/superadmin";
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaces.length === 0) {
      router.replace("/signup");
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
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <div className="min-w-0 flex-1 bg-background">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}