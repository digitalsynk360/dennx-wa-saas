/**
 * Zod schemas for forms, shared between React Hook Form resolvers
 * and (optionally) server-side validation mirroring.
 */
import { z } from "zod";

export const signupSchema = z.object({
  full_name: z.string().min(2, "Enter your full name").max(255),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  business_name: z.string().min(2, "Enter your business name").max(255),
});
export type SignupFormValues = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    new_password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string().min(8, "Please confirm your password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export const inviteMemberSchema = z.object({
  full_name: z.string().min(2, "Enter a full name").max(255),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role_name: z.enum(["Admin", "Manager", "Agent"]),
});
export type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>;
