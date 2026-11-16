import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { errorResponse } from '@/lib/server-auth';

// Public: tells the join page which workspace an invite is for, so it can
// show "Join Acme" before the person signs in. Reveals nothing else.
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get('token') || '';
    if (!/^[A-Za-z0-9-]{16,64}$/.test(token)) {
      return NextResponse.json({ status: 'invalid' });
    }

    const snap = await adminDb().doc(`invites/${token}`).get();
    if (!snap.exists) return NextResponse.json({ status: 'invalid' });

    const invite = snap.data()!;
    if (typeof invite.expiresAt !== 'number' || invite.expiresAt < Date.now()) {
      return NextResponse.json({ status: 'expired' });
    }
    return NextResponse.json({ status: 'valid', accountName: invite.accountName || 'the workspace' });
  } catch (err) {
    return errorResponse(err);
  }
}
