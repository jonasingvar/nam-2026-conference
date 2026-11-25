import { getWorkflowMetadata, setAttributes } from 'workflow';
import { kit, checkoutPr } from '../lib/kit';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { comment, progress, readPullRequest, setDraft, setLabels } from '../lib/github-steps';
import { chooseModels, describe, modelBook } from '../lib/models';
import { FACTORY_DASHBOARD } from '../lib/constants';
import type { Intent } from '../lib/intent';
import { respondCard, readLine, type RespondPhase, type RespondView } from '../lib/respond-view';
import { stopwatch, timeLine } from '../lib/timing';
import * as S from './schemas';

/**
 * respond — a comment on a pull request (or its ticket) that asks for something:
 * a small ship, aimed at that one comment. Read → Change → Gate → Push → Reply:
 * one agent makes the change asked for and nothing else, and commits; the gate
 * runs on that commit; a red gate gets one fix and a second gate; then the run
 * pushes and replies. A question is answered and nothing is changed. One card
 * on the pull request (lib/respond-view.ts) shows each step as it happens. The
 * spec is kept true too: a fix that changes what the spec decided says so in it.
 */
/**
 * `issue`: the ticket the request was made on, when it was not made on the pull request itself.
 * `read`: how Jev read a plain comment; absent for `/fix` and `@claude`.
 */
export type RespondInput = { pr: number; ask: string; author: string; issue?: number; read?: { intent: Intent; sure: number | null } };

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
  await setAttributes({ pr: String(pr.number), ...(pr.issue ? { issue: String(pr.issue) } : {}), ...(input.read ? { intent: input.read.intent } : {}) });
  if (pr.state !== 'open') return { outcome: 'skipped', reason: 'not open' };
  const box = `respond-${pr.number}-${workflowRunId.slice(-8).toLowerCase()}`;
  const k = kit(box, `answering a request on pull request #${pr.number}`);

  // One card on the pull request, rewritten as the run moves: how the comment was read, the model, the phase, the cost.
  const time = stopwatch(Date.now(), 'Read');
  const view: RespondView = { phase: 'Read', ask: input.ask, author: input.author, issue: input.issue, read: input.read, runUrl };
  let card: number | null = null;
  const show = async (phase: RespondPhase | null, more: Partial<RespondView> = {}) => {
    if (phase && phase !== view.phase) time.enter(phase, Date.now());
    Object.assign(view, more, { phase });
    const models = k.models;
    card = await progress(pr.number, card, respondCard({
      ...view,
      ...(models && models.table() ? { table: models.table() } : {}),
      ...(k.spend.agents ? { spend: k.spendLine() } : {}),
      time: timeLine(time.read(Date.now()), { phases: true }),
    }), []);
  };
  // A change is coming: the pull request is not mergeable while the factory works on it again, and the
  // ticket says who has it. A comment Jev read as a question changes nothing, so it holds nothing.
  const holds = input.read?.intent !== 'question';
  const ticket = pr.issue ?? input.issue ?? null;
  let drafted = false;
  if (holds) {
    drafted = await setDraft(pr.number, true).catch(() => false);
    // ai-working, and no other status label, on the ticket and on the pull request.
    for (const n of [ticket, pr.number]) if (n) await setLabels(n, ['ai-working'], ['ready-for-human', 'needs-human', 'ready-for-ai']).catch(() => null);
  }
  /** Hand it back: ready for a person again — unless what was pushed is red, which stays a draft. */
  const release = async (mergeable: boolean) => {
    if (!holds) return;
    if (drafted && mergeable) await setDraft(pr.number, false).catch(() => null);
    await setLabels(pr.number, [], ['ai-working']).catch(() => null);
    if (ticket) await setLabels(ticket, ['ready-for-human'], ['ai-working']).catch(() => null);
  };
  try {
    return await work();
  } catch (e) {
    await release(true);
    throw e;
  }

  async function work() {
  await show('Read', drafted ? { held: true } : {});
  // Asked on the ticket: say there that it was heard, how it was read, and where the answer will be.
  if (input.issue) await comment(input.issue, `👀 On it — read as ${readLine(input.read)}. Progress and the reply are on pull request #${pr.number} · [run](${runUrl})`).catch(() => null);

  await prepareSandbox(box, pr.headSha, 'push');
  const co = await k.command('checkout', checkoutPr(pr.number, pr.head, pr.base));
  if (!co) { await disposeSandbox(box); await release(true); await show(null, { outcome: 'failed', held: false }); await comment(pr.number, `Could not check out ${pr.head}. [run](${runUrl})`); return { outcome: 'failed' }; }

  // The model for the change: Jev reads the ask and the pull request; a docs-only fix from review is cheap work.
  const choice = await chooseModels(`Pull request #${pr.number}: ${pr.title}\n\n${pr.body.slice(0, 3000)}\n\nAsked by ${input.author}: ${input.ask}`, 'small', ['respond']);
  const models = modelBook(choice, 'small');
  k.useModels(models);
  k.log(`respond on ${describe(models.pick('respond'))}`);
  await show('Change', { model: `\`${describe(models.pick('respond')).replace(/ \(/, '` (')}` });
  const change = await k.agent('change',
    `${input.author} asked, on pull request #${pr.number} "${pr.title}" (branch ${pr.head}):\n\n"${input.ask}"\n\n` +
    `Make the change asked for, and nothing else. Read the conversation for context first (\`gh pr view ${pr.number} --comments\`). If a spec in specs/ for this branch ` +
    `records a decision this changes, update the spec too. Keep the context docs true (\`node scripts/context.mjs for <changed files>\`). \`npm test\` after every edit; ` +
    `a browser test you add or change runs alone by title — never run the whole browser suite. Never edit an existing test to make it pass. Commit in Conventional Commits. Do NOT push: ` +
    `the run tests your commit and pushes it. If the ask is a question rather than a change, answer it and change nothing. Leave \`git status\` clean.`,
    S.RESPONSE, 'respond');

  // The gate on the commit before anyone sees it: red gets one fix, aimed at what failed, and a second gate.
  // Then the push — green or not, so the work is never lost; a red one says so, here and on the commit's status.
  const runGate = async (label: string) => {
    const g = await k.command(label, [
      // Tight: the unit tests, and only the browser specs this request's own commits touched (the smoke spec when
      // they touched none). The push starts verify, which runs what else the change reaches, beside the person.
      `SPECS=$(git diff --name-only --diff-filter=d ${pr.headSha}..HEAD -- 'tests/*.spec.js' | grep -v qa-probe | tr '\n' ' ')`,
      `GATE=$(GATE_SPECS="\${SPECS:-tests/smoke.spec.js}" GATE_BASE=${pr.headSha} node scripts/gate.mjs 2>"$JOB/gate.err" | tail -1)`,
      `GATE="$GATE" node -e 'require("fs").writeFileSync(process.env.JOB+"/result.json",JSON.stringify({gate:process.env.GATE}))'`,
    ].join('\n'));
    try {
      const r = JSON.parse(g?.gate || '');
      const failed: { test: string; error?: string }[] = [...(r.unit.failed ? [{ test: 'npm test' }] : []), ...r.browser.failed];
      return { ok: Boolean(r.ok), failed, line: r.ok ? `✅ green — unit ${r.unit.passed}, browser ${r.browser.passed} (the specs this request touched; verify runs the rest)` : `❌ red — ${failed.map((x) => x.test).join(', ')}` };
    } catch { return { ok: false, failed: [], line: '⚠️ the gate did not report' }; }
  };
  let gateLine = '';
  let pushed = false;
  let green = true;
  if (change?.changed) {
    await show('Gate');
    let g = await runGate('gate');
    gateLine = g.line;
    if (!g.ok && g.failed.length) {
      await show('Gate', { doing: 'Fixing what the gate found', gate: `round 1 ${g.line}` });
      await k.agent('fix',
        `You are finishing a change ${input.author} asked for on pull request #${pr.number} (branch ${pr.head}): "${input.ask}"\n\n` +
        `The change is committed, not pushed, and the gate is red on it:\n\n${g.failed.slice(0, 8).map((f) => `- ${f.test}${f.error ? `\n  ${String(f.error).split('\n').slice(0, 3).join('\n  ')}` : ''}`).join('\n')}\n\n` +
        `Fix the code so these pass — the change asked for must still be there. Never edit an existing test to make it pass, unless the ask itself changed what it checks. ` +
        `Run a failing browser test alone by title. Commit in Conventional Commits. Do NOT push. Leave \`git status\` clean.`,
        S.RESPONSE, 'respond');
      await show('Gate', { doing: 'Gate, after the fix' });
      const again = await runGate('gate#2');
      gateLine = `round 1 ${g.line} → after one fix ${again.line}`;
      g = again;
    }
    green = g.ok;
    await show('Push', { doing: undefined, gate: gateLine });
    const sq = `'${pr.head.replaceAll("'", `'\\''`)}'`;
    const out = await k.command('push', `git push -q origin HEAD:refs/heads/${sq} >"$JOB/push.log" 2>&1; echo "{\\"ok\\":$([ $? = 0 ] && echo true || echo false),\\"sha\\":\\"$(git rev-parse --short HEAD)\\"}" > "$JOB/result.json"`);
    pushed = Boolean(out?.ok);
    gateLine = `${gateLine}${pushed ? ` · pushed as ${out.sha}` : ' · ⚠️ the push failed — nothing reached the branch'}`;
  }
  await show('Reply', gateLine ? { gate: gateLine } : {});
  await comment(pr.number, [
    change ? change.reply : `I could not finish that. [run](${runUrl})`,
    gateLine ? `\n**Gate:** ${gateLine}` : '',
    `\n<sub>🏭 Factory · ${models.summary()} · ${k.spendLine()} · [run](${runUrl})</sub>`,
  ].filter(Boolean).join('\n'));
  await disposeSandbox(box);
  // Red and pushed: it stays a draft, so it cannot be merged as it is.
  const stays = drafted && pushed && !green;
  await release(!stays);
  await show(null, { outcome: !change || (change.changed && !pushed) ? 'failed' : change.changed ? 'changed' : 'answered', held: stays });
  await setAttributes({ outcome: change?.changed ? 'changed' : 'answered', spend_usd: k.spend.total.toFixed(2), models: models.summary().slice(0, 250), est_usd: models.totals().est.toFixed(2) });
  return { outcome: change?.changed ? 'changed' : 'answered', gate: gateLine, spend: k.spend.total };
  }
}
