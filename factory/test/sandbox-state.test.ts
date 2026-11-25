import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GITHUB_TOKEN ||= 'test-github-token';
process.env.AI_GATEWAY_API_KEY ||= 'test-gateway-key';
const { trustedState, writeState } = await import('../lib/sandbox-steps');

/** A sandbox whose disk is a temp directory: the real shell commands run, against `<dir>` for /vercel/.factory. */
function fakeSandbox(name: string, dir = mkdtempSync(join(tmpdir(), 'sbx-'))) {
  const sb: any = {
    name, dir,
    async runCommand({ args }: { args: string[] }) {
      let out = '', code = 0;
      try { out = execFileSync('bash', ['-c', args[1].replaceAll('/vercel/.factory', dir)], { encoding: 'utf8' }); } catch (e: any) { code = e.status ?? 1; out = e.stdout ?? ''; }
      return { exitCode: code, stdout: async () => out, stderr: async () => '' };
    },
  };
  return sb;
}

test('what the factory wrote comes back; with no hosts too', async () => {
  const sb = fakeSandbox('review-46-abc');
  await writeState(sb, 'read', ['a.vercel.app', 'b.vercel.app']);
  assert.deepEqual(await trustedState(sb), { mode: 'read', hosts: ['a.vercel.app', 'b.vercel.app'] });
  await writeState(sb, 'push', []);
  assert.deepEqual(await trustedState(sb), { mode: 'push', hosts: [] });
});

test('a sandbox that was never prepared has no access', async () => {
  assert.deepEqual(await trustedState(fakeSandbox('fresh')), { mode: 'none', hosts: [] });
});

test('code in the sandbox that rewrites its mode gets nothing, not more', async () => {
  const sb = fakeSandbox('review-46-abc');
  await writeState(sb, 'read', ['a.vercel.app']);
  writeFileSync(join(sb.dir, 'mode'), 'push\n');
  assert.deepEqual(await trustedState(sb), { mode: 'none', hosts: [] });
});

test('code in the sandbox that adds a host gets nothing, not more', async () => {
  const sb = fakeSandbox('qa-46-abc');
  await writeState(sb, 'read', ['a.vercel.app']);
  appendFileSync(join(sb.dir, 'preview-hosts'), 'evil.vercel.app\n');
  assert.deepEqual(await trustedState(sb), { mode: 'none', hosts: [] });
});

test('a push sandbox\'s files copied into another sandbox are not believed', async () => {
  const push = fakeSandbox('ship-46-abc');
  await writeState(push, 'push', []);
  const other = fakeSandbox('review-46-abc', push.dir);
  assert.deepEqual(await trustedState(other), { mode: 'none', hosts: [] });
});

test('a host that is not a preview deployment is never written', async () => {
  const sb = fakeSandbox('qa-46-abc');
  await writeState(sb, 'read', ['a.vercel.app', "x'; touch /tmp/pwned; '", 'evil.com']);
  assert.equal(readFileSync(join(sb.dir, 'preview-hosts'), 'utf8'), 'a.vercel.app\n');
  assert.deepEqual(await trustedState(sb), { mode: 'read', hosts: ['a.vercel.app'] });
});
