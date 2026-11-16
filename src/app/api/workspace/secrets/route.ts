import { NextResponse } from 'next/server';
import { requireMember, errorResponse } from '@/lib/server-auth';
import { setAccountSecrets } from '@/lib/secrets';

// Save or clear workspace secrets (Jira API token, AI key).
// Body: { accountId, jiraToken?: string | null, aiToken?: string | null }
// Only workspace admins and owners may change these.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { accountId } = body as { accountId: string };
    const caller = await requireMember(req, accountId, 'admin');

    const patch: { jiraToken?: string | null; aiToken?: string | null } = {};
    for (const key of ['jiraToken', 'aiToken'] as const) {
      if (!(key in body)) continue;
      const value = body[key];
      if (value !== null && (typeof value !== 'string' || value.length > 2000)) {
        return NextResponse.json({ error: `Invalid ${key}.` }, { status: 400 });
      }
      patch[key] = value;
    }

    await setAccountSecrets(accountId, patch, caller.uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
