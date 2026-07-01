import type { Metadata } from "next";

import { AuthProvider } from "@/context/auth-context";

import "./globals.css";

export const metadata: Metadata = {
  title: "Limbu WA SaaS",
  description: "WhatsApp Business automation platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
