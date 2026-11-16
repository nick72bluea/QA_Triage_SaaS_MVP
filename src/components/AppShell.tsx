"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";

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

// Below 900px the sidebar becomes a slide-in drawer opened from a top bar.
const SHELL_CSS = `
  .pd-shell { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
  .pd-shell-rail { position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .pd-shell-main { min-width: 0; overflow: hidden; }
  .pd-topbar, .pd-scrim { display: none; }
  @media (max-width: 899px) {
    .pd-shell { grid-template-columns: 1fr; }
    .pd-shell-rail { position: fixed; z-index: 60; left: 0; top: 0; bottom: 0; width: 260px; max-width: 85vw;
      transform: translateX(-100%); transition: transform 0.22s ease; box-shadow: 0 0 40px rgba(0,0,0,0.3); }
    .pd-shell.menu-open .pd-shell-rail { transform: translateX(0); }
    .pd-scrim { display: block; position: fixed; inset: 0; z-index: 55; background: rgba(0,0,0,0.35);
      opacity: 0; pointer-events: none; transition: opacity 0.2s ease; }
    .pd-shell.menu-open .pd-scrim { opacity: 1; pointer-events: auto; }
    .pd-topbar { display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 50;
      height: 52px; padding: 0 16px; background: var(--sidebar-bg, #0f1410); color: var(--sidebar-ink-bright, #f4f3ef); }
    .pd-topbar button { background: none; border: 0; color: inherit; padding: 8px; margin-left: -8px; cursor: pointer; display: grid; place-items: center; }
    .pd-topbar-name { font-family: var(--font-display, 'Fraunces', serif); font-weight: 600; font-size: 16px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Page layouts on phones. Scoped to .pd-shell-main so they outrank each
       page's own desktop grid rules. */
    .pd-shell-main .main { padding: 20px 16px 48px; }
    /* Home */
    .pd-shell-main .qa-hero { padding: 24px 16px 20px; }
    .pd-shell-main .hero-head { flex-direction: column; align-items: flex-start; gap: 16px; }
    .pd-shell-main .hero-title { font-size: 32px; }
    .pd-shell-main .hero-meta { flex-wrap: wrap; }
    .pd-shell-main .hero-meta > div { align-items: flex-start; }
    .pd-shell-main .currently { grid-template-columns: 1fr; }
    .pd-shell-main .list-section { padding: 20px 16px 48px; }
    .pd-shell-main .project-row { grid-template-columns: 1fr; gap: 10px; }
    /* Triage board */
    .pd-shell-main .stats-row { grid-template-columns: 1fr; }
    .pd-shell-main .panel-summary { grid-template-columns: repeat(3, 1fr); padding: 12px 16px; }
    .pd-shell-main .step-row-head { grid-template-columns: 1fr; gap: 8px; padding: 14px 16px; }
    .pd-shell-main .profile-stats { grid-template-columns: repeat(2, 1fr); }
    /* Settings (its .main is a grid; let the column shrink to the screen) */
    .pd-shell-main .main > .content { min-width: 0; padding: 4px 0 96px; }
  }
  @media (max-width: 899px) {
    /* Full-width modals and drawers (rendered inside the main area) */
    .pd-shell-main .ai-modal-body, .pd-shell-main .with-sources { grid-template-columns: 1fr; overflow-y: auto; }
    .pd-shell-main .side-panel { width: 100vw; min-width: 0; }
    .pd-shell-main .save-bar { min-width: 0; width: calc(100vw - 32px); flex-wrap: wrap; }
  }
`;

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
  const { settings } = useWorkspaceSettings();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the phone menu whenever the page changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMenuOpen(false), [pathname]);

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
    <div className={`pd-shell${menuOpen ? " menu-open" : ""}`}>
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />

      {/* Sidebar: fixed rail on desktop, slide-in drawer on phones */}
      <div className="pd-shell-rail">
        <Sidebar />
      </div>
      <div className="pd-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      {/* Main page content area */}
      <div className="pd-shell-main">
        <div className="pd-topbar">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="pd-topbar-name">{settings?.workspaceName || "Proofdeck"}</span>
        </div>
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