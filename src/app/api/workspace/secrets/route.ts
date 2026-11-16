import { NextResponse } from 'next/server';
import { requireMember, errorResponse } from '@/lib/server-auth';
import { setAccountSecrets, SECRET_KEYS } from '@/lib/secrets';

// Save or clear workspace secrets (Jira API token, AI key, Figma token).
// Body: { accountId, jiraToken?, aiToken?, figmaToken? } — each a string to set or null to clear.
// Only workspace admins and owners may change these.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { accountId } = body as { accountId: string };
    const caller = await requireMember(req, accountId, 'admin');

    const patch: { jiraToken?: string | null; aiToken?: string | null; figmaToken?: string | null } = {};
    for (const key of SECRET_KEYS) {
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
