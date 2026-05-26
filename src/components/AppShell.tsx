"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

// Routes that render full-screen with no Sidebar:
// login + all login subpaths (verify, pin, setup-pin)
// tester routes (testers don't have accounts)
const isBareRoute = (path: string) =>
  path === "/login" ||
  path.startsWith("/login/") ||
  path.startsWith("/tester");

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isBareRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        minHeight: "100vh",
      }}
    >
      {/* 
        This wrapper locks the Sidebar to the screen. 
        It stays stuck to the top and is exactly 100vh tall. 
      */}
      <div 
        style={{ 
          position: "sticky", 
          top: 0, 
          height: "100vh", 
          overflowY: "auto" 
        }}
      >
        <Sidebar />
      </div>
      
      {/* Main page content area */}
      <div style={{ minWidth: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}