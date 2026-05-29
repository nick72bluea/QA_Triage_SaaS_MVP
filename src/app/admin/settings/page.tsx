"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { PageHead } from "@/components/PageHead";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import {
  WorkspaceSettings,
  ThemeMode,
  BRAND_COLOR_PRESETS_PRIMARY,
  BRAND_COLOR_PRESETS_SECONDARY,
} from "@/types/workspace";
import { uploadLogo } from "@/lib/uploadLogo";
import {
  collection, query, where, getDocs, setDoc, deleteDoc,
  doc as fsDoc, writeBatch, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface MemberDoc {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  joinedAt: any;
}

interface InviteDoc {
  token: string;
  accountId: string;
  accountName: string;
  createdBy: string;
  expiresAt: number;
  role: string;
}

const GlobalSettingsStyles = React.memo(() => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

    .app-container * { box-sizing: border-box; }
    .app-container { min-height: 100vh; background: var(--bg, #f4f3ef); font-family: 'IBM Plex Sans', system-ui, sans-serif; color: var(--ink, #1a1a1a); font-size: 14px; -webkit-font-smoothing: antialiased; }
    .main { display: grid; grid-template-columns: 220px 1fr; max-width: 1280px; width: 100%; }
    .section-nav { padding: 40px 16px 40px 24px; position: sticky; top: 0; height: 100vh; overflow-y: auto; border-right: 1px solid var(--line, #e5e2db); }
    .section-nav-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute, #8a867f); margin-bottom: 12px; font-weight: 500; padding: 0 8px; }
    .section-nav-list { display: flex; flex-direction: column; gap: 1px; }
    .section-nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; color: var(--ink-soft, #55524d); text-decoration: none; border-radius: 5px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; }
    .section-nav-item:hover { background: var(--surface, #ffffff); color: var(--ink, #1a1a1a); }
    .section-nav-item.active { background: var(--surface, #ffffff); color: var(--accent, #2d4a3e); box-shadow: inset 2px 0 0 var(--accent, #2d4a3e); padding-left: 12px; }
    .content { padding: 40px 48px 140px; max-width: 880px; width: 100%; }
    .section { margin-bottom: 48px; scroll-margin-top: 24px; }
    .section-head { margin-bottom: 20px; }
    .section-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 6px; }
    .section-description { color: var(--ink-mute, #8a867f); font-size: 13px; margin: 0; line-height: 1.5; }
    .section-card { background: var(--surface, #ffffff); border: 1px solid var(--line, #e5e2db); border-radius: 10px; overflow: hidden; }
    .field-row { display: grid; grid-template-columns: 260px 1fr; gap: 32px; padding: 20px 24px; border-bottom: 1px solid var(--line, #e5e2db); align-items: flex-start; }
    .field-row:last-child { border-bottom: none; }
    .field-label-name { font-size: 13px; font-weight: 500; color: var(--ink, #1a1a1a); margin-bottom: 4px; }
    .field-label-desc { font-size: 12px; color: var(--ink-mute, #8a867f); line-height: 1.5; }
    .field-input { display: flex; flex-direction: column; gap: 8px; }
    .input { width: 100%; height: 38px; padding: 0 12px; font-family: inherit; font-size: 13px; color: var(--ink, #1a1a1a); background: var(--surface, #ffffff); border: 1px solid var(--line-strong, #d4d0c7); border-radius: 6px; transition: all 0.15s ease; }
    .input:hover { border-color: #b8b3a8; }
    .input:focus { outline: none; border-color: var(--accent, #2d4a3e); box-shadow: 0 0 0 3px var(--accent-soft, rgba(45,74,62,0.12)); }
    .select { appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2355524d' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; cursor: pointer; }

    .brand-grid { display: grid; grid-template-columns: 1fr 320px; gap: 28px; padding: 24px; }
    @media (max-width: 880px) { .brand-grid { grid-template-columns: 1fr; } }
    .brand-controls { display: flex; flex-direction: column; gap: 24px; }
    .brand-block-label { font-size: 12px; font-weight: 600; color: var(--ink, #1a1a1a); margin-bottom: 4px; }
    .brand-block-desc { font-size: 12px; color: var(--ink-mute, #8a867f); margin-bottom: 12px; line-height: 1.5; }

    .logo-upload-zone { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1.5px dashed var(--line-strong, #d4d0c7); border-radius: 10px; background: var(--surface-alt, #fafaf7); cursor: pointer; transition: all 0.15s ease; }
    .logo-upload-zone:hover { border-color: var(--accent, #2d4a3e); background: var(--accent-soft, rgba(45,74,62,0.04)); }
    .logo-current { width: 64px; height: 64px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; overflow: hidden; }
    .logo-current.empty { color: #fff; }
    .logo-current img { width: 100%; height: 100%; object-fit: cover; }
    .logo-upload-text { flex: 1; min-width: 0; }
    .logo-upload-main { font-size: 13px; font-weight: 500; color: var(--ink, #1a1a1a); margin-bottom: 2px; }
    .logo-upload-sub { font-size: 11px; color: var(--ink-mute, #8a867f); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.04em; }
    .logo-upload-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .logo-action-btn { padding: 6px 10px; background: var(--surface, #ffffff); border: 1px solid var(--line, #e5e2db); border-radius: 6px; font-family: inherit; font-size: 11px; color: var(--ink-soft, #55524d); cursor: pointer; transition: all 0.15s; }
    .logo-action-btn:hover { background: var(--surface-alt, #fafaf7); color: var(--ink, #1a1a1a); }
    .logo-action-btn.danger:hover { color: #a6421f; border-color: rgba(166,66,31,0.3); }

    .colour-row { display: flex; align-items: center; gap: 12px; }
    .colour-swatch-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; flex: 1; }
    .colour-swatch { aspect-ratio: 1; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s ease; }
    .colour-swatch.selected { border-color: var(--ink, #1a1a1a); box-shadow: 0 0 0 2px var(--surface, #ffffff), 0 0 0 4px var(--ink, #1a1a1a); }
    .colour-swatch:hover:not(.selected) { transform: translateY(-2px); }
    .colour-hex-input { width: 110px; height: 36px; padding: 0 10px; font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink, #1a1a1a); background: var(--surface, #ffffff); border: 1px solid var(--line-strong, #d4d0c7); border-radius: 6px; }
    .colour-hex-input:focus { outline: none; border-color: var(--accent, #2d4a3e); box-shadow: 0 0 0 3px var(--accent-soft, rgba(45,74,62,0.12)); }

    .theme-selector { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .theme-option { padding: 12px 14px; background: var(--surface, #ffffff); border: 1px solid var(--line, #e5e2db); border-radius: 8px; cursor: pointer; transition: all 0.15s; text-align: center; }
    .theme-option:hover { border-color: #b8b3a8; }
    .theme-option.selected { border-color: var(--accent, #2d4a3e); background: var(--accent-soft, rgba(45,74,62,0.04)); }
    .theme-option-swatch { width: 100%; height: 36px; border-radius: 6px; margin-bottom: 8px; border: 1px solid var(--line, #e5e2db); }
    .theme-option-swatch.light { background: linear-gradient(135deg, #f4f3ef 50%, #ffffff 50%); }
    .theme-option-swatch.dark { background: linear-gradient(135deg, #0f1410 50%, #171d18 50%); }
    .theme-option-swatch.auto { background: linear-gradient(135deg, #0f1410 50%, #f4f3ef 50%); }
    .theme-option-label { font-size: 12px; font-weight: 500; color: var(--ink, #1a1a1a); }
    .theme-option-desc { font-size: 10px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-mute, #8a867f); margin-top: 2px; }

    .brand-preview-card { background: var(--surface-alt, #fafaf7); border: 1px solid var(--line, #e5e2db); border-radius: 10px; padding: 20px; position: sticky; top: 24px; }
    .brand-preview-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-mute, #8a867f); margin-bottom: 14px; font-weight: 500; }
    .brand-preview-window { background: #fff; border: 1px solid var(--line, #e5e2db); border-radius: 8px; overflow: hidden; transition: all 0.3s; }
    .brand-preview-window.dark { background: #0f1410; }
    .brand-preview-titlebar { padding: 8px 12px; background: var(--surface-alt, #fafaf7); border-bottom: 1px solid var(--line, #e5e2db); display: flex; gap: 6px; }
    .brand-preview-window.dark .brand-preview-titlebar { background: #171d18; border-color: rgba(255,255,255,0.08); }
    .brand-preview-dot { width: 9px; height: 9px; border-radius: 50%; background: rgba(0,0,0,0.15); }
    .brand-preview-window.dark .brand-preview-dot { background: rgba(255,255,255,0.15); }
    .brand-preview-body { padding: 18px; }
    .brand-preview-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .brand-preview-logo { width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; color: #fff; flex-shrink: 0; overflow: hidden; }
    .brand-preview-logo img { width: 100%; height: 100%; object-fit: cover; }
    .brand-preview-name { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 600; }
    .brand-preview-pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
    .brand-preview-button { display: inline-block; padding: 8px 14px; border-radius: 6px; color: #fff; font-size: 12px; font-weight: 500; margin-top: 8px; }

    .save-bar { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(calc(100% + 40px)); background: #1a1a1a; border-radius: 10px; padding: 10px 14px 10px 18px; display: flex; align-items: center; gap: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); transition: transform 0.35s cubic-bezier(.2,.6,.2,1); z-index: 30; min-width: 400px; }
    .save-bar.show { transform: translateX(-50%) translateY(0); }
    .save-bar-status { display: flex; flex-direction: column; color: #fff; min-width: 0; flex: 1; }
    .save-bar-title { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
    .save-bar-changes { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.08em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .btn-discard { height: 36px; background: transparent; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.15); padding: 0 14px; border-radius: 6px; font-family: inherit; font-size: 13px; cursor: pointer; }
    .btn-save { height: 36px; background: var(--accent, #2d4a3e); color: #fff; border: none; padding: 0 16px; border-radius: 6px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
    .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

    .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px); background: #4a7c59; color: #fff; padding: 10px 16px; border-radius: 6px; font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); transition: transform 0.3s; z-index: 100; }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.error { background: #a6421f; }

    .loading-shimmer { background: linear-gradient(90deg, var(--line, #e5e2db) 0%, var(--line-strong, #d4d0c7) 50%, var(--line, #e5e2db) 100%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; border-radius: 4px; height: 38px; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    @media (max-width: 1100px) { .main { grid-template-columns: 1fr; } .section-nav { display: none; } .content { padding: 32px 24px 120px; } .field-row { grid-template-columns: 1fr; gap: 12px; } .brand-preview-card { position: static; } }

    /* MEMBERS */
    .invite-box { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: var(--surface-alt, #fafaf7); border: 1px solid var(--line, #e5e2db); border-radius: 8px; }
    .invite-url { flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-soft, #55524d); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .invite-expiry { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute, #8a867f); white-space: nowrap; flex-shrink: 0; }
    .btn-sm { height: 32px; padding: 0 12px; font-family: inherit; font-size: 12px; font-weight: 500; border-radius: 6px; cursor: pointer; border: 1px solid var(--line-strong, #d4d0c7); background: var(--surface, #ffffff); color: var(--ink-soft, #55524d); transition: all 0.15s; white-space: nowrap; flex-shrink: 0; }
    .btn-sm:hover { background: var(--surface-alt, #fafaf7); color: var(--ink, #1a1a1a); }
    .btn-sm.primary { background: var(--accent, #2d4a3e); color: #fff; border-color: transparent; }
    .btn-sm.primary:hover { background: #1d3329; }
    .btn-sm.danger { color: #a6421f; border-color: rgba(166,66,31,0.3); }
    .btn-sm.danger:hover { background: #f7e8e2; }
    .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
    .member-list { display: flex; flex-direction: column; }
    .member-row { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--line, #e5e2db); }
    .member-row:last-child { border-bottom: none; }
    .member-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent, #2d4a3e); color: #fff; display: grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .member-info { flex: 1; min-width: 0; }
    .member-name { font-size: 13px; font-weight: 500; color: var(--ink, #1a1a1a); }
    .member-email { font-size: 12px; color: var(--ink-mute, #8a867f); font-family: 'JetBrains Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .role-badge { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 8px; border-radius: 4px; background: var(--surface-alt, #fafaf7); border: 1px solid var(--line, #e5e2db); color: var(--ink-soft, #55524d); flex-shrink: 0; }
    .role-badge.owner { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
    .role-badge.admin { background: var(--accent-soft, #e8f0eb); border-color: rgba(45,74,62,0.2); color: var(--accent, #2d4a3e); }
    .member-actions { display: flex; gap: 6px; flex-shrink: 0; }

    /* DANGER ZONE */
    .danger-card { border: 1px solid rgba(166,66,31,0.25); border-radius: 10px; overflow: hidden; }
    .danger-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 24px; border-bottom: 1px solid rgba(166,66,31,0.1); }
    .danger-row:last-child { border-bottom: none; }
    .danger-label { font-size: 13px; font-weight: 500; color: var(--ink, #1a1a1a); margin-bottom: 4px; }
    .danger-desc { font-size: 12px; color: var(--ink-mute, #8a867f); line-height: 1.5; }
    .btn-danger { height: 36px; padding: 0 16px; font-family: inherit; font-size: 13px; font-weight: 500; border-radius: 6px; cursor: pointer; border: 1px solid rgba(166,66,31,0.4); background: transparent; color: #a6421f; transition: all 0.15s; white-space: nowrap; flex-shrink: 0; }
    .btn-danger:hover { background: #f7e8e2; border-color: #a6421f; }
    .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
    .confirm-input-wrap { margin-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .confirm-input { height: 36px; padding: 0 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; border: 1px solid rgba(166,66,31,0.4); border-radius: 6px; background: #fff; color: var(--ink, #1a1a1a); width: 240px; }
    .confirm-input:focus { outline: none; border-color: #a6421f; box-shadow: 0 0 0 3px rgba(166,66,31,0.1); }
  `,
    }}
  />
));
GlobalSettingsStyles.displayName = "GlobalSettingsStyles";

export default function WorkspaceSettingsPage() {
  const { settings, loading, save, accountId } = useWorkspaceSettings();
  const { user, currentAccountId, currentRole, profile, fullSignOut } = useAuth();

  const [formData, setFormData] = useState<WorkspaceSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("identity");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "error" } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Members state
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [invite, setInvite] = useState<InviteDoc | null>(null);
  const [inviteGenerating, setInviteGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  // Danger zone state
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  useEffect(() => setHydrated(true), []);

  // Load members + active invite
  useEffect(() => {
    if (!currentAccountId) return;
    setMembersLoading(true);
    const load = async () => {
      try {
        const q = query(collection(db, "accountMembers"), where("accountId", "==", currentAccountId));
        const snap = await getDocs(q);
        setMembers(snap.docs.map((d) => d.data() as MemberDoc));

        const invQ = query(
          collection(db, "invites"),
          where("accountId", "==", currentAccountId)
        );
        const invSnap = await getDocs(invQ);
        const now = Date.now();
        const valid = invSnap.docs
          .map((d) => d.data() as InviteDoc)
          .filter((inv) => inv.expiresAt > now);
        setInvite(valid.length > 0 ? valid[0] : null);
      } catch (err) {
        console.error("Failed to load members", err);
      } finally {
        setMembersLoading(false);
      }
    };
    load();
  }, [currentAccountId]);

  useEffect(() => {
    if (!settings) return;
    setFormData((prev) => {
      if (!prev) return settings;
      const isDirty = JSON.stringify(prev) !== JSON.stringify(settings);
      return isDirty ? prev : settings;
    });
  }, [settings]);

  // ─── INVITE HELPERS ──────────────────────────────────────────────────────

  const generateInvite = async () => {
    if (!currentAccountId || !user) return;
    setInviteGenerating(true);
    try {
      // Revoke any existing invites first
      const invQ = query(collection(db, "invites"), where("accountId", "==", currentAccountId));
      const existing = await getDocs(invQ);
      for (const d of existing.docs) await deleteDoc(d.ref);

      const token = crypto.randomUUID();
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const inviteData: InviteDoc = {
        token,
        accountId: currentAccountId,
        accountName: settings?.workspaceName || "Workspace",
        createdBy: user.uid,
        expiresAt,
        role: "member",
      };
      await setDoc(fsDoc(db, "invites", token), inviteData);
      setInvite(inviteData);
    } catch (err) {
      console.error(err);
      showToast("Failed to generate invite", "error");
    } finally {
      setInviteGenerating(false);
    }
  };

  const revokeInvite = async () => {
    if (!invite) return;
    try {
      await deleteDoc(fsDoc(db, "invites", invite.token));
      setInvite(null);
    } catch {
      showToast("Failed to revoke invite", "error");
    }
  };

  const copyInviteLink = async () => {
    if (!invite) return;
    const url = `${window.location.origin}/join/${invite.token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const removeMember = async (uid: string) => {
    if (!currentAccountId) return;
    setRemovingUid(uid);
    try {
      await deleteDoc(fsDoc(db, "accountMembers", `${currentAccountId}_${uid}`));
      setMembers((prev) => prev.filter((m) => m.uid !== uid));
      showToast("Member removed");
    } catch {
      showToast("Failed to remove member", "error");
    } finally {
      setRemovingUid(null);
    }
  };

  const deleteWorkspace = async () => {
    if (!currentAccountId || !user) return;
    setDeletingWorkspace(true);
    try {
      const batch = writeBatch(db);
      // Remove all members
      const membersQ = query(collection(db, "accountMembers"), where("accountId", "==", currentAccountId));
      const membersSnap = await getDocs(membersQ);
      membersSnap.docs.forEach((d) => batch.delete(d.ref));
      // Remove invites
      const invitesQ = query(collection(db, "invites"), where("accountId", "==", currentAccountId));
      const invitesSnap = await getDocs(invitesQ);
      invitesSnap.docs.forEach((d) => batch.delete(d.ref));
      // Delete account doc
      batch.delete(fsDoc(db, "accounts", currentAccountId));
      // Clear lastAccountId on user
      batch.update(fsDoc(db, "users", user.uid), { lastAccountId: null });
      await batch.commit();
      await fullSignOut();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete workspace", "error");
      setDeletingWorkspace(false);
    }
  };

  const showToast = (msg: string, type: "ok" | "error" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const changedSections = useMemo<string[]>(() => {
    if (!formData || !settings) return [];
    const out: string[] = [];
    if (
      formData.workspaceName !== settings.workspaceName ||
      formData.timezone !== settings.timezone ||
      formData.supportEmail !== settings.supportEmail
    )
      out.push("Workspace identity");
    if (
      formData.brandColorPrimary !== settings.brandColorPrimary ||
      formData.brandColorSecondary !== settings.brandColorSecondary ||
      formData.theme !== settings.theme
    )
      out.push("Branding");
    if (
      formData.aiProvider !== settings.aiProvider ||
      formData.aiToken !== settings.aiToken ||
      formData.maxSpend !== settings.maxSpend
    )
      out.push("AI Configuration");
    if (
      formData.jiraUrl !== settings.jiraUrl ||
      formData.jiraEmail !== settings.jiraEmail ||
      formData.jiraToken !== settings.jiraToken
    )
      out.push("Integrations");
    return out;
  }, [formData, settings]);

  const isDirty = changedSections.length > 0;

  const handleSave = async () => {
    if (!formData || !isDirty || isSaving) return;
    setIsSaving(true);
    try {
      await save(formData);
      showToast("Settings saved");
    } catch (err) {
      console.error(err);
      showToast("Save failed", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (settings) setFormData(settings);
  };

  const handleToggleSave = async (
    field: keyof WorkspaceSettings,
    value: boolean
  ) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
    try {
      await save({ [field]: value } as Partial<WorkspaceSettings>);
    } catch {
      setFormData((prev) => (prev ? { ...prev, [field]: !value } : prev));
    }
  };

  const handleLogoFile = async (file: File) => {
    if (!accountId) return;
    setLogoUploading(true);
    try {
      const { url } = await uploadLogo({ accountId, file });
      await save({ logoUrl: url });
      setFormData((prev) => (prev ? { ...prev, logoUrl: url } : prev));
      showToast("Logo updated");
    } catch (err: any) {
      showToast(err.message || "Upload failed", "error");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    try {
      await save({ logoUrl: null });
      setFormData((prev) => (prev ? { ...prev, logoUrl: null } : prev));
      showToast("Logo removed");
    } catch {
      showToast("Couldn't remove logo", "error");
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !isSaving) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isSaving, formData]);

  useEffect(() => {
    if (!hydrated) return;
    const sections = ["identity", "branding", "integrations", "ai", "notifications", "members", "danger"];
    const handleScroll = () => {
      const scrollPos = window.scrollY + 140;
      let current = sections[0];
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= scrollPos) current = id;
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hydrated]);

  const scrollToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const set = (field: keyof WorkspaceSettings, value: any) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  if (loading || !formData) {
    return (
      <div className="app-container" suppressHydrationWarning>
        <GlobalSettingsStyles />
        <main className="main">
          <div className="content">
            <div className="loading-shimmer" style={{ height: 32, width: 200, marginBottom: 24 }} />
            <div className="loading-shimmer" style={{ marginBottom: 16 }} />
            <div className="loading-shimmer" style={{ marginBottom: 16 }} />
            <div className="loading-shimmer" />
          </div>
        </main>
      </div>
    );
  }

  const previewPrimary = formData.brandColorPrimary;
  const previewSecondary = formData.brandColorSecondary;
  const previewIsDark = formData.theme === "dark";

  return (
    <div className="app-container" suppressHydrationWarning>
      <GlobalSettingsStyles />

      <main className="main">
        <aside className="section-nav">
          <div className="section-nav-label">On this page</div>
          <nav className="section-nav-list">
            {[
              { id: "identity", label: "Workspace identity" },
              { id: "branding", label: "Branding" },
              { id: "integrations", label: "Integrations" },
              { id: "ai", label: "AI Configuration" },
              { id: "notifications", label: "Notifications" },
              { id: "members", label: "Members" },
              { id: "danger", label: "Danger zone" },
            ].map(({ id, label }) => (
              <a key={id} className={`section-nav-item${activeSection === id ? " active" : ""}`} onClick={(e) => scrollToSection(e, id)}>
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="content">
          <PageHead
            eyebrow={["Workspace", "Settings"]}
            title={<>Workspace <em>settings</em></>}
            sub="Configure how your workspace looks and behaves — branding, integrations, AI, and team."
          />

          {/* WORKSPACE IDENTITY */}
          <section className="section" id="identity">
            <div className="section-head">
              <h2 className="section-title">Workspace identity</h2>
              <p className="section-description">Basic info shown to your team and to testers.</p>
            </div>
            <div className="section-card">
              <div className="field-row">
                <div>
                  <div className="field-label-name">Workspace name</div>
                  <div className="field-label-desc">Shown in the sidebar, browser tab, and tester emails.</div>
                </div>
                <div className="field-input">
                  <input className="input" type="text" value={formData.workspaceName} onChange={(e) => set("workspaceName", e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div>
                  <div className="field-label-name">Default timezone</div>
                  <div className="field-label-desc">Used for scheduling and timestamps in reports.</div>
                </div>
                <div className="field-input">
                  <select className="input select" value={formData.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    <option>Europe/London (GMT+0)</option>
                    <option>America/New_York (GMT-5)</option>
                    <option>America/Los_Angeles (GMT-8)</option>
                    <option>Asia/Singapore (GMT+8)</option>
                    <option>Australia/Sydney (GMT+11)</option>
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div>
                  <div className="field-label-name">Support email</div>
                  <div className="field-label-desc">Testers see this in invitations.</div>
                </div>
                <div className="field-input">
                  <input className="input" type="email" value={formData.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} placeholder="hello@yourcompany.com" />
                </div>
              </div>
            </div>
          </section>

          {/* BRANDING */}
          <section className="section" id="branding">
            <div className="section-head">
              <h2 className="section-title">Branding</h2>
              <p className="section-description">Make the app yours. Logo and colours apply everywhere — including the tester experience.</p>
            </div>
            <div className="section-card">
              <div className="brand-grid">
                <div className="brand-controls">

                  {/* LOGO */}
                  <div>
                    <div className="brand-block-label">Logo</div>
                    <div className="brand-block-desc">PNG, JPG, SVG, or WebP. Up to 2MB. Resized to 256×256.</div>
                    <div className="logo-upload-zone" onClick={() => fileInputRef.current?.click()}>
                      <div className={`logo-current${formData.logoUrl ? "" : " empty"}`} style={formData.logoUrl ? {} : { background: previewPrimary }}>
                        {formData.logoUrl ? (
                          <img src={formData.logoUrl} alt="Workspace logo" />
                        ) : (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                          </svg>
                        )}
                      </div>
                      <div className="logo-upload-text">
                        <div className="logo-upload-main">{logoUploading ? "Uploading…" : formData.logoUrl ? "Replace logo" : "Drop or click to upload"}</div>
                        <div className="logo-upload-sub">{formData.logoUrl ? "PNG · JPG · SVG · WebP" : "Saves instantly"}</div>
                      </div>
                      {formData.logoUrl && (
                        <div className="logo-upload-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="logo-action-btn danger" onClick={handleLogoRemove} disabled={logoUploading}>Remove</button>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ""; }} />
                    </div>
                  </div>

                  {/* PRIMARY COLOUR */}
                  <div>
                    <div className="brand-block-label">Primary colour</div>
                    <div className="brand-block-desc">Buttons, links, accents. Pick a swatch or enter a hex.</div>
                    <div className="colour-row">
                      <div className="colour-swatch-grid">
                        {BRAND_COLOR_PRESETS_PRIMARY.map((c) => (
                          <div key={c} className={`colour-swatch${formData.brandColorPrimary === c ? " selected" : ""}`} style={{ background: c }} onClick={() => set("brandColorPrimary", c)} />
                        ))}
                      </div>
                      <input className="colour-hex-input" type="text" value={formData.brandColorPrimary} onChange={(e) => set("brandColorPrimary", e.target.value)} placeholder="#000000" />
                    </div>
                  </div>

                  {/* SECONDARY COLOUR */}
                  <div>
                    <div className="brand-block-label">Secondary colour</div>
                    <div className="brand-block-desc">Highlights, badges, and secondary CTAs.</div>
                    <div className="colour-row">
                      <div className="colour-swatch-grid">
                        {BRAND_COLOR_PRESETS_SECONDARY.map((c) => (
                          <div key={c} className={`colour-swatch${formData.brandColorSecondary === c ? " selected" : ""}`} style={{ background: c }} onClick={() => set("brandColorSecondary", c)} />
                        ))}
                      </div>
                      <input className="colour-hex-input" type="text" value={formData.brandColorSecondary} onChange={(e) => set("brandColorSecondary", e.target.value)} placeholder="#000000" />
                    </div>
                  </div>

                  {/* THEME */}
                  <div>
                    <div className="brand-block-label">Theme</div>
                    <div className="brand-block-desc">Choose how the app looks. Auto follows the operating system.</div>
                    <div className="theme-selector">
                      {([
                        { id: "light", label: "Light", desc: "Cream" },
                        { id: "dark", label: "Dark", desc: "Forest" },
                        { id: "auto", label: "Auto", desc: "Follow OS" },
                      ] as { id: ThemeMode; label: string; desc: string }[]).map((t) => (
                        <div key={t.id} className={`theme-option${formData.theme === t.id ? " selected" : ""}`} onClick={() => set("theme", t.id)}>
                          <div className={`theme-option-swatch ${t.id}`} />
                          <div className="theme-option-label">{t.label}</div>
                          <div className="theme-option-desc">{t.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* PREVIEW */}
                <div className="brand-preview-card">
                  <div className="brand-preview-label">Live preview</div>
                  <div className={`brand-preview-window${previewIsDark ? " dark" : ""}`}>
                    <div className="brand-preview-titlebar">
                      <span className="brand-preview-dot" /><span className="brand-preview-dot" /><span className="brand-preview-dot" />
                    </div>
                    <div className="brand-preview-body">
                      <div className="brand-preview-row">
                        <div className="brand-preview-logo" style={{ background: formData.logoUrl ? "transparent" : previewPrimary }}>
                          {formData.logoUrl ? (
                            <img src={formData.logoUrl} alt="" />
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                            </svg>
                          )}
                        </div>
                        <div className="brand-preview-name" style={{ color: previewIsDark ? "#f4f3ef" : "#1a1a1a" }}>
                          {formData.workspaceName || "Workspace"}
                        </div>
                      </div>
                      <span className="brand-preview-pill" style={{ background: hexToRgba(previewSecondary, 0.15), color: previewSecondary }}>Beta</span>
                      <p style={{ fontSize: 12, margin: "12px 0 4px", color: previewIsDark ? "#c4c0b4" : "#55524d", lineHeight: 1.5 }}>
                        Welcome back. You have 3 test runs in flight.
                      </p>
                      <div className="brand-preview-button" style={{ background: previewPrimary }}>Start a new run →</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* INTEGRATIONS */}
          <section className="section" id="integrations">
            <div className="section-head">
              <h2 className="section-title">Integrations</h2>
              <p className="section-description">Jira, Slack, and Figma connections.</p>
            </div>
            <div className="section-card">
              <div className="field-row">
                <div>
                  <div className="field-label-name">Jira workspace URL</div>
                  <div className="field-label-desc">Your Atlassian subdomain.</div>
                </div>
                <div className="field-input">
                  <input className="input" type="text" value={formData.jiraUrl} onChange={(e) => set("jiraUrl", e.target.value)} placeholder="yourcompany.atlassian.net" />
                </div>
              </div>
              <div className="field-row">
                <div><div className="field-label-name">Service account email</div></div>
                <div className="field-input">
                  <input className="input" type="email" value={formData.jiraEmail} onChange={(e) => set("jiraEmail", e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div>
                  <div className="field-label-name">API token</div>
                  <div className="field-label-desc">Encrypted at rest.</div>
                </div>
                <div className="field-input">
                  <input className="input" type="password" value={formData.jiraToken} onChange={(e) => set("jiraToken", e.target.value)} placeholder="••••••••••••" />
                </div>
              </div>
            </div>
          </section>

          {/* AI */}
          <section className="section" id="ai">
            <div className="section-head">
              <h2 className="section-title">AI Configuration</h2>
              <p className="section-description">Model used for ticket drafting and step generation.</p>
            </div>
            <div className="section-card">
              <div className="field-row">
                <div><div className="field-label-name">Provider</div></div>
                <div className="field-input">
                  <select className="input select" value={formData.aiProvider} onChange={(e) => set("aiProvider", e.target.value)}>
                    <option>Anthropic · Claude Sonnet 4.5</option>
                    <option>Anthropic · Claude Haiku 4.5</option>
                    <option>OpenAI · GPT-4o</option>
                    <option>Google · Gemini 1.5 Pro</option>
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div><div className="field-label-name">API key</div></div>
                <div className="field-input">
                  <input className="input" type="password" value={formData.aiToken} onChange={(e) => set("aiToken", e.target.value)} placeholder="sk-ant-•••••••" />
                </div>
              </div>
              <div className="field-row">
                <div><div className="field-label-name">Monthly budget (USD)</div></div>
                <div className="field-input">
                  <input className="input" type="number" min="0" value={formData.maxSpend} onChange={(e) => set("maxSpend", e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          {/* MEMBERS */}
          <section className="section" id="members">
            <div className="section-head">
              <h2 className="section-title">Members</h2>
              <p className="section-description">Invite people to your workspace. Everyone joins as a member — owners can promote them later.</p>
            </div>
            <div className="section-card">
              {/* Invite link box */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line, #e5e2db)" }}>
                <div className="field-label-name" style={{ marginBottom: 8 }}>Invite link</div>
                <div className="field-label-desc" style={{ marginBottom: 12 }}>Share this link. Anyone with it joins as a member. Links expire after 7 days.</div>
                {invite ? (
                  <div className="invite-box">
                    <span className="invite-url">{typeof window !== "undefined" ? `${window.location.origin}/join/${invite.token}` : `/join/${invite.token}`}</span>
                    <span className="invite-expiry">Expires {new Date(invite.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    <button className="btn-sm" onClick={copyInviteLink}>{copied ? "Copied!" : "Copy"}</button>
                    <button className="btn-sm danger" onClick={revokeInvite}>Revoke</button>
                  </div>
                ) : (
                  <button className="btn-sm primary" onClick={generateInvite} disabled={inviteGenerating}>
                    {inviteGenerating ? "Generating…" : "Generate invite link"}
                  </button>
                )}
              </div>

              {/* Member list */}
              <div className="member-list">
                {membersLoading ? (
                  <div style={{ padding: "20px 24px", color: "var(--ink-mute, #8a867f)", fontSize: 13 }}>Loading members…</div>
                ) : members.length === 0 ? (
                  <div style={{ padding: "20px 24px", color: "var(--ink-mute, #8a867f)", fontSize: 13 }}>No members yet.</div>
                ) : members.map((m) => (
                  <div key={m.uid} className="member-row">
                    <div className="member-avatar">{(m.displayName || m.email || "?")[0].toUpperCase()}</div>
                    <div className="member-info">
                      <div className="member-name">{m.displayName || "—"}</div>
                      <div className="member-email">{m.email}</div>
                    </div>
                    <span className={`role-badge${m.role === "owner" ? " owner" : m.role === "admin" ? " admin" : ""}`}>{m.role}</span>
                    <div className="member-actions">
                      {m.uid !== user?.uid && (currentRole === "owner" || currentRole === "admin") && m.role !== "owner" && (
                        <button
                          className="btn-sm danger"
                          onClick={() => removeMember(m.uid)}
                          disabled={removingUid === m.uid}
                        >
                          {removingUid === m.uid ? "Removing…" : "Remove"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* NOTIFICATIONS */}
          <section className="section" id="notifications">
            <div className="section-head">
              <h2 className="section-title">Notifications</h2>
              <p className="section-description">Changes save instantly.</p>
            </div>
            <div className="section-card">
              {[
                { field: "notifyDigest" as const, label: "Daily digest email" },
                { field: "notifyAlerts" as const, label: "Real-time failure alerts" },
                { field: "notifyComplete" as const, label: "Cycle completion" },
                { field: "notifyStuck" as const, label: "Stuck tester alert" },
                { field: "notifyWeekly" as const, label: "Weekly summary" },
              ].map(({ field, label }) => (
                <div key={field} className="field-row" style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}>
                  <div><div className="field-label-name">{label}</div></div>
                  <input type="checkbox" checked={formData[field] as boolean} onChange={(e) => handleToggleSave(field, e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                </div>
              ))}
            </div>
          </section>
          {/* DANGER ZONE */}
          <section className="section" id="danger">
            <div className="section-head">
              <h2 className="section-title" style={{ color: "#a6421f" }}>Danger zone</h2>
              <p className="section-description">Irreversible actions. Proceed with care.</p>
            </div>
            <div className="danger-card">
              {/* Leave workspace (non-owners) */}
              {currentRole !== "owner" && (
                <div className="danger-row">
                  <div>
                    <div className="danger-label">Leave workspace</div>
                    <div className="danger-desc">You'll lose access immediately. An owner can re-invite you.</div>
                  </div>
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (!currentAccountId || !user) return;
                      try {
                        await deleteDoc(fsDoc(db, "accountMembers", `${currentAccountId}_${user.uid}`));
                        await fullSignOut();
                      } catch {
                        showToast("Failed to leave workspace", "error");
                      }
                    }}
                  >
                    Leave workspace
                  </button>
                </div>
              )}

              {/* Delete workspace (owners only) */}
              {currentRole === "owner" && (
                <div className="danger-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                  <div style={{ width: "100%" }}>
                    <div className="danger-label">Delete workspace</div>
                    <div className="danger-desc">
                      Permanently deletes this workspace, all members, and all settings. This cannot be undone.
                      Type <strong>{settings?.workspaceName || "workspace name"}</strong> to confirm.
                    </div>
                    <div className="confirm-input-wrap">
                      <input
                        className="confirm-input"
                        type="text"
                        placeholder={settings?.workspaceName || "Workspace name"}
                        value={deleteConfirmName}
                        onChange={(e) => setDeleteConfirmName(e.target.value)}
                      />
                      <button
                        className="btn-danger"
                        disabled={deleteConfirmName !== settings?.workspaceName || deletingWorkspace}
                        onClick={deleteWorkspace}
                      >
                        {deletingWorkspace ? "Deleting…" : "Delete workspace"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>
      </main>

      <div className={`save-bar${isDirty ? " show" : ""}`}>
        <div className="save-bar-status">
          <div className="save-bar-title">Unsaved changes</div>
          <div className="save-bar-changes">Changes in: {changedSections.join(", ")}</div>
        </div>
        <button className="btn-discard" onClick={handleDiscard} disabled={isSaving}>Discard</button>
        <button className="btn-save" onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save changes"}</button>
      </div>

      {toast && <div className={`toast show${toast.type === "error" ? " error" : ""}`}>{toast.msg}</div>}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const expanded = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (expanded.length !== 6) return `rgba(45,74,62,${alpha})`;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}