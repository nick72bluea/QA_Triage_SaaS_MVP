// One-off data migration for the phase-1 security changes.
//
//   1. Moves Jira / AI tokens out of accounts/{id}/settings/workspace
//      into accounts/{id}/private/secrets (server-only).
//   2. Copies testerMessages/{id} into testRuns/{runId}/messages/{id},
//      filling in accountId from the run where it's missing.
//
// Safe to run more than once. Does a dry run unless you pass --apply.
//
// Usage:
//   node scripts/migrate-phase1.mjs path/to/service-account.json
//   node scripts/migrate-phase1.mjs path/to/service-account.json --apply

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const keyPath = process.argv[2];
const apply = process.argv.includes('--apply');
if (!keyPath) {
  console.error('Usage: node scripts/migrate-phase1.mjs <service-account.json> [--apply]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();
console.log(apply ? '*** APPLYING CHANGES ***' : '--- dry run (add --apply to write) ---');

// 1. Secrets
const accounts = await db.collection('accounts').get();
let secretsMoved = 0;
for (const account of accounts.docs) {
  const settingsRef = db.doc(`accounts/${account.id}/settings/workspace`);
  const settings = (await settingsRef.get()).data() || {};
  const patch = {};
  for (const key of ['jiraToken', 'aiToken']) {
    if (typeof settings[key] === 'string' && settings[key].trim()) patch[key] = settings[key].trim();
  }
  if (!('jiraToken' in settings) && !('aiToken' in settings)) continue;

  console.log(`account ${account.id}: moving ${Object.keys(patch).join(', ') || '(empty fields)'}`);
  secretsMoved++;
  if (!apply) continue;

  if (Object.keys(patch).length) {
    await db.doc(`accounts/${account.id}/private/secrets`).set(
      { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'migration' },
      { merge: true }
    );
  }
  await settingsRef.set(
    {
      jiraToken: FieldValue.delete(),
      aiToken: FieldValue.delete(),
      jiraTokenSet: Boolean(patch.jiraToken),
      aiTokenSet: Boolean(patch.aiToken),
    },
    { merge: true }
  );
}

// 2. Messages
const messages = await db.collection('testerMessages').get();
const runCache = new Map();
let copied = 0;
let skipped = 0;
for (const m of messages.docs) {
  const data = m.data();
  if (!data.runId) { skipped++; continue; }

  if (!runCache.has(data.runId)) runCache.set(data.runId, (await db.doc(`testRuns/${data.runId}`).get()).data());
  const run = runCache.get(data.runId);
  if (!run) { console.log(`message ${m.id}: run ${data.runId} no longer exists — skipped`); skipped++; continue; }

  copied++;
  if (!apply) continue;
  await db.doc(`testRuns/${data.runId}/messages/${m.id}`).set({
    ...data,
    accountId: data.accountId || run.accountId || null,
  });
}

console.log(`\nSecrets: ${secretsMoved} workspace(s). Messages: ${copied} to copy, ${skipped} skipped.`);
console.log(apply
  ? 'Done. The old testerMessages collection was left in place — delete it in the console once you are happy.'
  : 'Nothing was changed. Re-run with --apply to do it for real.');
