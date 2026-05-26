import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';

export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_FIGMA_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/figma/callback`;
  
  if (!clientId) {
    return NextResponse.json({ error: 'Missing Figma Client ID in .env.local' }, { status: 500 });
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(16).toString('hex');
  
  // AWAIT the cookie store (Required in modern Next.js!)
  const cookieStore = await cookies();
  cookieStore.set('figma_oauth_state', state, { 
    httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/' 
  });

  const figmaAuthUrl = new URL('https://www.figma.com/oauth');
  figmaAuthUrl.searchParams.append('client_id', clientId);
  figmaAuthUrl.searchParams.append('redirect_uri', redirectUri);
  figmaAuthUrl.searchParams.append('scope', 'file_read');
  figmaAuthUrl.searchParams.append('state', state);
  figmaAuthUrl.searchParams.append('response_type', 'code');

  return NextResponse.redirect(figmaAuthUrl.toString());
}