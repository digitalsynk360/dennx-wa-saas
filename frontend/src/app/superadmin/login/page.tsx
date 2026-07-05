"use client";
/**
 * Standalone Super Admin login — separate from the normal app login.
 * URL: /superadmin/login
 * Verifies is_superuser after auth; normal users are rejected.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { clearTokens, setTokens } from "@/lib/auth-storage";
import type { MeResponse, TokenPairResponse } from "@/types/auth";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data: tokens } = await api.post<TokenPairResponse>("/auth/login", {
        email, password,
      });
      setTokens(tokens.access_token, tokens.refresh_token);

      const { data: me } = await api.get<MeResponse>("/auth/me");
      if (!me.user.is_superuser) {
        clearTokens();
        setError("Access denied — yeh account superadmin nahi hai.");
        setLoading(false);
        return;
      }
      router.replace("/superadmin");
    } catch {
      clearTokens();
      setError("Invalid email ya password.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold text-white">Super Admin</h1>
          <p className="mt-1 text-sm text-gray-400">Platform control panel</p>
        </div>

        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-gray-300">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-white/10 bg-gray-800 text-white placeholder:text-gray-500"
              placeholder="admin@company.com"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-gray-300">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/10 bg-gray-800 text-white"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
          </div>
          <Button className="w-full" onClick={handleLogin} disabled={loading || !email || !password}>
            {loading ? "Verifying..." : "Sign in"}
          </Button>
        </div>
      </div>
    </main>
  );
}