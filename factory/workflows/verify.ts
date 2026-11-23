import { getWorkflowMetadata } from 'workflow';
import { kit } from '../lib/kit';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { setStatus } from '../lib/github-steps';
import { FACTORY_DASHBOARD } from '../lib/constants';

/**
 * verify — CI, on Vercel. Every push to a pull request and to main runs the
 * gate (`scripts/gate.mjs`: npm test, then Playwright on desktop and mobile)
 * in a sandbox forked from the warm one, and reports a commit status,
 * `factory/verify`. A `ship:fast` pull request runs only the browser specs its
 * change reaches; main always runs everything.
 */
export type VerifyInput = { sha: string; ref: string; base?: string; fast?: boolean };

export async function verify(input: VerifyInput) {
  'use workflow';
  const { workflowRunId } = getWorkflowMetadata();
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const box = `verify-${input.sha.slice(0, 8)}-${workflowRunId.slice(-6).toLowerCase()}`;
  const k = kit(box, `verifying ${input.ref} at ${input.sha.slice(0, 7)}`);
  await setStatus(input.sha, 'factory/verify', 'pending', 'Running the gate…', runUrl);
  const prep = await prepareSandbox(box, input.base || 'main');
  k.log(`sandbox ${prep.how} in ${prep.seconds}s`);
  const base = input.base || 'main';
  const ran = await k.command('gate', [
    `git fetch -q origin ${input.sha} 2>/dev/null || git fetch -q origin`,
    `git checkout -q --detach ${input.sha}`,
    `[ "$(sha256sum package-lock.json | cut -c1-16)" = "$(cat /vercel/.factory/prepared)" ] || npm ci --no-audit --no-fund >/dev/null 2>&1`,
    `GATE=$(${input.fast ? 'GATE_SCOPE=branch ' : ''}GATE_BASE=origin/${base} node scripts/gate.mjs 2>"$JOB/gate.err" | tail -1)`,
    `GATE="$GATE" node -e 'require("fs").writeFileSync(process.env.JOB+"/result.json",JSON.stringify({gate:process.env.GATE}))'`,
  ].join('\n'));
  await disposeSandbox(box);
  let g: any = null;
  try { g = JSON.parse(ran?.gate || ''); } catch { /* below */ }
  if (!g || typeof g.ok !== 'boolean') {
    await setStatus(input.sha, 'factory/verify', 'error', 'The gate did not report', runUrl);
    return { ok: false, reason: 'no gate result' };
  }
  const line = `unit ${g.unit.passed}${g.unit.failed ? ` (${g.unit.failed} failed)` : ''} · browser ${g.browser.passed}${g.browser.failed.length ? ` (${g.browser.failed.length} failed)` : ''}${g.scope === 'branch' ? ' · specs this change reaches' : ''}`;
  await setStatus(input.sha, 'factory/verify', g.ok ? 'success' : 'failure', g.ok ? line : `${g.browser.failed[0]?.test || 'npm test'} — ${line}`, runUrl);
  return { ok: g.ok, line, failed: g.browser.failed.map((f: any) => f.test) };
}
