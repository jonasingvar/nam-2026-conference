/**
 * Who may see /runs: a person signed in with Vercel whose username is listed
 * in RUNS_VIEWERS. Sign in with Vercel lets *any* Vercel account through by
 * default, so the list is the gate and an empty one admits nobody.
 *
 * The session is a cookie holding the username and an expiry, signed with
 * FACTORY_SESSION_SECRET (HMAC-SHA256). No session store: there is one viewer
 * and nothing to revoke but the secret.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'factory_session';
export const SESSION_HOURS = 12;

const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

export function sealSession(user: string, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ user, exp: now + SESSION_HOURS * 3600_000 })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** The username in a valid, unexpired cookie, or null. */
export function openSession(cookie: string | undefined, secret: string | undefined, now = Date.now()): string | null {
  if (!cookie || !secret) return null;
  const [body, mac] = cookie.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { user, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof user === 'string' && typeof exp === 'number' && exp > now ? user : null;
  } catch {
    return null;
  }
}

export function viewers(list = process.env.RUNS_VIEWERS): Set<string> {
  return new Set((list ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export const mayView = (user: string | null | undefined, list?: string) => Boolean(user) && viewers(list).has(String(user).toLowerCase());
