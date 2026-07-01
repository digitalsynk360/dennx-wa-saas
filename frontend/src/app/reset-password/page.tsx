"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/context/auth-context";
import { resetPasswordSchema, type ResetPasswordFormValues } from "@/lib/validation";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("This reset link is invalid or missing a token.");
      return;
    }

    try {
      const { data } = await api.post("/auth/reset-password", {
        token,
        new_password: values.new_password,
      });
      setSuccess(data.message);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to reset your password. The link may have expired."));
    }
  };

  return (
    <AuthLayout
      title="Reset Password"
      description="Choose a new password for your account"
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {success ? (
        <Alert variant="success">{success}</Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          {!token && (
            <Alert variant="destructive">
              No reset token found in the link. Request a new one from the
              forgot-password page.
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="new_password">New Password</Label>
            <Input id="new_password" type="password" {...register("new_password")} />
            {errors.new_password && (
              <p className="text-sm text-red-600">{errors.new_password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">Confirm Password</Label>
            <Input id="confirm_password" type="password" {...register("confirm_password")} />
            {errors.confirm_password && (
              <p className="text-sm text-red-600">{errors.confirm_password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Resetting..." : "Reset Password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
