/**
 * Shared Axios instance for talking to the FastAPI backend.
 *
 * NEXT_PUBLIC_API_URL must point at /api/v1 on the backend
 * (see /.env.example).
 *
 * Auth flow:
 *  - request interceptor attaches the access token (from localStorage)
 *  - response interceptor catches 401s, attempts a silent refresh via
 *    /auth/refresh using the stored refresh token, and retries the
 *    original request once.
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import {
  clearTokens,
  getAccessToken,
  getActiveWorkspaceId,
  getRefreshToken,
  setTokens,
} from "@/lib/auth-storage";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const workspaceId = getActiveWorkspaceId();
  if (workspaceId) {
    config.headers["X-Workspace-Id"] = workspaceId;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }
  const response = await axios.post(
    `${api.defaults.baseURL}/auth/refresh`,
    { refresh_token: refreshToken }
  );
  const { access_token, refresh_token } = response.data;
  setTokens(access_token, refresh_token);
  return access_token;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      originalRequest._retry = true;
      try {
        refreshPromise ??= refreshAccessToken();
        const newAccessToken = await refreshPromise;
        refreshPromise = null;

        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch {
        refreshPromise = null;
        clearTokens();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Safely extracts a human-readable error string from any Axios/API
 * error shape. FastAPI's `detail` field is NOT always a string —
 * Pydantic validation failures (422s) return it as an array of
 * `{type, loc, msg}` objects instead. Passing that array/object
 * straight into React (`{error}`) crashes with "Objects are not
 * valid as a React child" (minified error #31) — every catch block
 * in the app should route through this instead of reading
 * `err.response.data.detail` directly.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === "object" && d !== null && "msg" in d ? String((d as { msg: unknown }).msg) : null))
      .filter((m): m is string => Boolean(m));
    if (msgs.length) return msgs.join("; ");
  }

  if (detail && typeof detail === "object") {
    const maybeMsg = (detail as { msg?: unknown; message?: unknown }).msg ?? (detail as { message?: unknown }).message;
    if (typeof maybeMsg === "string") return maybeMsg;
  }

  if (err instanceof Error && err.message) return err.message;

  return fallback;
}