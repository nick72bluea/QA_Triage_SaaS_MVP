"use client";

import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  WorkspaceSettings,
  WORKSPACE_DEFAULTS,
} from "@/types/workspace";

// Returns the current account's workspace settings, plus a `save` helper.
// Reads from accounts/{accountId}/settings/workspace and listens in real-time.
//
// Returns null `settings` while loading or before an account is available
// (e.g. on tester routes, or before auth resolves).

export interface UseWorkspaceSettingsResult {
  settings: WorkspaceSettings | null;
  loading: boolean;
  save: (
    patch: Partial<WorkspaceSettings>,
    opts?: { silent?: boolean }
  ) => Promise<void>;
  accountId: string | null;
}

export function useWorkspaceSettings(): UseWorkspaceSettingsResult {
  const { currentAccountId, user } = useAuth();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentAccountId) {
      setSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(
      db,
      "accounts",
      currentAccountId,
      "settings",
      "workspace"
    );

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          // Merge with defaults so missing fields don't crash UI
          const data = { ...WORKSPACE_DEFAULTS, ...snap.data() } as WorkspaceSettings;

          // Backward compat: if old data has brandColor but not the new fields
          if (snap.data().brandColor && !snap.data().brandColorPrimary) {
            data.brandColorPrimary = snap.data().brandColor;
          }

          setSettings(data);
        } else {
          // First time — write defaults
          setDoc(ref, {
            ...WORKSPACE_DEFAULTS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch((err) =>
            console.error("Failed to seed workspace settings:", err)
          );
          setSettings(WORKSPACE_DEFAULTS);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Workspace settings load error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentAccountId]);

  const save = useCallback(
    async (patch: Partial<WorkspaceSettings>, opts?: { silent?: boolean }) => {
      if (!currentAccountId) {
        throw new Error("No active account");
      }
      const ref = doc(
        db,
        "accounts",
        currentAccountId,
        "settings",
        "workspace"
      );

      const payload: any = { ...patch };
      if (!opts?.silent) {
        payload.updatedAt = serverTimestamp();
        if (user?.uid) payload.updatedBy = user.uid;
      }

      await setDoc(ref, payload, { merge: true });
    },
    [currentAccountId, user]
  );

  return { settings, loading, save, accountId: currentAccountId };
}