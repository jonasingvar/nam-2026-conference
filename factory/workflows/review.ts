import { getWorkflowMetadata } from 'workflow';
import { kit, checkoutPr } from '../lib/kit';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { comment, fileIssue, readIssue, readMarker, readPullRequest, setLabels, setStatus } from '../lib/github-steps';
import { FACTORY_DASHBOARD } from '../lib/constants';
import * as S from './schemas';

/**
 * review — a pull request read by agents that never saw it written.
 *
 * Lenses are picked by what the diff touches (app code: criteria, rules,
 * logic, tests; workflows; docs; the factory itself). Every blocker must name
 * how a person reaches it and what they lose, and survive a skeptic; anything
 * less is a follow-up, filed as an issue, never a red check. A re-review
 * rechecks the last pass's blockers and hunts only in what was pushed since —
 * so a round that fixed what it was told ends green.
 *
 * The verdict is a commit status (`factory/review`) and one comment carrying
 * a marker the next pass reads back. Machines gate, agents advise: nothing
 * here can block a merge.
 */
export type ReviewInput = { pr: number; notes?: string };

type Lens = { key: string; ask: string };
const LENSES: Record<string, string> = {
  combined: 'Every Done-when criterion traced to what satisfies it and the test that proves it; then the diff against CLAUDE.md and .claude/rules/; then logic errors; then changes the ticket did not ask for.',
  criteria: 'For each Done-when criterion, find what satisfies it and the test that proves it. Nothing satisfying it is a blocker. So is a change the ticket did not ask for that a reviewer would not expect (category unasked).',
  rules: 'The diff against CLAUDE.md and the .claude/rules/ file for each area it touches: a recorded decision contradicted — quote the rule and the line.',
  logic: 'Logic errors: for each, an input a person gives in normal use and the wrong output it produces.',
  tests: 'Tests that prove nothing: one asserting the implementation against itself, one that would pass before the change, an existing test weakened. The red-check result below is evidence, not a verdict — a refactor passes it either way.',
  actions: 'GitHub Actions defects: a trigger that cannot fire as intended, an `if:` wrong for a concrete payload (say which), untrusted text reaching a `run:` script, a token broader than the step needs.',
  docs: 'Docs that are false: CLAUDE.md, context/ and the playbooks are read *instead of* the code. A claim the code does not bear out, two docs that disagree, or an instruction an agent would follow into a wrong action.',
  orchestration: 'Factory defects (factory/, scripts/): a path where a dead agent reads as a pass, an unbounded loop, two jobs sharing ports at once, a secret reaching the sandbox, a prompt contradicting the playbook it cites.',
};

export async function review(input: ReviewInput) {
  'use workflow';
  const { workflowRunId } = getWorkflowMetadata();
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const pr = await readPullRequest(input.pr);
  if (pr.state !== 'open' || pr.draft) return { verdict: 'none', reason: pr.draft ? 'draft' : 'not open' };
  const box = `review-${pr.number}-${workflowRunId.slice(-8).toLowerCase()}`;
  const k = kit(box, `reviewing pull request #${pr.number}`);
  await setStatus(pr.headSha, 'factory/review', 'pending', 'Reviewing…', runUrl);

  const issue = pr.issue ? await readIssue(pr.issue).catch(() => null) : null;
  const previous = await readMarker(pr.number, 'factory-verdict:review');

  await prepareSandbox(box, pr.headSha);
  const co = await k.command('checkout', checkoutPr(pr.number, pr.head, pr.base));
  if (!co) { await disposeSandbox(box); await setStatus(pr.headSha, 'factory/review', 'error', 'Could not check out the pull request', runUrl); return { verdict: 'none', reason: 'checkout failed' }; }

  // Facts, from commands: which files, how big, how risky, does the delta's base exist, do the new tests fail without the change.
  const facts = await k.command('facts', [
    `FILES=$(git diff --name-only origin/${pr.base}...HEAD | paste -sd, -)`,
    `FACTS=$(node scripts/qa-facts.mjs origin/${pr.base} 2>/dev/null | tail -1)`,
    `RED=$(GATE_BASE=origin/${pr.base} node scripts/red-check.mjs 2>/dev/null | tail -1)`,
    previous?.commit ? `git cat-file -e ${previous.commit} 2>/dev/null || git fetch -q origin ${previous.commit} 2>/dev/null; DELTA=$(git diff --name-only ${previous.commit} HEAD 2>/dev/null | paste -sd, -)` : 'DELTA=""',
    `FILES="$FILES" FACTS="$FACTS" RED="$RED" DELTA="$DELTA" node -e 'const e=process.env;require("fs").writeFileSync(e.JOB+"/result.json",JSON.stringify({files:(e.FILES||"").split(",").filter(Boolean),facts:e.FACTS,red:e.RED,delta:(e.DELTA||"").split(",").filter(Boolean)}))'`,
  ].join('\n'));
  const files: string[] = facts?.files ?? [];
  const f = String(facts?.facts || '');
  const lines = Number((/--code-lines=(\d+)/.exec(f) || [])[1] || 0);
  const docsOnly = /--docs-only=yes/.test(f);
  const risky = /--risky=yes/.test(f);

  // Which lenses: by kind of file; light (one combined lens) for small or docs-only changes.
  const app = files.some((p) => /^(src|server|api|public)\//.test(p));
  const kinds = new Set<string>();
  if (app) ['criteria', 'rules', 'logic', 'tests'].forEach((l) => kinds.add(l));
  if (files.some((p) => p.startsWith('.github/workflows/'))) kinds.add('actions');
  if (files.some((p) => /^(CLAUDE\.md|context\/|\.claude\/skills\/|specs\/)/.test(p))) kinds.add('docs');
  if (files.some((p) => /^(factory\/|scripts\/|\.claude\/settings\.json)/.test(p))) { kinds.add('orchestration'); kinds.add('logic'); kinds.add('tests'); }
  const full = pr.labels.includes('ship:full') || risky || kinds.has('orchestration') || (!pr.head.startsWith('issue-') && lines > 150);
  const lenses: Lens[] = (full || docsOnly ? [...kinds] : ['combined', ...[...kinds].filter((x) => ['actions', 'orchestration'].includes(x))])
    .filter((x, i, a) => a.indexOf(x) === i)
    .map((key) => ({ key, ask: LENSES[key] }));
  if (!lenses.length) lenses.push({ key: 'combined', ask: LENSES.combined });
  const model = full ? 'opus' : 'sonnet';
  k.log(`${lenses.map((l) => l.key).join(', ')} on ${model}; ${files.length} files, ${lines} code lines${risky ? ', risky' : ''}`);

  const ticket = issue ? `The ticket, #${issue.number}: ${issue.title}\n\n${issue.body}\n` : `There is no linked ticket: judge the pull request against its own description.\n`;
  const scope = previous?.commit && facts?.delta
    ? `\nThis is a re-review. The last pass reviewed ${previous.commit.slice(0, 7)}; look for NEW problems only in what changed since: ${facts.delta.join(', ') || 'nothing'} (\`git diff ${previous.commit} HEAD\`). Outside that, raise only what would have blocked a first review.\n`
    : '';

  // 1. Recheck the last pass's blockers, at this head.
  k.setPhase('recheck');
  const stillOpen: any[] = [];
  for (const b of previous?.blockers || []) {
    const r = await k.agent(`recheck:${b.category}`,
      `${ticket}\nOn pull request #${pr.number} (branch ${pr.head}), the last review raised this blocker at ${previous.commit.slice(0, 7)}:\n` +
      `[${b.category}] ${b.file}${b.line ? ':' + b.line : ''} — ${b.claim}\n\nIs it resolved at HEAD? Resolved means what was claimed can no longer happen. Read the lines; cite them.`,
      S.RECHECK, 'sonnet', 'low');
    if (!r || !r.resolved) stillOpen.push({ ...b, evidence: r?.evidence ?? 'the recheck did not finish' });
  }

  // 2. The lenses, in parallel; one that dies is run once more.
  k.setPhase('lenses');
  const ask = (l: Lens) =>
    `${ticket}${input.notes ? `\nThe person who asked for this review wrote: "${input.notes}"\n` : ''}\n` +
    `You are reviewing pull request #${pr.number} "${pr.title}" (branch ${pr.head} into ${pr.base}) as someone who did not write it and has not seen the reasoning that produced it. ` +
    `Read context/engineering-context/harness/code-review-playbook.md §1–§4 first (\`awk '/^## 1\\./,/^## 5\\./' context/engineering-context/harness/code-review-playbook.md\`). ` +
    `Form your own view from the ticket and \`git diff origin/${pr.base}...HEAD\` before reading any comments on the pull request.\n\n` +
    `Your lens: ${l.ask}\n` +
    (l.key === 'tests' || l.key === 'combined' ? `\nThe red-check (app code reverted to ${pr.base}, the branch's new tests run): ${facts?.red || 'not run'}\n` : '') +
    scope +
    `\nA blocker must say how a person reaches it in normal use (how) and what they lose (harm); without both it is a follow-up. At most three findings. ` +
    `Every finding cites file:line, read from the line. Confidence is how much of the change you could actually judge. Empty is a good answer.`;
  const first = await Promise.all(lenses.map((l) => k.agent(`lens:${l.key}`, ask(l), S.REVIEW_LENS, model)));
  const reports = await Promise.all(lenses.map((l, i) => first[i] ? Promise.resolve(first[i]) : k.agent(`lens:${l.key}-retry`, ask(l), S.REVIEW_LENS, model)));

  // 3. Every new blocker faces a skeptic; one with no how or harm is a follow-up already.
  k.setPhase('skeptic');
  const raised = reports.filter(Boolean).flatMap((r: any) => r.findings as any[]);
  const asBlocker = raised.filter((x) => x.severity === 'blocker' && x.how && x.harm);
  const followUps = raised.filter((x) => !(x.severity === 'blocker' && x.how && x.harm));
  const judged = await Promise.all(asBlocker.map((b) => k.agent(`skeptic:${b.category}`,
    `${ticket}\nA reviewer of pull request #${pr.number} claims this blocker. Try to REFUTE it: open the cited file and line; refuted if the line does not say what is claimed, ` +
    `if it is already on origin/${pr.base}, if it is style, or if the code, its tests or its spec show it was deliberate. Contrived if it is real but only reachable from an input nobody gives ` +
    `in normal use (a hand-edited URL, a forged request). If you cannot tell, it is confirmed.\n\n[${b.category}] ${b.file}${b.line ? ':' + b.line : ''} — ${b.claim}\nhow: ${b.how}\nharm: ${b.harm}\nevidence: ${b.evidence}`,
    S.SKEPTIC, 'sonnet', 'medium')));
  const confirmed: any[] = [];
  asBlocker.forEach((b, i) => {
    const v = judged[i]?.verdict ?? 'confirmed';
    if (v === 'confirmed') confirmed.push(b);
    else if (v === 'contrived') followUps.push({ ...b, severity: 'follow-up', claim: `${b.claim} (contrived: ${judged[i].why})` });
  });

  // 4. The verdict, composed by the script — no model shapes its own verdict.
  const blockers = [...stillOpen, ...confirmed].slice(0, 3);
  const missing = reports.some((r) => !r);
  const confidences = reports.filter(Boolean).map((r: any) => r.confidence);
  const confidence = missing ? 'low' : confidences.includes('low') ? 'low' : confidences.includes('medium') ? 'medium' : 'high';
  const pass = blockers.length === 0;
  const filedBefore = new Set<string>(previous?.followUps || []);
  const fkey = (x: any) => `${x.category}|${x.file}|${x.line ? Math.floor(x.line / 10) : ''}`;
  const toFile = followUps.filter((x) => !filedBefore.has(fkey(x))).slice(0, 3);
  const filed: string[] = [];
  for (const x of toFile) {
    const i = await fileIssue(`Follow-up from #${pr.number}: ${x.claim}`.slice(0, 120),
      `Raised by the factory's review of #${pr.number}, not a blocker.\n\n\`${x.file}${x.line ? ':' + x.line : ''}\` — ${x.claim}\n\n${x.evidence ? `Evidence: ${x.evidence}\n` : ''}${x.how ? `How: ${x.how}\n` : ''}`, ['follow-up']).catch(() => null);
    if (i) filed.push(`#${i.number}`);
  }
  const callout = pass ? (confidence === 'high' ? '> [!TIP]' : confidence === 'medium' ? '> [!NOTE]' : '> [!WARNING]') : '> [!CAUTION]';
  const meter = { high: '●●●', medium: '●●○', low: '●○○' }[confidence as 'high'];
  const summary = reports.filter(Boolean).map((r: any) => r.covered).join(' · ');
  const marker = { pass: 'review', commit: co.head, blockers: blockers.map((b) => ({ category: b.category, file: b.file, line: b.line, claim: b.claim })), followUps: [...filedBefore, ...toFile.map(fkey)] };
  await comment(pr.number, [
    callout,
    `> ### Code review · ${pass ? `${confidence} confidence${confidence === 'low' ? ' — unproven' : ''} &nbsp; \`${meter}\`` : 'blocker'}`,
    `> ${summary || 'Nothing to report.'}`,
    '',
    ...blockers.map((b) => `**${b.category}** \`${b.file}${b.line ? ':' + b.line : ''}\` — ${b.claim}\n${b.how ? `*How:* ${b.how} · ` : ''}${b.harm ? `*Harm:* ${b.harm}` : b.evidence ? `*Evidence:* ${b.evidence}` : ''}\n`),
    followUps.length ? `#### Follow-ups\nNot blockers, so they do not colour the check${filed.length ? ` — filed as ${filed.join(', ')}` : ''}.\n\n${followUps.slice(0, 5).map((x) => `- \`${x.file}${x.line ? ':' + x.line : ''}\` ${x.claim}`).join('\n')}` : '',
    '',
    `<sub>🏭 Factory review · ${lenses.map((l) => l.key).join(', ')} · ${model} · ${k.spendLine()} · [run](${runUrl})</sub>`,
    `<!-- factory-verdict:review ${JSON.stringify(marker)} -->`,
  ].filter((l) => l !== '').join('\n'));
  await setStatus(pr.headSha, 'factory/review', pass ? 'success' : 'failure', pass ? `${confidence} confidence${confidence === 'low' ? ' (unproven)' : ''}` : blockers[0].claim, runUrl);
  // A blocker on a pull request ship built is something ship's own loop let through.
  if (!pass && /^issue-\d+-/.test(pr.head)) await setLabels(pr.number, ['harness-escape'], []);
  await disposeSandbox(box);
  return { verdict: pass ? 'pass' : 'fail', confidence, blockers, followUps: filed, spend: k.spend.total };
}
