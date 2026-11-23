import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openRemote } from '../../server/remote-db.js';

/** A fake libsql connection whose stream can be killed, counting what it was asked. */
function fakeServer() {
  const conns = [];
  let clock = 0;
  const connect = () => {
    const conn = {
      dead: false, prepared: 0, pragmas: [], closed: false, inTransaction: false,
      check() { if (this.dead) throw new Error('Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: x\\"}"))'); },
      prepare(sql) {
        this.prepared += 1;
        const c = this;
        let raw = false;
        return {
          raw(t) { raw = t; return this; },
          get: (...a) => { c.check(); return raw ? [sql, ...a] : { sql, args: a }; },
          all: (...a) => { c.check(); return [{ sql, args: a }]; },
          run: (...a) => { c.check(); return { changes: 1 }; },
        };
      },
      exec() { this.check(); },
      pragma(p) { this.check(); this.pragmas.push(p); return 1; },
      transaction(fn) { return (...a) => { this.check(); return fn(...a); }; },
      close() { this.closed = true; },
    };
    conns.push(conn);
    return conn;
  };
  return { conns, connect, now: () => clock, advance: (ms) => { clock += ms; } };
}

test('a dead stream is reopened once and the statement re-prepared on the new connection', () => {
  const s = fakeServer();
  const db = openRemote('libsql://x', 't', s);
  const stmt = db.prepare('SELECT 1');
  assert.deepEqual(stmt.get(7), { sql: 'SELECT 1', args: [7] });
  s.conns[0].dead = true;
  assert.deepEqual(stmt.get(8), { sql: 'SELECT 1', args: [8] });
  assert.equal(s.conns.length, 2);
  assert.equal(s.conns[1].prepared, 1);
});

test('an idle connection is replaced before it is used, and pragmas are replayed', () => {
  const s = fakeServer();
  const db = openRemote('libsql://x', 't', s);
  db.pragma('foreign_keys = ON');
  db.prepare('SELECT 1').all();
  s.advance(60_000);
  db.prepare('SELECT 1').all();
  assert.equal(s.conns.length, 2);
  assert.ok(s.conns[0].closed);
  assert.deepEqual(s.conns[1].pragmas, ['foreign_keys = ON']);
});

test('a busy connection is kept', () => {
  const s = fakeServer();
  const db = openRemote('libsql://x', 't', s);
  const stmt = db.prepare('SELECT 1');
  for (let i = 0; i < 5; i++) { stmt.get(); s.advance(1_000); }
  assert.equal(s.conns.length, 1);
  assert.equal(s.conns[0].prepared, 1);
});

test('a transaction that hits a dead stream is retried whole; other errors are not', () => {
  const s = fakeServer();
  const db = openRemote('libsql://x', 't', s);
  let calls = 0;
  const tx = db.transaction((n) => { calls += 1; return n * 2; });
  assert.equal(tx(2), 4);
  s.conns[0].dead = true;
  assert.equal(tx(3), 6);
  assert.equal(calls, 2);
  const boom = db.transaction(() => { throw new Error('UNIQUE constraint failed'); });
  assert.throws(() => boom(), /UNIQUE/);
  assert.equal(s.conns.length, 2);
});

test('raw() survives a reconnect', () => {
  const s = fakeServer();
  const db = openRemote('libsql://x', 't', s);
  const stmt = db.prepare('SELECT 2').raw();
  assert.deepEqual(stmt.get(1), ['SELECT 2', 1]);
  s.conns[0].dead = true;
  assert.deepEqual(stmt.get(1), ['SELECT 2', 1]);
});
