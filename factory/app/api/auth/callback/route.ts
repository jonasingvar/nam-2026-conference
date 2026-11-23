// Finish "Sign in with Vercel": check state, swap the code (with the PKCE
// verifier) for tokens, verify the ID token's signature, issuer, audience and
// nonce, then let in only a username listed in RUNS_VIEWERS.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { mayView, sealSession, SESSION_COOKIE, SESSION_HOURS } from '../../../../lib/session';

const JWKS = createRemoteJWKSet(new URL('https://vercel.com/.well-known/jwks'));
const PENDING_COOKIE = 'factory_login';

const deny = (why: string, status = 403) => new Response(why, { status, headers: { 'content-type': 'text/plain' } });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = process.env.VERCEL_APP_CLIENT_ID;
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET;
  const secret = process.env.FACTORY_SESSION_SECRET;
  if (!clientId || !clientSecret || !secret) return deny('Sign in with Vercel is not configured.', 503);

  const raw = req.headers.get('cookie')?.match(new RegExp(`${PENDING_COOKIE}=([^;]+)`))?.[1];
  let pending: { verifier: string; state: string; nonce: string } | null = null;
  try { pending = raw ? JSON.parse(decodeURIComponent(raw)) : null; } catch { pending = null; }
  if (!pending || url.searchParams.get('state') !== pending.state) return deny('The sign-in expired or did not start here. Try again from /runs.', 400);
  const code = url.searchParams.get('code');
  if (!code) return deny(`Sign-in was not completed: ${url.searchParams.get('error') ?? 'no code'}.`, 400);

  const tokens = await fetch('https://api.vercel.com/login/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: pending.verifier,
      redirect_uri: new URL('/api/auth/callback', req.url).toString(),
    }),
  });
  if (!tokens.ok) return deny(`Vercel refused the sign-in (${tokens.status}).`, 502);
  const { id_token: idToken } = (await tokens.json()) as { id_token?: string };
  if (!idToken) return deny('Vercel returned no ID token.', 502);

  let user: string;
  try {
    const { payload } = await jwtVerify(idToken, JWKS, { issuer: 'https://vercel.com', audience: clientId });
    if (payload.nonce !== pending.nonce) return deny('The sign-in did not match its request.', 400);
    user = String(payload.preferred_username ?? '');
  } catch {
    return deny('The ID token did not verify.', 400);
  }
  if (!mayView(user)) return deny(`Signed in as ${user || 'an unnamed account'}, which may not see the factory's runs.`);

  const res = NextResponse.redirect(new URL('/runs', req.url));
  res.cookies.set(SESSION_COOKIE, sealSession(user, secret), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_HOURS * 3600,
  });
  res.cookies.delete({ name: PENDING_COOKIE, path: '/api/auth' });
  return res;
}
