import { MessageCircle } from "lucide-react";

/**
 * Shared shell for /login, /signup, /forgot-password, /reset-password:
 * deep teal full-screen backdrop, centered white card.
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
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: "hsl(var(--teal-deep))" }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <MessageCircle className="mb-2 h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>

        {children}

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}