import Database from 'libsql';

/**
 * A Turso connection that survives being idle.
 *
 * libsql talks to Turso over a Hrana *stream*: a session the server keeps for
 * a few seconds of inactivity and then drops. A Vercel function instance stays
 * warm far longer than that, so the connection it opened at start-up is dead
 * by the next quiet request ("stream not found"), and every statement prepared
 * on it is dead with it.
 *
 * So this wraps the same better-sqlite3-style surface the app uses — `prepare`
 * (`run`/`get`/`all`/`raw`), `transaction`, `exec`, `pragma`, `close` — and
 * keeps only the SQL. A statement is prepared on the current connection the
 * first time it runs there, and again after a reconnect. The connection is
 * replaced after `IDLE_MS` without use (before the server drops it), and once
 * more if a call still fails with a dead stream — which can only happen before
 * anything was sent, so retrying is safe. A transaction is retried as a whole,
 * for the same reason: a dead stream fails at BEGIN.
 */
const IDLE_MS = 4_000;
const DEAD = /stream not found|stream expired|STREAM_EXPIRED|stream is closed/i;

export function openRemote(url, authToken, { connect = (u, o) => new Database(u, o), now = () => Date.now() } = {}) {
  let conn = null;
  let generation = 0;
  let lastUsed = 0;
  let pragmas = [];

  const fresh = () => {
    try { conn?.close(); } catch { /* already gone */ }
    conn = connect(url, { authToken });
    generation += 1;
    for (const p of pragmas) conn.pragma(p);
  };
  const current = () => {
    if (!conn || now() - lastUsed > IDLE_MS) fresh();
    lastUsed = now();
    return conn;
  };
  const withRetry = (fn) => {
    try {
      return fn(current());
    } catch (err) {
      if (!DEAD.test(String(err?.message ?? err))) throw err;
      fresh();
      lastUsed = now();
      return fn(conn);
    }
  };

  const prepare = (sql) => {
    let compiled = null;
    let compiledFor = -1;
    let mode = null; // 'raw' when the caller asked for arrays
    const on = (c) => {
      if (compiledFor !== generation) {
        compiled = c.prepare(sql);
        if (mode === 'raw') compiled.raw(true);
        compiledFor = generation;
      }
      return compiled;
    };
    const stmt = {
      run: (...args) => withRetry((c) => on(c).run(...args)),
      get: (...args) => withRetry((c) => on(c).get(...args)),
      all: (...args) => withRetry((c) => on(c).all(...args)),
      raw(toggle = true) { mode = toggle ? 'raw' : null; compiledFor = -1; return stmt; },
    };
    return stmt;
  };

  return {
    prepare,
    exec: (sql) => withRetry((c) => c.exec(sql)),
    pragma(source, options) {
      if (/=/.test(source)) pragmas = [...pragmas.filter((p) => p !== source), source];
      return withRetry((c) => c.pragma(source, options));
    },
    transaction: (fn) => (...args) => withRetry((c) => c.transaction(fn)(...args)),
    close: () => { try { conn?.close(); } finally { conn = null; } },
    get inTransaction() { return Boolean(conn?.inTransaction); },
  };
}
