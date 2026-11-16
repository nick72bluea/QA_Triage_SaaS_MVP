// Security-rules tests. Run with:  npm run test:rules
// (starts local Firestore + Storage emulators; never touches the real project)

import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, collectionGroup, query, where, getDocs, writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let env;
const A = 'acctA';
const B = 'acctB';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-proofdeck',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'accounts', A), { name: 'A', ownerId: 'ownerA' });
    await setDoc(doc(db, 'accounts', B), { name: 'B', ownerId: 'ownerB' });
    const m = (acc, uid, role) => setDoc(doc(db, 'accountMembers', `${acc}_${uid}`), { accountId: acc, uid, role });
    await m(A, 'ownerA', 'owner');
    await m(A, 'adminA', 'admin');
    await m(A, 'memberA', 'member');
    await m(A, 'viewerA', 'viewer');
    await m(B, 'ownerB', 'owner');
    await setDoc(doc(db, 'accounts', A, 'settings', 'workspace'), { workspaceName: 'A', jiraUrl: 'x.atlassian.net' });
    await setDoc(doc(db, 'accounts', A, 'private', 'secrets'), { jiraToken: 'SECRET' });
    await setDoc(doc(db, 'testRuns', 'runA'), { accountId: A, projectName: 'P', testerName: 'T', steps: [] });
    await setDoc(doc(db, 'testRuns', 'runB'), { accountId: B, projectName: 'Q', testerName: 'U', steps: [] });
    await setDoc(doc(db, 'testRuns', 'runA', 'messages', 'm1'), {
      accountId: A, runId: 'runA', direction: 'pm_to_tester', body: 'hi', createdAt: 1, readByTester: false, hasReply: false, readByPm: true,
    });
    await setDoc(doc(db, 'invites', 'tok-0123456789abcdef0123456789abcdef'), { token: 'tok-0123456789abcdef0123456789abcdef', accountId: A, role: 'member', expiresAt: Date.now() + 1e6 });
  });
});

const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// ─── Isolation between workspaces ──────────────────────────────────────────

test('members can list their own workspace runs only', async () => {
  await assertSucceeds(getDocs(query(collection(as('memberA'), 'testRuns'), where('accountId', '==', A))));
  await assertFails(getDocs(query(collection(as('memberA'), 'testRuns'), where('accountId', '==', B))));
  await assertFails(getDocs(collection(as('memberA'), 'testRuns')));
});

test('nobody can enumerate runs without signing in', async () => {
  await assertFails(getDocs(collection(anon(), 'testRuns')));
  await assertFails(getDocs(query(collection(anon(), 'testRuns'), where('accountId', '==', A))));
});

test('a stranger cannot read another workspace settings or account', async () => {
  await assertFails(getDoc(doc(as('ownerB'), 'accounts', A, 'settings', 'workspace')));
  await assertFails(getDoc(doc(as('ownerB'), 'accounts', A)));
  await assertFails(getDoc(doc(anon(), 'accounts', A, 'settings', 'workspace')));
  await assertSucceeds(getDoc(doc(as('viewerA'), 'accounts', A, 'settings', 'workspace')));
});

test('secrets are unreadable from the browser, even for owners', async () => {
  await assertFails(getDoc(doc(as('ownerA'), 'accounts', A, 'private', 'secrets')));
  await assertFails(getDoc(doc(anon(), 'accounts', A, 'private', 'secrets')));
});

test('settings cannot store tokens', async () => {
  await assertFails(updateDoc(doc(as('ownerA'), 'accounts', A, 'settings', 'workspace'), { jiraToken: 'x' }));
  await assertFails(updateDoc(doc(as('ownerA'), 'accounts', A, 'settings', 'workspace'), { figmaToken: 'x' }));
  await assertSucceeds(updateDoc(doc(as('adminA'), 'accounts', A, 'settings', 'workspace'), { workspaceName: 'New' }));
  await assertFails(updateDoc(doc(as('memberA'), 'accounts', A, 'settings', 'workspace'), { workspaceName: 'New' }));
});

// ─── Roles ─────────────────────────────────────────────────────────────────

test('viewers are read-only', async () => {
  await assertFails(setDoc(doc(as('viewerA'), 'testRuns', 'new1'), { accountId: A, projectName: 'x' }));
  await assertFails(updateDoc(doc(as('viewerA'), 'testRuns', 'runA'), { projectName: 'changed' }));
  await assertFails(setDoc(doc(as('viewerA'), 'accounts', A, 'scripts', 's1'), { name: 'x' }));
  await assertSucceeds(setDoc(doc(as('memberA'), 'testRuns', 'new1'), { accountId: A, projectName: 'x' }));
  await assertSucceeds(setDoc(doc(as('memberA'), 'accounts', A, 'scripts', 's1'), { name: 'x' }));
});

test('members cannot create runs in a workspace they are not in', async () => {
  await assertFails(setDoc(doc(as('memberA'), 'testRuns', 'evil'), { accountId: B, projectName: 'x' }));
});

test('runs cannot be moved to another workspace', async () => {
  await assertFails(updateDoc(doc(as('memberA'), 'testRuns', 'runA'), { accountId: B }));
});

// ─── Memberships ───────────────────────────────────────────────────────────

test('you cannot add yourself to someone else\'s workspace', async () => {
  const db = as('attacker');
  await assertFails(setDoc(doc(db, 'accountMembers', `${A}_attacker`), { accountId: A, uid: 'attacker', role: 'owner' }));
  await assertFails(setDoc(doc(db, 'accountMembers', `${A}_attacker`), { accountId: A, uid: 'attacker', role: 'member' }));
});

test('members cannot promote themselves', async () => {
  await assertFails(updateDoc(doc(as('memberA'), 'accountMembers', `${A}_memberA`), { role: 'admin' }));
  await assertFails(updateDoc(doc(as('adminA'), 'accountMembers', `${A}_memberA`), { role: 'owner' }));
  await assertSucceeds(updateDoc(doc(as('adminA'), 'accountMembers', `${A}_memberA`), { role: 'viewer' }));
});

test('creating a brand-new workspace works (same order as the app)', async () => {
  const db = as('newbie');
  await assertSucceeds(setDoc(doc(db, 'accounts', 'acctNew'), { name: 'N', ownerId: 'newbie' }));
  await assertSucceeds(setDoc(doc(db, 'accounts', 'acctNew', 'settings', 'workspace'), { workspaceName: 'N' }));
  await assertSucceeds(setDoc(doc(db, 'accountMembers', 'acctNew_newbie'), { accountId: 'acctNew', uid: 'newbie', role: 'owner' }));
  await assertSucceeds(getDocs(query(collection(db, 'accountMembers'), where('uid', '==', 'newbie'))));
  await assertFails(setDoc(doc(db, 'accounts', 'acctX'), { name: 'X', ownerId: 'someoneElse' }));
});

test('members list is visible within the workspace only', async () => {
  await assertSucceeds(getDocs(query(collection(as('viewerA'), 'accountMembers'), where('accountId', '==', A))));
  await assertFails(getDocs(query(collection(as('ownerB'), 'accountMembers'), where('accountId', '==', A))));
});

test('owner can delete their workspace (batch like the settings page)', async () => {
  const db = as('ownerA');
  const batch = writeBatch(db);
  for (const uid of ['ownerA', 'adminA', 'memberA', 'viewerA']) batch.delete(doc(db, 'accountMembers', `${A}_${uid}`));
  batch.delete(doc(db, 'invites', 'tok-0123456789abcdef0123456789abcdef'));
  batch.delete(doc(db, 'accounts', A));
  await assertSucceeds(batch.commit());
});

// ─── Invites ───────────────────────────────────────────────────────────────

test('only admins can see or create invites', async () => {
  await assertSucceeds(getDocs(query(collection(as('adminA'), 'invites'), where('accountId', '==', A))));
  await assertFails(getDocs(query(collection(as('memberA'), 'invites'), where('accountId', '==', A))));
  await assertFails(getDoc(doc(anon(), 'invites', 'tok-0123456789abcdef0123456789abcdef')));
  const t = '11111111-2222-3333-4444-555555555555';
  await assertSucceeds(setDoc(doc(as('adminA'), 'invites', t), { token: t, accountId: A, role: 'member', expiresAt: 1 }));
  await assertFails(setDoc(doc(as('adminA'), 'invites', 'x' + t), { token: 'x' + t, accountId: A, role: 'owner', expiresAt: 1 }));
});

// ─── Testers (no account) ──────────────────────────────────────────────────

test('a tester with the link can open and fill in their run', async () => {
  const db = anon();
  await assertSucceeds(getDoc(doc(db, 'testRuns', 'runA')));
  await assertSucceeds(updateDoc(doc(db, 'testRuns', 'runA'), { 'results.s1': { status: 'Passed' }, cumulativeTimeMs: 5 }));
  await assertSucceeds(updateDoc(doc(db, 'testRuns', 'runA'), { deviceInfo: { device: 'd', os: 'o', browser: 'b' } }));
  await assertSucceeds(updateDoc(doc(db, 'testRuns', 'runA'), { isCompleted: true, completedAt: 1 }));
});

test('a tester cannot change anything else on the run', async () => {
  const db = anon();
  await assertFails(updateDoc(doc(db, 'testRuns', 'runA'), { steps: [{ evil: true }] }));
  await assertFails(updateDoc(doc(db, 'testRuns', 'runA'), { accountId: B }));
  await assertFails(deleteDoc(doc(db, 'testRuns', 'runA')));
  await assertFails(setDoc(doc(db, 'testRuns', 'fake'), { accountId: A }));
});

test('tester messaging works inside their own run', async () => {
  const db = anon();
  await assertSucceeds(getDocs(collection(db, 'testRuns', 'runA', 'messages')));
  await assertSucceeds(addDoc(collection(db, 'testRuns', 'runA', 'messages'), {
    accountId: A, runId: 'runA', direction: 'tester_to_pm', body: 'reply', createdAt: 2,
  }));
  await assertSucceeds(updateDoc(doc(db, 'testRuns', 'runA', 'messages', 'm1'), { readByTester: true, hasReply: true }));
  // can't impersonate the PM or edit the body
  await assertFails(addDoc(collection(db, 'testRuns', 'runA', 'messages'), {
    accountId: A, runId: 'runA', direction: 'pm_to_tester', body: 'fake', createdAt: 3,
  }));
  await assertFails(updateDoc(doc(db, 'testRuns', 'runA', 'messages', 'm1'), { body: 'changed' }));
  // can't drop a message into another workspace's inbox
  await assertFails(addDoc(collection(db, 'testRuns', 'runA', 'messages'), {
    accountId: B, runId: 'runA', direction: 'tester_to_pm', body: 'x', createdAt: 4,
  }));
});

test('nobody can sweep up every message across workspaces', async () => {
  await assertFails(getDocs(collectionGroup(anon(), 'messages')));
  await assertFails(getDocs(query(collectionGroup(as('ownerB'), 'messages'), where('accountId', '==', A))));
  await assertSucceeds(getDocs(query(collectionGroup(as('viewerA'), 'messages'), where('accountId', '==', A))));
});

test('PM can send and mark messages read', async () => {
  const db = as('memberA');
  await assertSucceeds(addDoc(collection(db, 'testRuns', 'runA', 'messages'), {
    accountId: A, runId: 'runA', direction: 'pm_to_tester', body: 'hi', createdAt: 5,
  }));
  await assertSucceeds(updateDoc(doc(db, 'testRuns', 'runA', 'messages', 'm1'), { readByPm: true }));
});

// ─── Mobile upload hand-off ────────────────────────────────────────────────

test('mobile upload tokens', async () => {
  const t = '11111111-2222-3333-4444-555555555555';
  const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/y';
  await assertSucceeds(setDoc(doc(anon(), 'mobileUploads', t), { url, createdAt: 1 }));
  await assertSucceeds(getDoc(doc(anon(), 'mobileUploads', t)));
  await assertFails(getDocs(collection(anon(), 'mobileUploads')));
  await assertFails(setDoc(doc(anon(), 'mobileUploads', 'short'), { url, createdAt: 1 }));
  await assertFails(setDoc(doc(anon(), 'mobileUploads', t), { url: 'https://evil.example/x', createdAt: 1 }));
});

// ─── Super user ────────────────────────────────────────────────────────────

test('super user can see every workspace', async () => {
  const db = as('nick', { superUser: true });
  await assertSucceeds(getDocs(query(collection(db, 'testRuns'), where('accountId', '==', B))));
  await assertSucceeds(getDoc(doc(db, 'accounts', A, 'settings', 'workspace')));
  await assertFails(getDoc(doc(db, 'accounts', A, 'private', 'secrets')));
});

// ─── Users ─────────────────────────────────────────────────────────────────

test('users can only read their own profile (PIN hash)', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users', 'memberA'), { pinHash: 'h' }));
  await assertSucceeds(getDoc(doc(as('memberA'), 'users', 'memberA')));
  await assertFails(getDoc(doc(as('adminA'), 'users', 'memberA')));
});

// ─── Storage ───────────────────────────────────────────────────────────────

test('storage: testers can upload images, not other files; no listing', async () => {
  const st = env.unauthenticatedContext().storage();
  const png = new Uint8Array([137, 80, 78, 71]);
  await assertSucceeds(uploadBytes(ref(st, 'tester_evidence/a.png'), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(st, 'tester_evidence/a.html'), png, { contentType: 'text/html' }));
  await assertFails(uploadBytes(ref(st, 'pm_evidence/a.png'), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(st, 'somewhere/else.png'), png, { contentType: 'image/png' }));
  const signed = env.authenticatedContext('memberA').storage();
  await assertSucceeds(uploadBytes(ref(signed, 'pm_evidence/a.png'), png, { contentType: 'image/png' }));
});
