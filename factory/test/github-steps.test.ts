import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editOrPost } from '../lib/github-steps';

// GitHub stubbed: answers each call by method, and records what was asked.
function stub(answers: Record<string, { status: number; body?: unknown }>) {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push(`${method} ${String(url).replace(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+/, '')}`);
    const a = answers[method] ?? { status: 500 };
    return new Response(a.body === undefined ? '' : JSON.stringify(a.body), { status: a.status });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test('an existing progress comment is edited in place', async () => {
  const s = stub({ PATCH: { status: 200, body: { id: 7 } } });
  try {
    assert.equal(await editOrPost(16, 7, 'body'), 7);
    assert.deepEqual(s.calls, ['PATCH /issues/comments/7']);
  } finally { s.restore(); }
});

test('a deleted progress comment is posted again, and its new id returned', async () => {
  const s = stub({ PATCH: { status: 404, body: { message: 'Not Found' } }, POST: { status: 201, body: { id: 99 } } });
  try {
    assert.equal(await editOrPost(16, 7, 'body'), 99);
    assert.deepEqual(s.calls, ['PATCH /issues/comments/7', 'POST /issues/16/comments']);
  } finally { s.restore(); }
});

test('any other failure still throws', async () => {
  const s = stub({ PATCH: { status: 500, body: { message: 'boom' } } });
  try {
    await assert.rejects(editOrPost(16, 7, 'body'), /500/);
    assert.deepEqual(s.calls, ['PATCH /issues/comments/7']);
  } finally { s.restore(); }
});
