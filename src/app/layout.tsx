import type { Metadata } from "next";
import "./base.css";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/components/BrandingProvider";
import { AppLayoutContent } from "@/components/AppLayoutContent";

export const metadata: Metadata = {
  title: "Proofdeck",
  description: "Run UAT cycles, collect tester evidence, and triage results into Jira.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          <BrandingProvider>
            {/* Client wrapper: hides the sidebar on login and tester pages */}
            <AppLayoutContent>{children}</AppLayoutContent>
          </BrandingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}