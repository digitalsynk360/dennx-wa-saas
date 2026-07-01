/**
 * Lightweight client-side permission check for hiding nav items /
 * action buttons. The backend remains the source of truth (every
 * mutating endpoint re-checks via require_permission); this is purely
 * for UX — never the only guard for sensitive actions.
 *
 * Role -> permission mapping mirrors
 * backend/app/utils/rbac_seed.py ROLES.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: [
    "workspace.manage",
    "members.manage",
    "contacts.read",
    "contacts.write",
    "conversations.read",
    "conversations.write",
    "campaigns.read",
    "campaigns.write",
    "templates.read",
    "templates.write",
    "chatbot.manage",
    "analytics.read",
    "billing.manage",
  ],
  Manager: [
    "contacts.read",
    "contacts.write",
    "conversations.read",
    "conversations.write",
    "campaigns.read",
    "campaigns.write",
    "templates.read",
    "templates.write",
    "chatbot.manage",
    "analytics.read",
  ],
  Agent: ["contacts.read", "conversations.read", "conversations.write"],
};

export function roleHasPermission(roleName: string | undefined, permission: string): boolean {
  if (!roleName) return false;
  return ROLE_PERMISSIONS[roleName]?.includes(permission) ?? false;
}
