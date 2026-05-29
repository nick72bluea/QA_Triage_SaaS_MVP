"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useAuth } from "@/contexts/AuthContext";
import { doc, collection, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Sidebar — persistent left rail. Reads workspaceName + logoUrl from the
// current account's settings so it rebrands automatically.

const NAV_ITEMS = [
  {
    href: "/home",
    label: "Home",
    icon: (
      <>
        <path d="M3 12l9-9 9 9" />
        <path d="M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" />
      </>
    ),
  },
  {
    href: "/admin",
    label: "Project Admin",
    icon: (
      <>
        <path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1" />
        <path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1" />
      </>
    ),
  },
  {
    href: "/pm",
    label: "Triage Board",
    icon: (
      <>
        <line x1="3" y1="12" x2="21" y2="12" />
        <polyline points="7 7 12 2 17 7" />
        <polyline points="7 17 12 22 17 17" />
      </>
    ),
  },
  {
    href: "/scripts",
    label: "Scripts",
    icon: (
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </>
    ),
  },
  {
    href: "/admin/settings",
    label: "Workspace Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>
    ),
  },
];

const SidebarStyles = React.memo(() => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    .sidebar { background: #0f1410; min-height: 100vh; padding: 24px 16px; display: flex; flex-direction: column; gap: 28px; border-right: 1px solid rgba(255,255,255,0.06); position: sticky; top: 0; }
    .sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
    .sidebar-logo { width: 32px; height: 32px; border-radius: 7px; display: grid; place-items: center; color: #fff; flex-shrink: 0; overflow: hidden; }
    .sidebar-logo img { width: 100%; height: 100%; object-fit: cover; }
    .sidebar-brand-name { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; color: #f4f3ef; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .sidebar-nav { display: flex; flex-direction: column; gap: 1px; }
    .sidebar-nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; color: rgba(244,243,239,0.55); text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500; transition: all 0.15s ease; }
    .sidebar-nav-item:hover { background: rgba(255,255,255,0.04); color: #f4f3ef; }
    .sidebar-nav-item.active { background: rgba(255,255,255,0.06); color: #f4f3ef; box-shadow: inset 2px 0 0 var(--brand-primary, #7ab28a); }
    .sidebar-nav-item svg { flex-shrink: 0; opacity: 0.7; }
    .sidebar-nav-item.active svg { opacity: 1; color: var(--brand-primary, #7ab28a); }
    .sidebar-foot { margin-top: auto; padding: 12px 8px; border-top: 1px solid rgba(255,255,255,0.06); font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(244,243,239,0.35); }
    .sidebar-user { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; margin-top: 12px; cursor: pointer; transition: background 0.15s; width: 100%; border: none; background: transparent; text-align: left; }
    .sidebar-user:hover { background: rgba(255,255,255,0.04); }
    .sidebar-user.open { background: rgba(255,255,255,0.06); }
    .sidebar-user-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--brand-primary, #7ab28a); color: #0f1410; display: grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; flex-shrink: 0; overflow: hidden; }
    .sidebar-user-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .sidebar-user-name { font-size: 12px; color: #f4f3ef; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
    .sidebar-user-chevron { color: rgba(244,243,239,0.35); flex-shrink: 0; transition: transform 0.2s; }
    .sidebar-user.open .sidebar-user-chevron { transform: rotate(180deg); }
    .sidebar-popover { position: absolute; bottom: calc(100% + 6px); left: 12px; right: 12px; background: #1a2420; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; box-shadow: 0 -8px 24px rgba(0,0,0,0.4); animation: popoverIn 0.15s cubic-bezier(.2,.6,.2,1); z-index: 100; }
    @keyframes popoverIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .sidebar-popover-item { display: flex; align-items: center; gap: 10px; padding: 11px 14px; font-size: 13px; color: rgba(244,243,239,0.75); cursor: pointer; transition: background 0.12s; border: none; background: transparent; width: 100%; text-align: left; font-family: inherit; }
    .sidebar-popover-item:hover { background: rgba(255,255,255,0.05); color: #f4f3ef; }
    .sidebar-popover-item.danger:hover { background: rgba(166,66,31,0.15); color: #e08060; }
    .sidebar-popover-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 4px 0; }
    .sidebar-popover-label { padding: 8px 14px 4px; font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(244,243,239,0.3); }
    .sidebar-ws-item { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; transition: background 0.12s; border: none; background: transparent; width: 100%; text-align: left; font-family: inherit; }
    .sidebar-ws-item:hover { background: rgba(255,255,255,0.05); }
    .sidebar-ws-item.active { background: rgba(255,255,255,0.04); cursor: default; }
    .sidebar-ws-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.2); flex-shrink: 0; }
    .sidebar-ws-item.active .sidebar-ws-dot { background: var(--brand-primary, #7ab28a); }
    .sidebar-ws-name { font-size: 13px; color: rgba(244,243,239,0.75); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sidebar-ws-item.active .sidebar-ws-name { color: #f4f3ef; font-weight: 500; }
    .sidebar-ws-role { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(244,243,239,0.3); flex-shrink: 0; }
    .sidebar-ws-check { flex-shrink: 0; color: var(--brand-primary, #7ab28a); }
    .sidebar-ws-new { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; transition: background 0.12s; border: none; background: transparent; width: 100%; text-align: left; font-family: inherit; color: rgba(244,243,239,0.45); font-size: 13px; }
    .sidebar-ws-new:hover { background: rgba(255,255,255,0.05); color: rgba(244,243,239,0.75); }
    .sidebar-ws-new:disabled { opacity: 0.4; cursor: not-allowed; }
    .sidebar-ws-new-icon { width: 18px; height: 18px; border-radius: 4px; border: 1px dashed rgba(255,255,255,0.2); display: grid; place-items: center; flex-shrink: 0; }
    .sidebar-new-ws-form { padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
    .sidebar-new-ws-input { height: 32px; padding: 0 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: #f4f3ef; font-family: inherit; font-size: 13px; outline: none; width: 100%; }
    .sidebar-new-ws-input:focus { border-color: var(--brand-primary, #7ab28a); }
    .sidebar-new-ws-input::placeholder { color: rgba(244,243,239,0.3); }
    .sidebar-new-ws-actions { display: flex; gap: 6px; }
    .sidebar-new-ws-btn { flex: 1; height: 30px; border-radius: 5px; font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: transparent; color: rgba(244,243,239,0.6); }
    .sidebar-new-ws-btn.primary { background: var(--brand-primary, #7ab28a); border-color: transparent; color: #0f1410; }
    .sidebar-new-ws-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  `,
    }}
  />
));
SidebarStyles.displayName = "SidebarStyles";

// Determine which nav item should be highlighted for the current path.
// Strategy: find every item whose href matches (exactly or as a parent),
// then pick the longest. Prevents /admin AND /admin/settings both lighting up.
function getActiveHref(pathname: string | null): string | null {
  if (!pathname) return null;
  const matches = NAV_ITEMS.map((item) => item.href).filter(
    (href) => pathname === href || pathname.startsWith(href + "/")
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.length - a.length);
  return matches[0];
}

export function Sidebar() {
  const pathname = usePathname();
  const { settings } = useWorkspaceSettings();
  const { user, profile, signOut, accounts, currentAccountId, switchAccount } = useAuth();

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showNewWsForm, setShowNewWsForm] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);
  const footRef = useRef<HTMLDivElement>(null);
  const newWsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewWsForm) setTimeout(() => newWsInputRef.current?.focus(), 50);
  }, [showNewWsForm]);

  const createWorkspace = async () => {
    if (!user || !newWsName.trim()) return;
    setCreatingWs(true);
    try {
      const accountRef = doc(collection(db, "accounts"));
      const accountId = accountRef.id;
      const name = newWsName.trim();
      await setDoc(accountRef, { name, ownerId: user.uid, createdAt: serverTimestamp() });
      await setDoc(doc(db, "accounts", accountId, "settings", "workspace"), {
        workspaceName: name,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "accountMembers", `${accountId}_${user.uid}`), {
        accountId,
        uid: user.uid,
        email: user.email,
        displayName: profile?.displayName || user.email?.split("@")[0] || "Owner",
        role: "owner",
        joinedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "users", user.uid), { lastAccountId: accountId }, { merge: true });
      // Reload page so AuthContext re-initialises with new memberships
      window.location.href = "/home";
    } catch (err) {
      console.error("Failed to create workspace", err);
      setCreatingWs(false);
    }
  };

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (footRef.current && !footRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  const workspaceName = settings?.workspaceName || "Workspace";
  const logoUrl = settings?.logoUrl;
  const primary = settings?.brandColorPrimary || "#7ab28a";

  const activeHref = getActiveHref(pathname);

  const initials =
    (profile?.displayName || user?.email || "?")
      .split(/\s+|@/)
      .filter(Boolean)
      .map((s) => s[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "?";

  return (
    <aside className="sidebar">
      <SidebarStyles />

      <div className="sidebar-brand">
        <div
          className="sidebar-logo"
          style={{ background: logoUrl ? "transparent" : primary }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt={`${workspaceName} logo`} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          )}
        </div>
        <div className="sidebar-brand-name">{workspaceName}</div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = activeHref === href;
          return (
            <Link
              key={href}
              href={href}
              className={`sidebar-nav-item${active ? " active" : ""}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {icon}
              </svg>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-foot" ref={footRef} style={{ position: "relative" }}>
        {popoverOpen && (
          <div className="sidebar-popover" style={{ "--brand-primary": primary } as React.CSSProperties}>
            {/* Workspaces — always visible */}
            <div className="sidebar-popover-label">Workspaces</div>
            {accounts.map(a => {
              const isActive = a.accountId === currentAccountId;
              return (
                <button
                  key={a.accountId}
                  className={`sidebar-ws-item${isActive ? " active" : ""}`}
                  onClick={async () => {
                    if (!isActive) { await switchAccount(a.accountId); setPopoverOpen(false); window.location.href = "/home"; }
                  }}
                >
                  <div className="sidebar-ws-dot" />
                  <span className="sidebar-ws-name">{a.accountName}</span>
                  <span className="sidebar-ws-role">{a.role}</span>
                  {isActive && (
                    <svg className="sidebar-ws-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}

            {/* New workspace form or button */}
            {showNewWsForm ? (
              <div className="sidebar-new-ws-form">
                <input
                  ref={newWsInputRef}
                  className="sidebar-new-ws-input"
                  placeholder="Workspace name"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createWorkspace(); if (e.key === "Escape") { setShowNewWsForm(false); setNewWsName(""); } }}
                  disabled={creatingWs}
                />
                <div className="sidebar-new-ws-actions">
                  <button className="sidebar-new-ws-btn" onClick={() => { setShowNewWsForm(false); setNewWsName(""); }} disabled={creatingWs}>Cancel</button>
                  <button className="sidebar-new-ws-btn primary" onClick={createWorkspace} disabled={!newWsName.trim() || creatingWs}>
                    {creatingWs ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <button className="sidebar-ws-new" onClick={() => setShowNewWsForm(true)}>
                <div className="sidebar-ws-new-icon">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                New workspace
              </button>
            )}

            <div className="sidebar-popover-divider" />
            <Link href="/admin/settings" style={{ textDecoration: "none" }} onClick={() => setPopoverOpen(false)}>
              <div className="sidebar-popover-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.74 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.74a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                Workspace settings
              </div>
            </Link>
            <div className="sidebar-popover-divider" />
            <button
              className="sidebar-popover-item danger"
              onClick={async () => { setPopoverOpen(false); await signOut(); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </div>
        )}

        <button
          className={`sidebar-user${popoverOpen ? " open" : ""}`}
          onClick={() => setPopoverOpen(v => !v)}
          aria-label="Account menu"
        >
          <div className="sidebar-user-avatar">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="" />
            ) : (
              initials
            )}
          </div>
          <div className="sidebar-user-name">
            {profile?.displayName || user?.email || "Account"}
          </div>
          <svg className="sidebar-user-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
    </aside>
  );
}