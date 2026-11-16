// Server-only access to workspace secrets (Jira API token, workspace AI key).
//
// Secrets live at accounts/{accountId}/private/secrets. Firestore rules deny
// ALL browser access to that path, so only the Admin SDK can read or write it.

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export interface AccountSecrets {
  jiraToken?: string;
  aiToken?: string;
}

export const SECRET_KEYS = ['jiraToken', 'aiToken'] as const;

export async function getAccountSecrets(accountId: string): Promise<AccountSecrets> {
  const db = adminDb();
  const [secretSnap, settingsSnap] = await Promise.all([
    db.doc(`accounts/${accountId}/private/secrets`).get(),
    db.doc(`accounts/${accountId}/settings/workspace`).get(),
  ]);
  const secrets = (secretSnap.data() || {}) as AccountSecrets;
  const legacy = settingsSnap.data() || {};

  // Fallback for workspaces not yet migrated (tokens used to sit in settings).
  return {
    jiraToken: secrets.jiraToken || legacy.jiraToken || undefined,
    aiToken: secrets.aiToken || legacy.aiToken || undefined,
  };
}

// Pass a string to set a secret, or null to clear it. Omitted keys are untouched.
export async function setAccountSecrets(
  accountId: string,
  patch: { jiraToken?: string | null; aiToken?: string | null },
  uid: string
) {
  const db = adminDb();
  const secretUpdate: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: uid };
  const settingsUpdate: Record<string, unknown> = {};

  for (const key of SECRET_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    const set = typeof value === 'string' && value.trim().length > 0;
    secretUpdate[key] = set ? value!.trim() : FieldValue.delete();
    // The browser only ever sees whether a token is saved, never the token itself.
    settingsUpdate[`${key}Set`] = set;
    // Remove any legacy plaintext copy from the readable settings doc.
    settingsUpdate[key] = FieldValue.delete();
  }

  await db.doc(`accounts/${accountId}/private/secrets`).set(secretUpdate, { merge: true });
  await db.doc(`accounts/${accountId}/settings/workspace`).set(settingsUpdate, { merge: true });
}
