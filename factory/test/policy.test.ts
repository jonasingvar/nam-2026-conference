import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockedPolicy, AGENT_ENV } from '../lib/policy.ts';

const secrets = { githubToken: 'ghs_REAL', gatewayKey: 'vck_REAL', previewBypass: 'bypass_REAL' };
const rules = (p: any, host: string) => p.allow[host] as any[];
const blocks = (p: any, host: string, path: string) => {
  const first = rules(p, host).find((r) => !r.match || new RegExp(r.match.path.regex.replace('(?i)', ''), 'i').test(path));
  return Boolean(first?.response && first.response.statusCode === 403);
};

test('the upstream workshop repository is refused on git and the API, whatever the case or slashes', () => {
  const p = lockedPolicy(secrets);
  for (const path of ['/EqualExperts/nam-2026-conference.git/info/refs', '/equalexperts/x', '//EQUALEXPERTS/y']) assert.ok(blocks(p, 'github.com', path), path);
  for (const path of ['/repos/EqualExperts/nam-2026-conference/pulls', '/repos//equalexperts/z']) assert.ok(blocks(p, 'api.github.com', path), path);
  assert.ok(!blocks(p, 'github.com', '/jonasingvar/nam-2026-conference.git/info/refs'));
  assert.ok(!blocks(p, 'api.github.com', '/repos/jonasingvar/nam-2026-conference'));
});

test('credentials exist only in the proxy rules, never in what the agents see', () => {
  assert.ok(!JSON.stringify(AGENT_ENV).match(/ghs_|vck_|bypass_REAL/));
  const p = JSON.stringify(lockedPolicy(secrets));
  assert.ok(p.includes('vck_REAL') && p.includes(Buffer.from('x-access-token:ghs_REAL').toString('base64')));
});

test('the preview bypass reaches only the preview hosts named, never all of vercel.app', () => {
  const p: any = lockedPolicy(secrets, ['nam-2026-conference-abc-jonasingvar-3626.vercel.app']);
  assert.ok(!('*.vercel.app' in p.allow));
  assert.match(JSON.stringify(p.allow['nam-2026-conference-abc-jonasingvar-3626.vercel.app']), /bypass_REAL/);
  const without: any = lockedPolicy(secrets);
  assert.ok(!JSON.stringify(without).includes('bypass_REAL'));
});

test('a preview is asked not to inject the Vercel toolbar, whose host the sandbox cannot reach', () => {
  for (const mode of ['none', 'read', 'push'] as const) {
    const p: any = lockedPolicy(secrets, ['p.vercel.app'], mode);
    assert.equal(p.allow['p.vercel.app'][0].transform[0].headers['x-vercel-skip-toolbar'], '1', mode);
  }
  // The toolbar's own host stays unreachable: skipping it is the fix, not allowing it.
  assert.ok(!('vercel.live' in (lockedPolicy(secrets, ['p.vercel.app'], 'read') as any).allow));
});

test('each mode gets only what it needs: none has no credential, read only the Gateway, push both', () => {
  const none = JSON.stringify(lockedPolicy(secrets, ['p.vercel.app'], 'none'));
  assert.ok(!none.includes('ghs_REAL') && !none.includes(Buffer.from('x-access-token:ghs_REAL').toString('base64')), 'none: no GitHub token');
  assert.ok(!none.includes('vck_REAL') && !none.includes('ai-gateway.vercel.sh'), 'none: no Gateway');
  assert.ok(!none.includes('bypass_REAL'), 'none: no preview bypass');
  const read = JSON.stringify(lockedPolicy(secrets, [], 'read'));
  assert.ok(read.includes('vck_REAL'), 'read: the Gateway, for Claude Code');
  assert.ok(!read.includes('ghs_REAL') && !read.includes(Buffer.from('x-access-token:ghs_REAL').toString('base64')), 'read: no GitHub token');
  const push = JSON.stringify(lockedPolicy(secrets, [], 'push'));
  assert.ok(push.includes('vck_REAL') && push.includes('ghs_REAL'), 'push: both');
  for (const mode of ['none', 'read', 'push'] as const) assert.ok(blocks(lockedPolicy(secrets, [], mode), 'github.com', '/EqualExperts/x'), `${mode}: upstream refused`);
});

// ── The policy a sandbox remembers on its own disk ───────────────────────────
import { isPreviewHost, policySealed, sealPolicy } from '../lib/policy.ts';

test('what a sandbox remembers is believed only under the factory\'s seal', () => {
  const key = 'k1';
  const seal = sealPolicy(key, 'review-46-abc', 'read', ['a.vercel.app']);
  assert.ok(policySealed(key, 'review-46-abc', 'read', ['a.vercel.app'], seal));
  assert.ok(policySealed(key, 'review-46-abc', 'read', ['a.vercel.app'], seal + '\n'), 'a trailing newline from the file is not a mismatch');
  // Code in the sandbox rewrites its mode file, or adds a host, and keeps the old seal.
  assert.ok(!policySealed(key, 'review-46-abc', 'push', ['a.vercel.app'], seal));
  assert.ok(!policySealed(key, 'review-46-abc', 'read', ['a.vercel.app', 'evil.vercel.app'], seal));
  // A push sandbox's seal, copied into another sandbox.
  assert.ok(!policySealed(key, 'ship-46-abc', 'read', ['a.vercel.app'], seal));
  // No seal, a short one, or one made without the key.
  assert.ok(!policySealed(key, 'review-46-abc', 'read', ['a.vercel.app'], ''));
  assert.ok(!policySealed(key, 'review-46-abc', 'read', ['a.vercel.app'], 'abc'));
  assert.ok(!policySealed(key, 'review-46-abc', 'read', ['a.vercel.app'], sealPolicy('guess', 'review-46-abc', 'read', ['a.vercel.app'])));
});

test('the order hosts were added in does not break the seal', () => {
  assert.equal(sealPolicy('k', 'n', 'read', ['b.vercel.app', 'a.vercel.app']), sealPolicy('k', 'n', 'read', ['a.vercel.app', 'b.vercel.app']));
});

test('only a preview deployment\'s own host is a preview host', () => {
  assert.ok(isPreviewHost('nam-2026-conference-abc-jonasingvar-3626.vercel.app'));
  for (const h of ['evil.com', 'vercel.app', 'a.b.vercel.app', 'a.vercel.app.evil.com', "a.vercel.app'; curl evil", '*.vercel.app', '']) assert.ok(!isPreviewHost(h), h);
});
