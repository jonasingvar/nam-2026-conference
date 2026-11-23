import { getWorkflowMetadata, setAttributes } from 'workflow';
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
export type VerifyInput = { sha: string; ref: string; base?: string; fast?: boolean; pr?: number };

export async function verify(input: VerifyInput) {
  'use workflow';
  const { workflowRunId } = getWorkflowMetadata();
  const issue = /^issue-(\d+)-/.exec(input.ref)?.[1];
  await setAttributes({ sha: input.sha.slice(0, 12), ref: input.ref.slice(0, 200), ...(input.pr ? { pr: String(input.pr) } : {}), ...(issue ? { issue } : {}) });
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const box = `verify-${input.sha.slice(0, 8)}-${workflowRunId.slice(-6).toLowerCase()}`;
  const k = kit(box, `verifying ${input.ref} at ${input.sha.slice(0, 7)}`, 'read');
  await setStatus(input.sha, 'factory/verify', 'pending', 'Running the gate…', runUrl);
  const prep = await prepareSandbox(box, input.sha, 'none');
  k.log(`sandbox ${prep.how} in ${prep.seconds}s`);
  const base = input.base || 'main';
  const ran = await k.command('gate', [
    `git checkout -q --detach ${input.sha}`,
    `GATE=$(${input.fast ? 'GATE_SCOPE=branch ' : ''}GATE_BASE=origin/${base} node scripts/gate.mjs 2>"$JOB/gate.err" | tail -1)`,
    // The factory checks itself too, when a commit touches it: typecheck and its own tests.
    `FACTORY=skip; if git diff --name-only origin/${base}...HEAD 2>/dev/null | grep -q '^factory/'; then (cd factory && npm ci --no-audit --no-fund >/dev/null 2>&1 && npx tsc --noEmit -p . && npm test) >"$JOB/factory.log" 2>&1 && FACTORY=ok || FACTORY=failed; fi`,
    `GATE="$GATE" FACTORY="$FACTORY" node -e 'require("fs").writeFileSync(process.env.JOB+"/result.json",JSON.stringify({gate:process.env.GATE,factory:process.env.FACTORY}))'`,
  ].join('\n'));
  await disposeSandbox(box);
  let g: any = null;
  try { g = JSON.parse(ran?.gate || ''); } catch { /* below */ }
  if (!g || typeof g.ok !== 'boolean') {
    await setStatus(input.sha, 'factory/verify', 'error', 'The gate did not report', runUrl);
    return { ok: false, reason: 'no gate result' };
  }
  if (ran.factory === 'failed') { g.ok = false; g.browser.failed.unshift({ test: 'factory: typecheck or tests' }); }
  const line = `unit ${g.unit.passed}${g.unit.failed ? ` (${g.unit.failed} failed)` : ''} · browser ${g.browser.passed}${g.browser.failed.length ? ` (${g.browser.failed.length} failed)` : ''}${g.scope === 'branch' ? ' · specs this change reaches' : ''}${ran.factory === 'ok' ? ' · factory ok' : ''}`;
  await setStatus(input.sha, 'factory/verify', g.ok ? 'success' : 'failure', g.ok ? line : `${g.browser.failed[0]?.test || 'npm test'} — ${line}`, runUrl);
  return { ok: g.ok, line, failed: g.browser.failed.map((f: any) => f.test) };
}
