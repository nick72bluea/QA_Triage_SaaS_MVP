// Marks a user as a Proofdeck super user (can see every workspace).
// Sets the custom auth claim { superUser: true } that firestore.rules and
// src/lib/server-auth.ts check. The user must sign out and back in afterwards.
//
// Usage:
//   node scripts/set-super-user.mjs path/to/service-account.json you@example.com
//   node scripts/set-super-user.mjs path/to/service-account.json you@example.com --remove

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [keyPath, email] = process.argv.slice(2);
const remove = process.argv.includes('--remove');
if (!keyPath || !email) {
  console.error('Usage: node scripts/set-super-user.mjs <service-account.json> <email> [--remove]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...(user.customClaims || {}) };
if (remove) delete claims.superUser;
else claims.superUser = true;
await auth.setCustomUserClaims(user.uid, claims);
console.log(`${email} is ${remove ? 'no longer' : 'now'} a super user. Sign out and back in for it to take effect.`);
