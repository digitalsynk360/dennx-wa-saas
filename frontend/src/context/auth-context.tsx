"use client";

/**
 * Global auth state: current user, their workspaces, and the
 * currently-selected workspace (persisted so a refresh keeps the
 * same workspace selected — used from Phase 3 onward).
 *
 * login()/signup() store tokens then fetch /auth/me; logout() clears
 * everything and redirects to /login.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

import { api } from "@/lib/api";
import {
  clearActiveWorkspaceId,
  clearTokens,
  getActiveWorkspaceId,
  hasTokens,
  setActiveWorkspaceId as persistActiveWorkspaceId,
  setTokens,
} from "@/lib/auth-storage";
import type {
  LoginFormValues,
  SignupFormValues,
} from "@/lib/validation";
import type { MeResponse, UserResponse, WorkspaceSummary } from "@/types/auth";

interface AuthContextValue {
  user: UserResponse | null;
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (values: LoginFormValues) => Promise<void>;
  signup: (values: SignupFormValues) => Promise<void>;
  logout: () => void;
  setActiveWorkspaceId: (workspaceId: string) => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const { data } = await api.get<MeResponse>("/auth/me");
    setUser(data.user);
    setWorkspaces(data.workspaces);

    const stored = getActiveWorkspaceId();
    const validStored = data.workspaces.find((w) => w.id === stored);
    const chosen = validStored ?? data.workspaces[0] ?? null;
    setActiveWorkspaceIdState(chosen?.id ?? null);
    if (chosen) {
      persistActiveWorkspaceId(chosen.id);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!hasTokens()) {
        setIsLoading(false);
        return;
      }
      try {
        await loadMe();
      } catch {
        clearTokens();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadMe]);

  const login = useCallback(
    async (values: LoginFormValues) => {
      const { data } = await api.post("/auth/login", values);
      setTokens(data.access_token, data.refresh_token);
      await loadMe();
      router.push("/dashboard");
    },
    [loadMe, router]
  );

  const signup = useCallback(
    async (values: SignupFormValues) => {
      const { data } = await api.post("/auth/signup", values);
      setTokens(data.tokens.access_token, data.tokens.refresh_token);
      await loadMe();
      router.push("/dashboard");
    },
    [loadMe, router]
  );

  const logout = useCallback(() => {
    clearTokens();
    clearActiveWorkspaceId();
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceIdState(null);
    router.push("/login");
  }, [router]);

  const setActiveWorkspaceId = useCallback((workspaceId: string) => {
    setActiveWorkspaceIdState(workspaceId);
    persistActiveWorkspaceId(workspaceId);
  }, []);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        workspaces,
        activeWorkspace,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        signup,
        logout,
        setActiveWorkspaceId,
        refreshMe: loadMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/** Extracts a human-readable message from an Axios/FastAPI error. */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg as string;
  }
  return fallback;
}
