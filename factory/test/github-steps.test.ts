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

// ── GitHub having a bad minute ───────────────────────────────────────────────
import { progress } from '../lib/github-steps';

/** Answer GitHub's calls from a list, and keep what was asked. */
function fakeGitHub(answers: { status: number; body?: unknown }[]) {
  const calls: { method: string; url: string }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({ method: init.method || 'GET', url: String(url) });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return new Response(JSON.stringify(a.body ?? { message: 'no' }), { status: a.status });
  }) as any;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test('an edit that times out twice is tried again, and lands', async () => {
  const gh = fakeGitHub([{ status: 504 }, { status: 502 }, { status: 200, body: { id: 7 } }]);
  try {
    assert.equal(await editOrPost(48, 7, 'body'), 7);
    assert.deepEqual(gh.calls.map((c) => c.method), ['PATCH', 'PATCH', 'PATCH']);
  } finally { gh.restore(); }
});

test('a new comment that times out is not posted twice by the same call', async () => {
  const gh = fakeGitHub([{ status: 504 }]);
  try {
    await assert.rejects(() => editOrPost(48, null, 'body'), /→ 504/);
    assert.equal(gh.calls.length, 1);
  } finally { gh.restore(); }
});

test('GitHub refusing the progress comment does not end the run', async () => {
  const gh = fakeGitHub([{ status: 504 }]);
  try {
    assert.equal(await progress(48, 7166943511, 'body', []), 7166943511);
    assert.equal(await progress(48, null, 'body', []), null);
  } finally { gh.restore(); }
});

test('an error that is not GitHub being slow is not retried', async () => {
  const gh = fakeGitHub([{ status: 422 }]);
  try {
    await assert.rejects(() => editOrPost(48, 7, 'body'), /→ 422/);
    assert.equal(gh.calls.length, 1);
  } finally { gh.restore(); }
});
