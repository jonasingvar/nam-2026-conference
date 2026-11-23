/**
 * The whole Express API as one Vercel Function (`vercel.json` rewrites every
 * `/api/*` request here; the built frontend is static).
 *
 * Production has TURSO_DATABASE_URL, so `server/db.js` talks to Turso, which
 * `server/publish-seed.js` reseeded when this deployment was built.
 *
 * A preview has no database of its own, so each function instance seeds a
 * private SQLite file in /tmp the first time it starts (~1 s): every pull
 * request gets the same fresh conference, and nothing it does can reach
 * production. The cost: an instance that is recycled starts over.
 */
import { existsSync } from 'node:fs';

if (!process.env.TURSO_DATABASE_URL) {
  process.env.ORBIT_DB ??= '/tmp/orbit.db';
  if (!existsSync(process.env.ORBIT_DB)) await import('../server/seed.js');
}

const { app } = await import('../server/index.js');
export default app;
