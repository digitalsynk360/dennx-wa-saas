"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { roleHasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { useSidebar } from "./sidebar-context";
import { LOGOUT_ITEM, NAV_ITEMS } from "./sidebar-nav";

/**
 * Left navigation rail.
 * Desktop (md+): fixed 200px rail, always visible.
 * Mobile: hidden by default; slides in as a drawer with a dark
 * overlay when the Topbar hamburger sets mobileOpen = true.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { activeWorkspace, logout } = useAuth();
  const { mobileOpen, setMobileOpen } = useSidebar();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || roleHasPermission(activeWorkspace?.role, item.permission)
  );

  const nav = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle className="h-6 w-6 flex-shrink-0 text-sidebar-active" />
          <span className="truncate text-sm font-semibold">
            {activeWorkspace?.name ?? "Workspace"}
          </span>
        </div>
        {/* Close button — mobile drawer only */}
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground md:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {visibleItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-active/15 text-sidebar-active font-medium"
                  : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 py-2">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
        >
          <LOGOUT_ITEM.icon className="h-4 w-4" />
          {LOGOUT_ITEM.label}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-[200px] flex-shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        {nav}
      </aside>

      {/* Mobile drawer + overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] max-w-[80vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}