/**
 * Sidebar navigation, ordered and labeled exactly as in the reference
 * screenshots. `phase` notes when each route's page is implemented —
 * not-yet-built routes still render in the sidebar (so the IA is
 * visible from Phase 3 onward) but the pages themselves are added in
 * their respective phases.
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  CreditCard,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Megaphone,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Users,
  UserCog,
  Workflow,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inbox", href: "/inbox", icon: Inbox, permission: "conversations.read" },
  { label: "History", href: "/history", icon: History, permission: "conversations.read" },
  { label: "Contacts", href: "/contacts", icon: Users, permission: "contacts.read" },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone, permission: "campaigns.read" },
  { label: "Templates", href: "/templates", icon: MessageSquareText, permission: "templates.read" },
  { label: "Chatbot", href: "/chatbot", icon: Bot, permission: "chatbot.manage" },
  { label: "Flows", href: "/flows", icon: Workflow, permission: "chatbot.manage" },
  { label: "Catalogue", href: "/catalogue", icon: ShoppingBag },
  { label: "Analytics", href: "/analytics", icon: BarChart3, permission: "analytics.read" },
  { label: "Agents", href: "/agents", icon: UserCog, permission: "members.manage" },
  { label: "Sub Admins", href: "/sub-admins", icon: ShieldCheck, permission: "members.manage" },
  { label: "Billing", href: "/billing", icon: CreditCard, permission: "billing.manage" },
  { label: "Settings", href: "/settings", icon: Settings, permission: "workspace.manage" },
];

export const LOGOUT_ITEM: NavItem = { label: "Logout", href: "#logout", icon: LogOut };
