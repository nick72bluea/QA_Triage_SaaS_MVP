// Server-side request authentication for API routes.
//
// The browser sends its Firebase ID token in the Authorization header
// (see src/lib/api-client.ts). We verify it with the Admin SDK, then look up
// the caller's membership of the account they're acting on.

import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Caller {
  uid: string;
  email: string | null;
  isSuperUser: boolean;
}

export async function requireUser(req: Request): Promise<Caller> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw new HttpError(401, 'Not signed in.');

  try {
    const decoded = await adminAuth().verifyIdToken(match[1]);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      isSuperUser: decoded.superUser === true,
    };
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
}

// Verifies the caller is signed in AND has at least `minRole` in `accountId`.
// Super users pass every check.
export async function requireMember(
  req: Request,
  accountId: unknown,
  minRole: Role = 'member'
): Promise<Caller & { role: Role }> {
  const caller = await requireUser(req);

  if (typeof accountId !== 'string' || !accountId || accountId.includes('/')) {
    throw new HttpError(400, 'Missing accountId.');
  }

  if (caller.isSuperUser) return { ...caller, role: 'owner' };

  const snap = await adminDb().doc(`accountMembers/${accountId}_${caller.uid}`).get();
  const role = snap.exists ? (snap.data()?.role as Role | undefined) : undefined;

  if (!role || !(role in ROLE_RANK)) {
    throw new HttpError(403, 'You are not a member of this workspace.');
  }
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new HttpError(403, 'Your role does not allow this action.');
  }
  return { ...caller, role };
}

// Turns thrown errors into JSON responses without leaking internals.
export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
}
