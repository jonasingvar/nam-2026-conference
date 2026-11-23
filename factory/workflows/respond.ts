import { getWorkflowMetadata } from 'workflow';
import { kit, checkoutPr } from '../lib/kit';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { comment, readPullRequest } from '../lib/github-steps';
import { FACTORY_DASHBOARD } from '../lib/constants';
import * as S from './schemas';

/**
 * respond — `@claude …` on a pull request: make the change asked for, and
 * nothing else, prove it with the gate, push, reply. The spec is kept true
 * too: a fix that changes what the spec decided says so in it.
 */
export type RespondInput = { pr: number; ask: string; author: string };

export async function respond(input: RespondInput) {
  'use workflow';
  const { workflowRunId } = getWorkflowMetadata();
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const pr = await readPullRequest(input.pr);
  if (pr.state !== 'open') return { outcome: 'skipped', reason: 'not open' };
  const box = `respond-${pr.number}-${workflowRunId.slice(-8).toLowerCase()}`;
  const k = kit(box, `answering a request on pull request #${pr.number}`);
  await comment(pr.number, `👀 On it, @${input.author} — [run](${runUrl})`);

  await prepareSandbox(box, pr.headSha);
  const co = await k.command('checkout', checkoutPr(pr.number, pr.head, pr.base));
  if (!co) { await disposeSandbox(box); await comment(pr.number, `Could not check out ${pr.head}. [run](${runUrl})`); return { outcome: 'failed' }; }

  const change = await k.agent('change',
    `@${input.author} asked, on pull request #${pr.number} "${pr.title}" (branch ${pr.head}):\n\n"${input.ask}"\n\n` +
    `Make the change asked for, and nothing else. Read the conversation for context first (\`gh pr view ${pr.number} --comments\`). If a spec in specs/ for this branch ` +
    `records a decision this changes, update the spec too. Keep the context docs true (\`node scripts/context.mjs for <changed files>\`). \`npm test\` after every edit; ` +
    `a browser test you add or change runs alone by title. Never edit an existing test to make it pass. Commit in Conventional Commits and push. ` +
    `If the ask is a question rather than a change, answer it and change nothing. Leave \`git status\` clean.`,
    S.RESPONSE, 'sonnet');

  let gateLine = '';
  if (change?.changed) {
    const g = await k.command('gate', [
      `GATE=$(GATE_SCOPE=branch GATE_BASE=origin/${pr.base} node scripts/gate.mjs 2>"$JOB/gate.err" | tail -1)`,
      `GATE="$GATE" node -e 'require("fs").writeFileSync(process.env.JOB+"/result.json",JSON.stringify({gate:process.env.GATE}))'`,
    ].join('\n'));
    try {
      const r = JSON.parse(g?.gate || '');
      gateLine = r.ok ? `✅ gate green — unit ${r.unit.passed}, browser ${r.browser.passed} (the specs this change reaches)` : `❌ gate red — ${[...(r.unit.failed ? ['npm test'] : []), ...r.browser.failed.map((x: any) => x.test)].join(', ')}`;
    } catch { gateLine = '⚠️ the gate did not report'; }
  }
  await comment(pr.number, [
    change ? change.reply : `I could not finish that. [run](${runUrl})`,
    gateLine ? `\n${gateLine}` : '',
    `\n<sub>🏭 Factory · ${k.spendLine()} · [run](${runUrl})</sub>`,
  ].filter(Boolean).join('\n'));
  await disposeSandbox(box);
  return { outcome: change?.changed ? 'changed' : 'answered', gate: gateLine, spend: k.spend.total };
}
