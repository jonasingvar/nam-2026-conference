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
