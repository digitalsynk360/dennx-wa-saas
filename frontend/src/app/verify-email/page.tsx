"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/context/auth-context";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This verification link is invalid or missing a token.");
      return;
    }

    (async () => {
      try {
        const { data } = await api.post("/auth/verify-email", { token });
        setStatus("success");
        setMessage(data.message);
      } catch (err) {
        setStatus("error");
        setMessage(extractErrorMessage(err, "Unable to verify your email. The link may have expired."));
      }
    })();
  }, [token]);

  return (
    <AuthLayout
      title="Email Verification"
      description=""
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Alert variant={status === "success" ? "success" : status === "error" ? "destructive" : "default"}>
        {message}
      </Alert>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
