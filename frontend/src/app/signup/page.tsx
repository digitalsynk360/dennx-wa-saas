import { redirect } from "next/navigation";

// Self-serve signup is disabled on this platform — accounts are
// created only by the Superadmin (see /superadmin > Users > Add
// User). Anyone landing on the old /signup URL (bookmark, old link,
// etc.) is sent to the public demo-request form instead.
export default function SignupRedirectPage() {
  redirect("/demo");
}