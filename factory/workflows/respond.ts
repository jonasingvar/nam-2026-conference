import { getWorkflowMetadata, setAttributes } from 'workflow';
import { kit, checkoutPr } from '../lib/kit';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { comment, readPullRequest } from '../lib/github-steps';
import { chooseModels, describe, modelBook } from '../lib/models';
import { FACTORY_DASHBOARD } from '../lib/constants';
import * as S from './schemas';

/**
 * respond — `@claude …` on a pull request: make the change asked for, and
 * nothing else, prove it with the gate, push, reply. The spec is kept true
 * too: a fix that changes what the spec decided says so in it.
 */
/** `issue`: the ticket the request was made on, when it was not made on the pull request itself. */
export type RespondInput = { pr: number; ask: string; author: string; issue?: number };

export async function respond(input: RespondInput) {
  'use workflow';
  try {
    return await respondRun(input);
  } catch (e: any) {
    const { workflowRunId } = getWorkflowMetadata();
    await disposeSandbox(`respond-${input.pr}-${workflowRunId.slice(-8).toLowerCase()}`).catch(() => null);
    await comment(input.pr, `I could not finish that: \`${String(e?.message || e).slice(0, 200)}\``).catch(() => null);
    return { outcome: 'failed', reason: String(e?.message || e).slice(0, 200) };
  }
}

async function respondRun(input: RespondInput) {
  const { workflowRunId } = getWorkflowMetadata();
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const pr = await readPullRequest(input.pr);
  await setAttributes({ pr: String(pr.number), ...(pr.issue ? { issue: String(pr.issue) } : {}) });
  if (pr.state !== 'open') return { outcome: 'skipped', reason: 'not open' };
  const box = `respond-${pr.number}-${workflowRunId.slice(-8).toLowerCase()}`;
  const k = kit(box, `answering a request on pull request #${pr.number}`);
  // No @-mention: the reply should not notify anyone twice.
  await comment(pr.number, `👀 On it — asked by ${input.author}${input.issue ? ` on #${input.issue}` : ''} · [run](${runUrl})`);
  // Asked on the ticket: say there that it was heard, and where the answer will be.
  if (input.issue) await comment(input.issue, `👀 On it — the reply will be on pull request #${pr.number} · [run](${runUrl})`).catch(() => null);

  await prepareSandbox(box, pr.headSha, 'push');
  const co = await k.command('checkout', checkoutPr(pr.number, pr.head, pr.base));
  if (!co) { await disposeSandbox(box); await comment(pr.number, `Could not check out ${pr.head}. [run](${runUrl})`); return { outcome: 'failed' }; }

  // The model for the change: Jev reads the ask and the pull request; a docs-only fix from review is cheap work.
  const choice = await chooseModels(`Pull request #${pr.number}: ${pr.title}\n\n${pr.body.slice(0, 3000)}\n\nAsked by ${input.author}: ${input.ask}`, 'small', ['respond']);
  const models = modelBook(choice, 'small');
  k.useModels(models);
  k.log(`respond on ${describe(models.pick('respond'))}`);
  const change = await k.agent('change',
    `${input.author} asked, on pull request #${pr.number} "${pr.title}" (branch ${pr.head}):\n\n"${input.ask}"\n\n` +
    `Make the change asked for, and nothing else. Read the conversation for context first (\`gh pr view ${pr.number} --comments\`). If a spec in specs/ for this branch ` +
    `records a decision this changes, update the spec too. Keep the context docs true (\`node scripts/context.mjs for <changed files>\`). \`npm test\` after every edit; ` +
    `a browser test you add or change runs alone by title. Never edit an existing test to make it pass. Commit in Conventional Commits and push. ` +
    `If the ask is a question rather than a change, answer it and change nothing. Leave \`git status\` clean.`,
    S.RESPONSE, 'respond');

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
    `\n<sub>🏭 Factory · ${models.summary()} · ${k.spendLine()} · [run](${runUrl})</sub>`,
  ].filter(Boolean).join('\n'));
  await disposeSandbox(box);
  await setAttributes({ outcome: change?.changed ? 'changed' : 'answered', spend_usd: k.spend.total.toFixed(2), models: models.summary().slice(0, 250), est_usd: models.totals().est.toFixed(2) });
  return { outcome: change?.changed ? 'changed' : 'answered', gate: gateLine, spend: k.spend.total };
}
