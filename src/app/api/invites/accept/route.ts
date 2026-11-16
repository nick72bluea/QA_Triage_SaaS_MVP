import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireUser, errorResponse } from '@/lib/server-auth';

// Accept an invite as the signed-in user.
// Membership is created HERE on the server, so the browser can never choose
// its own workspace or role. Body: { token }
export async function POST(req: Request) {
  try {
    const caller = await requireUser(req);
    const { token } = (await req.json()) as { token?: string };
    if (typeof token !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(token)) {
      return NextResponse.json({ status: 'invalid' }, { status: 400 });
    }

    const db = adminDb();
    const result = await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(db.doc(`invites/${token}`));
      if (!inviteSnap.exists) return { status: 'invalid' as const };

      const invite = inviteSnap.data()!;
      if (typeof invite.expiresAt !== 'number' || invite.expiresAt < Date.now()) {
        return { status: 'expired' as const };
      }

      const accountId = invite.accountId as string;
      const memberRef = db.doc(`accountMembers/${accountId}_${caller.uid}`);
      const memberSnap = await tx.get(memberRef);

      if (!memberSnap.exists) {
        // Invites can grant member, viewer or admin — never owner.
        const role = ['admin', 'member', 'viewer'].includes(invite.role) ? invite.role : 'member';
        const userSnap = await tx.get(db.doc(`users/${caller.uid}`));
        tx.set(memberRef, {
          accountId,
          uid: caller.uid,
          email: caller.email,
          displayName: userSnap.data()?.displayName || caller.email?.split('@')[0] || 'Member',
          role,
          invitedBy: invite.createdBy || null,
          joinedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.set(db.doc(`users/${caller.uid}`), { lastAccountId: accountId }, { merge: true });
      return {
        status: memberSnap.exists ? ('already_member' as const) : ('joined' as const),
        accountName: invite.accountName || 'the workspace',
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
