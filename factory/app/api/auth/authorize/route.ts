// Start "Sign in with Vercel": PKCE, state and nonce, kept for ten minutes
// in an httpOnly cookie the callback checks.
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

const PENDING_COOKIE = 'factory_login';

export async function GET(req: Request) {
  const clientId = process.env.VERCEL_APP_CLIENT_ID;
  if (!clientId) return new Response('Sign in with Vercel is not configured (VERCEL_APP_CLIENT_ID).', { status: 503 });
  const verifier = randomBytes(43).toString('hex');
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const url = new URL('https://vercel.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL('/api/auth/callback', req.url).toString(),
    response_type: 'code',
    scope: 'openid profile',
    state,
    nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(PENDING_COOKIE, JSON.stringify({ verifier, state, nonce }), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth', maxAge: 600,
  });
  return res;
}
