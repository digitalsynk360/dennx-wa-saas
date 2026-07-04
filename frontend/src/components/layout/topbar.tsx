"use client";

import { useState } from "react";
import { ChevronDown, Menu } from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

import { useSidebar } from "./sidebar-context";

/**
 * Top bar: hamburger (mobile) + page title on the left; role badge,
 * workspace switcher and user name on the right. Non-essential items
 * collapse away on small screens so nothing overflows.
 */
export function Topbar({ title }: { title: string }) {
  const { user, workspaces, activeWorkspace, setActiveWorkspaceId } = useAuth();
  const { setMobileOpen } = useSidebar();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-white px-3 sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-foreground hover:bg-muted md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</h1>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 sm:inline-block">
          {activeWorkspace?.role ?? "Member"}
        </span>

        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex max-w-[140px] items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted sm:max-w-[220px]"
          >
            <span className="truncate">{activeWorkspace?.name ?? "Select workspace"}</span>
            {workspaces.length > 1 && <ChevronDown className="h-4 w-4 flex-shrink-0" />}
          </button>

          {open && workspaces.length > 1 && (
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-border bg-white py-1 shadow-md">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => {
                    setActiveWorkspaceId(ws.id);
                    setOpen(false);
                    window.location.reload();
                  }}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted",
                    ws.id === activeWorkspace?.id && "bg-muted"
                  )}
                >
                  <span className="font-medium">{ws.name}</span>
                  <span className="text-xs text-muted-foreground">{ws.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="hidden text-sm text-muted-foreground lg:inline">{user?.full_name}</span>
      </div>
    </header>
  );
}