import { MessageCircle } from "lucide-react";

/**
 * Shared shell for /login, /signup, /forgot-password, /reset-password:
 * deep teal full-screen backdrop, centered white card with a chat
 * icon — matches the reference "Welcome Back" / "Create Account"
 * screens pixel-for-pixel in spirit.
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
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <MessageCircle className="mb-2 h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>

        {children}

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}
