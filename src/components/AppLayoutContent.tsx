"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";

export function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Define routes that should be completely "Naked" (No Sidebar/Menu)
  const isFrictionless = pathname.startsWith('/tester') || pathname.startsWith('/mobile-upload');

  if (isFrictionless) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}