import { getWorkflowMetadata, setAttributes } from 'workflow';
import { start } from 'workflow/api';
import { respond } from './respond';
import { kit, checkoutPr } from '../lib/kit';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { comment, pastDismissals, readIssue, readMarker, readPullRequest, setLabels, setStatus } from '../lib/github-steps';
import { chooseModels, describe, modelBook } from '../lib/models';
import { composeReview, isDoc, isTestGap, listed, mayBlock, settle, toCheck, wasDismissed, type Dismissed, type Raised, type SkepticVerdict } from '../lib/review-policy';
import { FACTORY_DASHBOARD } from '../lib/constants';
import * as S from './schemas';

/**
 * review — a pull request read by agents that never saw it written.
 *
 * Lenses are picked by what the diff touches (app code: criteria, rules,
 * logic, tests; workflows; docs; the factory itself). Every blocker must name
 * how a person reaches it and what they lose, and survive a skeptic; anything
 * less is a follow-up: listed in the review comment, never a red check and
 * never an issue of its own (a person decides what is worth a ticket). A re-review
 * rechecks the last pass's blockers and hunts only in what was pushed since —
 * so a round that fixed what it was told ends green.
 *
 * The verdict is a commit status (`factory/review`) and one comment carrying
 * a marker the next pass reads back. Machines gate, agents advise: nothing
 * here can block a merge.
 */
/** `fixDocs: false` (ship's own review): hand stale docs back in the result for ship's fixer, instead of starting respond. */
export type ReviewInput = { pr: number; notes?: string; fixDocs?: boolean };

type Lens = { key: string; ask: string };
const LENSES: Record<string, string> = {
  combined: 'Every Done-when criterion traced to what satisfies it and the test that proves it; then the diff against CLAUDE.md and .claude/rules/; then logic errors; then changes the ticket did not ask for.',
  criteria: 'For each Done-when criterion, find what satisfies it, and run it to see. Code that does not do what a criterion says — shown by running it — can be a blocker; a criterion the code meets but no test pins is a test gap (category test-gap), never a blocker. A change the ticket did not ask for that a reviewer would not expect is category unasked.',
  rules: 'The diff against CLAUDE.md and the .claude/rules/ file for each area it touches: a recorded decision contradicted — quote the rule and the line.',
  logic: 'Logic errors: for each, an input a person gives in normal use and the wrong output it produces.',
  tests: 'Test gaps — never blockers, worth a look: one asserting the implementation against itself, one that would pass before the change, an existing test weakened. Show it by executing: mutate the guarded code and run the test, or query the seed or API the test relies on. The red-check result below is evidence, not a verdict — a refactor passes it either way.',
  actions: 'GitHub Actions defects: a trigger that cannot fire as intended, an `if:` wrong for a concrete payload (say which), untrusted text reaching a `run:` script, a token broader than the step needs.',
  docs: 'Docs that are false: CLAUDE.md, context/ and the playbooks are read *instead of* the code. A claim the code does not bear out, two docs that disagree, or an instruction an agent would follow into a wrong action.',
  orchestration: 'Factory defects (factory/, scripts/): a path where a dead agent reads as a pass, an unbounded loop, two jobs sharing ports at once, a secret reaching the sandbox, a prompt contradicting the playbook it cites.',
};

export async function review(input: ReviewInput) {
  'use workflow';
  try {
    const r: any = await reviewRun(input);
    await setAttributes({
      verdict: String(r.verdict), ...(r.confidence ? { confidence: String(r.confidence) } : {}), ...(typeof r.spend === 'number' ? { spend_usd: r.spend.toFixed(2) } : {}),
      ...(r.models ? { models: String(r.models).slice(0, 250) } : {}), ...(typeof r.est === 'number' ? { est_usd: r.est.toFixed(2) } : {}), ...(typeof r.climbs === 'number' ? { climbs: String(r.climbs) } : {}),
    });
    return r;
  } catch (e: any) {
    // Never leave a pull request's check at "pending": say what stopped it.
    const why = String(e?.message || e).slice(0, 140);
    const { workflowRunId } = getWorkflowMetadata();
    // Never leave a sandbox (and its snapshot) behind.
    await disposeSandbox(`review-${input.pr}-${workflowRunId.slice(-8).toLowerCase()}`).catch(() => null);
    const pr = await readPullRequest(input.pr).catch(() => null);
    if (pr) await setStatus(pr.headSha, 'factory/review', 'error', why, `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`).catch(() => null);
    return { verdict: 'none', reason: why };
  }
}

async function reviewRun(input: ReviewInput) {
  const { workflowRunId } = getWorkflowMetadata();
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const pr = await readPullRequest(input.pr);
  // Filterable in Vercel's run list: every run for a pull request, or for the ticket behind it.
  await setAttributes({ pr: String(pr.number), sha: pr.headSha.slice(0, 12), ...(pr.issue ? { issue: String(pr.issue) } : {}) });
  if (pr.state !== 'open' || pr.draft) return { verdict: 'none', reason: pr.draft ? 'draft' : 'not open' };
  const box = `review-${pr.number}-${workflowRunId.slice(-8).toLowerCase()}`;
  const k = kit(box, `reviewing pull request #${pr.number}`, 'read');
  await setStatus(pr.headSha, 'factory/review', 'pending', 'Reviewing…', runUrl);

  const issue = pr.issue ? await readIssue(pr.issue).catch(() => null) : null;
  const previous = await readMarker(pr.number, 'factory-verdict:review');

  await prepareSandbox(box, pr.headSha, 'read');
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
  const ticket = issue ? `The ticket, #${issue.number}: ${issue.title}\n\n${issue.body}\n` : `There is no linked ticket: judge the pull request against its own description.\n`;
  // Which model does each review job get: Jev reads the ticket and the diff's shape; the catalog prices it.
  const size = full ? 'full' : 'small';
  const choice = await chooseModels(`${ticket}\nPull request #${pr.number}: ${pr.title}\nFiles changed: ${files.join(', ')}\nFacts: ${f}\nLenses: ${lenses.map((l) => l.key).join(', ')}`,
    size, ['recheck', 'reviewLens', 'skeptic']);
  const models = modelBook(choice, size);
  k.useModels(models);
  k.log(`${lenses.map((l) => l.key).join(', ')} on ${describe(models.pick('reviewLens'))}; ${files.length} files, ${lines} code lines${risky ? ', risky' : ''}` +
    ` (models in ${choice.ms} ms${choice.why ? `; ${choice.why}` : ''})`);
  const scope = previous?.commit && facts?.delta
    ? `\nThis is a re-review. The last pass reviewed ${previous.commit.slice(0, 7)}; look for NEW problems only in what changed since: ${facts.delta.join(', ') || 'nothing'} (\`git diff ${previous.commit} HEAD\`). Outside that, raise only what would have blocked a first review.\n`
    : '';

  // What else is known: QA's verdict on this commit's preview, and the findings people dismissed as wrong.
  const qaMarker = await readMarker(pr.number, 'factory-verdict:qa');
  // Only a QA pass whose probes actually ran counts. QA writes the same bug-free marker when it skipped the
  // pull request or its probes never ran, so it says so with `probed: true`; a marker without it is no evidence.
  const qaPassed = !!qaMarker && qaMarker.commit === co.head && qaMarker.probed === true && !(qaMarker.bugs ?? []).length;
  const qaNote = qaPassed ? `\nQA already probed this commit on its preview and found no bug: a concern you only reason your way to from the diff is not a blocker unless you can show it happening anyway.\n` : '';
  const dismissed = await pastDismissals().catch(() => [] as Dismissed[]);
  const dismissedNote = dismissed.length
    ? `\nPeople marked these earlier review findings wrong; never raise the same claim again:\n${dismissed.slice(-15).map((d) => `- ${d.file}${d.line ? ':' + d.line : ''} [${d.category}] ${d.claim}`).join('\n')}\n`
    : '';

  // 1. Recheck the last pass's blockers, at this head.
  k.setPhase('recheck');
  const stillOpen: any[] = [];
  for (const b of previous?.blockers || []) {
    const r = await k.agent(`recheck:${b.category}`,
      `${ticket}\nOn pull request #${pr.number} (branch ${pr.head}), the last review raised this blocker at ${previous.commit.slice(0, 7)}:\n` +
      `[${b.category}] ${b.file}${b.line ? ':' + b.line : ''} — ${b.claim}\n\nIs it resolved at HEAD? Resolved means what was claimed can no longer happen. Read the lines; cite them.`,
      S.RECHECK, 'recheck');
    if (!r || !r.resolved) stillOpen.push({ ...b, evidence: r?.evidence ?? 'the recheck did not finish' });
  }

  // 2. The lenses, in parallel; one that dies is run once more.
  k.setPhase('lenses');
  const ask = (l: Lens) =>
    `${ticket}${input.notes ? `\nThe person who asked for this review wrote: "${input.notes}"\n` : ''}\n` +
    `You are reviewing pull request #${pr.number} "${pr.title}" (branch ${pr.head} into ${pr.base}) as someone who did not write it and has not seen the reasoning that produced it. ` +
    `Read context/engineering-context/harness/code-review-playbook.md §1–§4 first (\`awk '/^## 1\\./,/^## 5\\./' context/engineering-context/harness/code-review-playbook.md\`). ` +
    `Form your own view from the ticket and \`git diff origin/${pr.base}...HEAD\`. The pull request's description:\n${pr.body.slice(0, 3000)}\n\n` +
    `Your lens: ${l.ask}\n` +
    (l.key === 'tests' || l.key === 'combined' ? `\nThe red-check (app code reverted to ${pr.base}, the branch's new tests run): ${facts?.red || 'not run'}\n` : '') +
    scope + qaNote + dismissedNote +
    `\nApprove with comments is the default; a blocker is rare: serious (wrong behaviour a person hits, a crash, lost data, a security hole, a broken contract), ` +
    `present (how: the route through normal use, with this code now; harm: what that person loses — not "if ever…"), and demonstrated (you ran code, a test or a command that shows it; demonstrated=true). ` +
    `A nitpick — it works, just not exactly as you would read the ticket — is not a finding at all. Test gaps are never blockers. ` +
    `Verify every finding before you report it, suggestions too: evidence says what you ran or queried and what it showed, or quotes the exact line and what it does. ` +
    `Give each a confidence; below 0.8 it is dropped, so leave it out. At most three findings; fewer true ones beat many plausible ones. ` +
    `Every finding cites file:line, read from the line. Each is checked by an independent skeptic, and only what it can demonstrate is reported. ` +
    `The lens's own confidence is how much of the change you could actually judge. Empty is a good answer.`;
  // A lens that returns nothing is run again one tier up (routedAgent). One that could judge only a little
  // of the change (low confidence) is a cheap model out of its depth: the lens climbs a tier, once, and those read again.
  const reports: any[] = await Promise.all(lenses.map((l) => k.agent(`lens:${l.key}`, ask(l), S.REVIEW_LENS, 'reviewLens')));
  const unsure = lenses.filter((_, i) => reports[i]?.confidence === 'low');
  if (unsure.length && models.climb('reviewLens', `${unsure.map((l) => l.key).join(', ')} judged with low confidence`)) {
    const again = await Promise.all(unsure.map((l) => k.agent(`lens:${l.key}-again`, ask(l), S.REVIEW_LENS, 'reviewLens')));
    unsure.forEach((l, i) => { if (again[i]) reports[lenses.indexOf(l)] = again[i]; });
  }

  // 3. Every finding — blocker or suggestion — faces its own skeptic: a fresh agent on another model that sees only the
  // claim, the cited line, the diff and the ticket, never the lens's reasoning. Only what it demonstrates is reported.
  k.setPhase('skeptic');
  const raised: Raised[] = reports.filter(Boolean).flatMap((r: any) => r.findings as Raised[]);
  const { checked } = toCheck(raised, dismissed);
  const judged: SkepticVerdict[] = await Promise.all(checked.map((x, i) => k.agent(`skeptic:${i + 1}-${x.category}`,
    `${ticket}\nSomeone claims this about pull request #${pr.number} (branch ${pr.head} into ${pr.base}; \`git diff origin/${pr.base}...HEAD\`):\n\n` +
    `${x.file}${x.line ? ':' + x.line : ''} — ${x.claim}\n\n` +
    `Check it yourself, from the code — do not take the claim's word for anything. Demonstrate it by running the code, a test or a command (a throwaway script or test is fine; commit nothing), ` +
    `or by quoting the exact lines and showing what they do. ` +
    (isTestGap(x)
      ? `It is a claim about a test: execute before you confirm it — mutate the code the test guards and run the test to see whether it fails, or query the seed or API the test depends on. `
      : `Refuted if the code does not do what is claimed, if it is already so on origin/${pr.base}, if the code, its tests or its spec show it was deliberate, or if it is a nitpick or a deviation in detail that hurts nobody. ` +
        `Contrived if it is real but only reachable from input nobody gives in normal use (a hand-edited URL, a forged request). `) +
    (qaPassed ? `QA probed this commit on its preview and found no bug. ` : '') +
    `Confirmed only if you demonstrated it; if you cannot show it, it is unproven — and an unproven claim is not reported. ` +
    `executed=true only if you ran something that shows it (a quote is not a run); confidence is how sure you are of your verdict. ` +
    `Only a claim you executed, at confidence 0.95 or more, can hold up a merge.`,
    // Its own session and prompt: it sees the claim, never the lens's reasoning. Jev picks its model (job 'skeptic').
    S.SKEPTIC, 'skeptic')));
  const settled = settle(checked, judged);
  const confirmed = settled.blockers;
  // A verified stale doc is not a suggestion: it is fixed on the branch (below), so it is held apart.
  const followUps: any[] = [...settled.suggestions.filter((x) => !isDoc(x)), ...settled.polish];
  k.log(`${raised.length} raised · ${checked.length} checked · ${confirmed.length + followUps.length} survived their skeptic`);

  // 4. The verdict, composed by the script — no model shapes its own verdict.
  // A doc that the change made false is real (agents read docs instead of code), but it is not a
  // reason to hold back working code: on a branch of this repository the factory fixes it on the
  // pull request (respond, docs only) and says so; on a fork's, it is listed for the author.
  const isDocs = (b: any) => b.category === 'docs';
  const staleDocs = [...stillOpen, ...settled.suggestions].filter(isDocs);
  // A previous blocker still open stays one — unless it was a test gap (never a blocker now) or a person dismissed it.
  const blockers = [...stillOpen.filter((b) => !isTestGap(b) && !wasDismissed(b, dismissed)), ...confirmed].filter((b) => !isDocs(b)).slice(0, 3);
  let docsRun: string | null = null;
  const handDocsBack = input.fixDocs === false;
  if (staleDocs.length && pr.sameRepo && !handDocsBack) {
    const run = await start(respond, [{ pr: pr.number, author: 'the review', ask:
      `Bring these docs back in line with the code on this branch, and change nothing else (no code, no tests):\n` +
      staleDocs.map((d) => `- ${d.file}${d.line ? `:${d.line}` : ''} — ${d.claim}`).join('\n') +
      `\nThen \`git grep -n -i\` CLAUDE.md, .claude/rules/ and context/ for the same claim elsewhere and fix those too.` }]);
    docsRun = run.runId;
  } else if (staleDocs.length && !handDocsBack) {
    followUps.push(...staleDocs.map((d) => ({ ...d, severity: 'follow-up' })));
  }
  const missing = reports.some((r) => !r);
  const confidences = reports.filter(Boolean).map((r: any) => r.confidence);
  const confidence = missing ? 'low' : confidences.includes('low') ? 'low' : confidences.includes('medium') ? 'medium' : 'high';
  const pass = blockers.length === 0;
  const filedBefore = new Set<string>(previous?.followUps || []);
  // A place, not a category: the same line flagged under another category, by another lens or pass, is the same follow-up.
  const fkey = (x: any) => `${x.file}|${x.line ? Math.floor(x.line / 10) : x.claim.slice(0, 40)}`;
  // One per place: two lenses that flag the same line under different categories are one follow-up.
  const byPlace = new Map<string, any>();
  for (const x of followUps) { if (!byPlace.has(fkey(x))) byPlace.set(fkey(x), x); }
  // Listed in the comment only — once per place, and not again on a re-review that already listed it.
  // …and never a place already raised above, as a blocker or a doc being fixed.
  const raisedAbove = new Set([...blockers, ...(docsRun || handDocsBack ? staleDocs : [])].map(fkey));
  const toList = [...byPlace.values()].filter((x) => !filedBefore.has(fkey(x)) && !raisedAbove.has(fkey(x))).slice(0, 5);
  const summary = reports.filter(Boolean).map((r: any) => r.covered).join(' · ') || 'Nothing to report.';
  const marker = {
    pass: 'review', commit: co.head,
    blockers: blockers.map((b) => ({ category: b.category, file: b.file, line: b.line, claim: b.claim })),
    followUps: [...filedBefore, ...toList.map(fkey)],
    listed: listed(blockers, toList),
  };
  const docLine = (d: any) => `- \`${d.file}${d.line ? ':' + d.line : ''}\` ${d.claim}`;
  await comment(pr.number, composeReview({
    pass, confidence: confidence as 'high', summary, blockers, suggestions: toList,
    extra: [
      handDocsBack && staleDocs.length ? `📝 **Stale docs — ship is fixing these on this branch:**\n${staleDocs.map(docLine).join('\n')}` : '',
      docsRun ? `📝 **Stale docs — being fixed on this branch now**, so the next agent does not build on them ([run](${FACTORY_DASHBOARD}/workflows/runs/${docsRun})):\n${staleDocs.map(docLine).join('\n')}` : '',
      `<details><summary>Models and cost</summary>\n\n${models.table()}\n</details>`,
    ],
    footer: `🏭 Factory review · ${lenses.map((l) => l.key).join(', ')} · ${models.summary()} · ${raised.length} raised · ${confirmed.length + followUps.length} survived their skeptic · ${k.spendLine()} · [run](${runUrl})`,
    marker,
  }));
  await setStatus(pr.headSha, 'factory/review', pass ? 'success' : 'failure', pass ? `approved, ${confidence} confidence${confidence === 'low' ? ' (unproven)' : ''}` : blockers[0].claim, runUrl);
  // A blocker on a pull request ship built is something ship's own loop let through (test gaps never are).
  if (!pass && /^issue-\d+-/.test(pr.head)) await setLabels(pr.number, ['harness-escape'], []);
  await disposeSandbox(box);
  return {
    verdict: pass ? 'pass' : 'fail', confidence, blockers, docs: handDocsBack ? staleDocs : [], followUps: toList.length,
    // Test gaps its skeptics showed: ship's fixer tightens them as polish when it is fixing anyway; they never hold a run.
    polish: settled.polish.map((x) => ({ category: x.category, file: x.file, line: x.line, claim: x.claim, evidence: x.evidence })),
    spend: k.spend.total, seconds: k.spend.seconds, models: models.summary(), est: models.totals().est, climbs: models.totals().climbs,
  };
}
