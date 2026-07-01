/**
 * Root route. Authenticated users land on /dashboard (built in
 * Phase 5); for now this is the marketing/landing placeholder with
 * links into the auth flow built in this phase.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center text-white"
      style={{ backgroundColor: "hsl(var(--teal-deep))" }}
    >
      <div>
        <h1 className="text-4xl font-bold">Limbu WA SaaS</h1>
        <p className="mt-2 text-white/80">
          WhatsApp Business automation platform — authentication is ready.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild size="lg" variant="default">
          <Link href="/signup">Get Started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Sign In</Link>
        </Button>
      </div>
    </main>
  );
}
