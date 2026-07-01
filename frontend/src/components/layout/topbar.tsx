"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

/**
 * Top bar: page title (left) + role badge, active workspace name, and
 * a workspace switcher dropdown (right) — matches the reference
 * "Admin  Demo Account" header, extended with a switcher since a user
 * can belong to multiple workspaces (Sub Admins screen).
 */
export function Topbar({ title }: { title: string }) {
  const { user, workspaces, activeWorkspace, setActiveWorkspaceId } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <div className="flex items-center gap-3">
        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
          {activeWorkspace?.role ?? "Member"}
        </span>

        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            {activeWorkspace?.name ?? "Select workspace"}
            {workspaces.length > 1 && <ChevronDown className="h-4 w-4" />}
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

        <span className="text-sm text-muted-foreground">{user?.full_name}</span>
      </div>
    </header>
  );
}
