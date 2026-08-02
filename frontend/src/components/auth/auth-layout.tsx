import { MessageCircle } from "lucide-react";

/**
 * Shared shell for /login, /signup, /forgot-password, /reset-password:
 * deep teal full-screen backdrop with a soft radial glow, centered card.
 * Mobile: comfortable padding; card never touches screen edges.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ backgroundColor: "hsl(var(--teal-deep))" }}
    >
      {/* Soft brand glow for depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.22), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md animate-slide-up rounded-2xl border border-white/10 bg-card p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="h-6 w-6" strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>

        {children}

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}
