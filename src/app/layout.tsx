import type { Metadata } from "next";
import { Inter } from "next/font/google";
import ThemeProvider from "@/components/ThemeRegistry/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/components/BrandingProvider";
import { AppLayoutContent } from "@/components/AppLayoutContent"; // We will create this below

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "QA Triage SaaS",
  description: "Enterprise UAT and Bug Triage Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <BrandingProvider>
              {/* Use a client wrapper to check the pathname and hide the shell */}
              <AppLayoutContent>{children}</AppLayoutContent>
            </BrandingProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}