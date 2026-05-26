import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { encryptToken } from '@/lib/figma-crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { initAdmin } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  
  // AWAIT the cookie store
  const cookieStore = await cookies();
  const savedState = cookieStore.get('figma_oauth_state')?.value;

  if (!code || state !== savedState) {
    return NextResponse.json({ error: 'Invalid state or missing code (CSRF failure)' }, { status: 400 });
  }

  const clientId = process.env.NEXT_PUBLIC_FIGMA_CLIENT_ID!;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/figma/callback`;

  try {
    const tokenRes = await fetch('https://www.figma.com/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code, grant_type: 'authorization_code' })
    });

    if (!tokenRes.ok) throw new Error('Failed to exchange token');
    const tokenData = await tokenRes.json();

    // Init Admin and save to Firestore
    initAdmin();
    const db = getFirestore();
    
    await db.doc(`workspaces/default_workspace/integrations/figma`).set({
      accessToken: encryptToken(tokenData.access_token),
      refreshToken: encryptToken(tokenData.refresh_token),
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      connectedAt: new Date(),
      status: 'active'
    });

    // Clear state cookie
    cookieStore.delete('figma_oauth_state');

    // Redirect back to the builder
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/scripts`);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}