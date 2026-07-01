"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { roleHasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { LOGOUT_ITEM, NAV_ITEMS } from "./sidebar-nav";

/**
 * Left navigation rail — near-black background, green active state,
 * matching the reference screenshots. Items requiring a permission
 * the active user's role doesn't have are hidden.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { activeWorkspace, logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || roleHasPermission(activeWorkspace?.role, item.permission)
  );

  return (
    <aside className="flex h-screen w-[200px] flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
        <MessageCircle className="h-6 w-6 text-sidebar-active" />
        <span className="truncate text-sm font-semibold">
          {activeWorkspace?.name ?? "Workspace"}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {visibleItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
