/**
 * Reseed the production database (Turso) in one round trip.
 *
 * `server/seed.js` writes row by row and reads ids back, which is right for a
 * local file but takes minutes over the network. So the seed runs into a
 * throwaway local file first, and this script sends that file's contents to
 * Turso as a single batch inside one transaction: the live app sees the old
 * conference until COMMIT, then the new one, never half of each.
 *
 * Runs at build time on a production deploy (`npm run build:vercel`), which is
 * what `npm start` did on every deploy before: Day 1 is the day you deploy.
 * Without TURSO_DATABASE_URL (a preview, a laptop) it does nothing.
 */
import Database from 'libsql';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A SQL literal for one value from SQLite. */
export function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * Everything in a local database as one SQL script: drop the old tables,
 * create the schema the file has, and insert every row. Multi-row VALUES in
 * chunks, well under SQLite's 500-row compound limit.
 */
export function dumpSql(local, chunk = 200) {
  const objects = local.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'index', rowid",
  ).all();
  const tables = objects.filter((o) => o.type === 'table').map((o) => o.name);
  const out = ['PRAGMA foreign_keys = OFF;', 'BEGIN;'];
  for (const t of [...tables].reverse()) out.push(`DROP TABLE IF EXISTS "${t}";`);
  for (const o of objects) out.push(`${o.sql};`);
  for (const t of tables) {
    const rows = local.prepare(`SELECT * FROM "${t}"`).raw().all();
    for (let i = 0; i < rows.length; i += chunk) {
      const values = rows.slice(i, i + chunk).map((r) => `(${r.map(literal).join(',')})`).join(',\n');
      out.push(`INSERT INTO "${t}" VALUES\n${values};`);
    }
  }
  out.push('COMMIT;', 'PRAGMA foreign_keys = ON;');
  return out.join('\n');
}

function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.log('→ No TURSO_DATABASE_URL: nothing to publish (preview or local build).');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'orbit-seed-'));
  const file = join(dir, 'orbit.db');
  try {
    const seeded = spawnSync(process.execPath, [join(ROOT, 'server', 'seed.js')], {
      env: { ...process.env, ORBIT_DB: file },
      stdio: 'inherit',
    });
    if (seeded.status !== 0) throw new Error(`seed.js exited with ${seeded.status}`);

    const local = new Database(file, { readonly: true });
    const sql = dumpSql(local);
    local.close();

    const started = Date.now();
    const remote = new Database(url, { authToken: process.env.TURSO_AUTH_TOKEN });
    remote.exec(sql);
    const n = remote.prepare('SELECT COUNT(*) n FROM sessions').get().n;
    remote.close();
    console.log(`✓ Published the seed to Turso: ${n} sessions, ${(sql.length / 1024).toFixed(0)} KB in ${Date.now() - started} ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
