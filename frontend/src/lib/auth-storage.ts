/**
 * Token + active-workspace persistence. localStorage is used for
 * simplicity (no SSR cookie plumbing yet); since the backend is a
 * separate origin, httpOnly cookies would require additional
 * CORS/cookie config — revisit if XSS-hardening becomes a priority
 * before launch.
 */
const ACCESS_TOKEN_KEY = "deenx_access_token";
const REFRESH_TOKEN_KEY = "deenx_refresh_token";
const ACTIVE_WORKSPACE_KEY = "deenx_active_workspace_id";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function hasTokens(): boolean {
  return Boolean(getAccessToken() && getRefreshToken());
}

export function getActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
}

export function setActiveWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
}

export function clearActiveWorkspaceId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
}

// ─── Superadmin impersonation ──────────────────────────────────────
// When a superadmin clicks "Login as", their own tokens are stashed
// here (sessionStorage — cleared when the tab closes, unlike the
// impersonated session's localStorage tokens) so a visible "Return
// to Admin" banner can restore them without a full logout/login.
const IMPERSONATION_ADMIN_TOKEN_KEY = "deenx_impersonation_admin_access";
const IMPERSONATION_ADMIN_REFRESH_KEY = "deenx_impersonation_admin_refresh";

export function startImpersonation(adminAccessToken: string, adminRefreshToken: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(IMPERSONATION_ADMIN_TOKEN_KEY, adminAccessToken);
  sessionStorage.setItem(IMPERSONATION_ADMIN_REFRESH_KEY, adminRefreshToken);
}

export function isImpersonating(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(sessionStorage.getItem(IMPERSONATION_ADMIN_TOKEN_KEY));
}

export function endImpersonation(): { access: string; refresh: string } | null {
  if (typeof window === "undefined") return null;
  const access = sessionStorage.getItem(IMPERSONATION_ADMIN_TOKEN_KEY);
  const refresh = sessionStorage.getItem(IMPERSONATION_ADMIN_REFRESH_KEY);
  sessionStorage.removeItem(IMPERSONATION_ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(IMPERSONATION_ADMIN_REFRESH_KEY);
  if (!access || !refresh) return null;
  return { access, refresh };
}