"use client";

/**
 * Shared authenticated app shell: left sidebar + content area.
 * SidebarProvider lets the Topbar hamburger open the mobile drawer.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { useAuth } from "@/context/auth-context";
import { useRequireAuth } from "@/hooks/use-require-auth";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const { isLoading } = useRequireAuth();
  const { isAuthenticated, activeWorkspace, workspaces } = useAuth();
  const router = useRouter();

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
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1 bg-background">{children}</div>
      </div>
    </SidebarProvider>
  );
}