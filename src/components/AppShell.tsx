"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/contexts/AuthContext";

// Routes that render full-screen with no Sidebar:
// login + all login subpaths (verify, pin, setup-pin)
// tester routes (testers don't have accounts)
const isBareRoute = (path: string) =>
  path === "/login" ||
  path.startsWith("/login/") ||
  path.startsWith("/tester");

// Pages that exist only to create or change things — viewers can't use them.
const isEditOnlyRoute = (path: string) =>
  path === "/admin" || (path.startsWith("/scripts/") && path.length > "/scripts/".length);

const bannerStyle: React.CSSProperties = {
  padding: "8px 24px",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  letterSpacing: "0.04em",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentRole, canEdit, isSuperUser, accounts, currentAccountId } = useAuth();

  if (isBareRoute(pathname)) {
    return <>{children}</>;
  }

  const isViewer = currentRole === "viewer" && !canEdit;
  const superUserVisiting =
    isSuperUser && !!currentAccountId && !accounts.some((a) => a.accountId === currentAccountId);

  let content = children;
  if (isViewer && isEditOnlyRoute(pathname)) {
    content = (
      <div style={{ padding: "64px 32px", maxWidth: 520 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, margin: "0 0 12px" }}>View-only access</h1>
        <p style={{ color: "#55524d", lineHeight: 1.6, margin: "0 0 20px" }}>
          You&apos;re a viewer in this workspace, so you can&apos;t create or edit projects and scripts.
          Ask a workspace admin if you need more access.
        </p>
        <Link href="/pm" style={{ color: "#2d4a3e", fontWeight: 500 }}>Go to the triage board →</Link>
      </div>
    );
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
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        {superUserVisiting && (
          <div style={{ ...bannerStyle, background: "#efe7ff", color: "#4b2ca8" }}>
            SUPER-USER VIEW · You&apos;re looking inside a workspace you aren&apos;t a member of.
          </div>
        )}
        {isViewer && (
          <div style={{ ...bannerStyle, background: "#efece4", color: "#55524d" }}>
            VIEW-ONLY ACCESS · You can look around but not make changes.
          </div>
        )}
        {content}
      </div>
    </div>
  );
}