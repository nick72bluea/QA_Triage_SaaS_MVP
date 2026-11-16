import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireMember, errorResponse } from '@/lib/server-auth';

// Permanently deletes a workspace and everything in it. Owners only.
// Body: { accountId, confirmName } — confirmName must match the workspace name.
//
// Removes: the account doc and all its subcollections (settings, scripts,
// integrations, private secrets), every test run (and its messages), all
// memberships and invites, and old flat testerMessages for the workspace.
export async function POST(req: Request) {
  try {
    const { accountId, confirmName } = (await req.json()) as { accountId: string; confirmName?: string };
    await requireMember(req, accountId, 'owner');

    const db = adminDb();
    const accountRef = db.doc(`accounts/${accountId}`);
    const account = await accountRef.get();
    if (!account.exists) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

    // The settings page shows workspaceName from settings; older workspaces may
    // only have the name on the account doc. Either matches.
    const settings = await db.doc(`accounts/${accountId}/settings/workspace`).get();
    const names = [account.data()?.name, settings.data()?.workspaceName]
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n) => n.trim());
    if (typeof confirmName !== 'string' || !names.includes(confirmName.trim())) {
      return NextResponse.json({ error: 'Type the workspace name exactly to confirm.' }, { status: 400 });
    }

    const [runs, members, invites, legacyMessages] = await Promise.all([
      db.collection('testRuns').where('accountId', '==', accountId).get(),
      db.collection('accountMembers').where('accountId', '==', accountId).get(),
      db.collection('invites').where('accountId', '==', accountId).get(),
      db.collection('testerMessages').where('accountId', '==', accountId).get(),
    ]);

    // recursiveDelete also removes subcollections (testRuns/{id}/messages, account settings, …)
    for (const run of runs.docs) await db.recursiveDelete(run.ref);

    const writer = db.bulkWriter();
    for (const d of [...invites.docs, ...legacyMessages.docs]) writer.delete(d.ref);
    for (const m of members.docs) {
      writer.delete(m.ref);
      // Don't leave anyone pointing at a workspace that no longer exists.
      const uid = m.data().uid as string | undefined;
      if (uid) writer.set(db.doc(`users/${uid}`), { lastAccountId: FieldValue.delete() }, { merge: true });
    }
    await writer.close();

    await db.recursiveDelete(accountRef);

    return NextResponse.json({
      ok: true,
      deleted: { testRuns: runs.size, members: members.size, invites: invites.size },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
