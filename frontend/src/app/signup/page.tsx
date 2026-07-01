"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractErrorMessage, useAuth } from "@/context/auth-context";
import { signupSchema, type SignupFormValues } from "@/lib/validation";

export default function SignupPage() {
  const { signup } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupFormValues) => {
    setError(null);
    try {
      await signup(values);
    } catch (err) {
      setError(extractErrorMessage(err, "Unable to create your account. Please try again."));
    }
  };

  return (
    <AuthLayout
      title="Create Account"
      description="Start sending WhatsApp campaigns today"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full Name</Label>
          <Input id="full_name" placeholder="John Doe" {...register("full_name")} />
          {errors.full_name && <p className="text-sm text-red-600">{errors.full_name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="demo@gmail.com" {...register("email")} />
          {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...register("password")} />
          {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="business_name">Business Name</Label>
          <Input id="business_name" placeholder="Acme Corp" {...register("business_name")} />
          {errors.business_name && (
            <p className="text-sm text-red-600">{errors.business_name.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create Account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
