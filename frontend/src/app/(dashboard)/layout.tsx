"use client";

/**
 * Shared authenticated app shell: left sidebar + content area.
 * Every page under (dashboard) gets this automatically via the
 * App Router route-group layout. Redirects to /login if not
 * authenticated, and to /signup if the user has no workspace yet
 * (shouldn't normally happen — signup always creates one).
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
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
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 bg-background">{children}</div>
    </div>
  );
}
