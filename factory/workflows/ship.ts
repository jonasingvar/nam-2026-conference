import { createHook, getWorkflowMetadata, setAttributes, sleep } from 'workflow';
import { start } from 'workflow/api';
import { review } from './review';
import { qa } from './qa';
import { shots } from './shots';
import { agentScript, readAgent, runJob, type AgentRun, type Effort, type Model } from '../lib/jobs';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import {
  comment, findDeployment, findEarlierAttempt, openPullRequest, peopleSaid, previewForPr, productionHealth, progress, readIssue, readPullRequest, setLabels, type Issue,
} from '../lib/github-steps';
import { judgeAnswers, triageIssue, type Size, type Triage } from '../lib/triage';
import { ALLOWED_REPO, FACTORY_DASHBOARD, PRODUCTION_URL, REPO_DIR } from '../lib/constants';
import * as S from './schemas';

/**
 * ship — a GitHub issue to a merged, deployed change, as one durable run.
 *
 *   triage (Jev) → plan (spec, first commit) → [plan audit] → build (test first)
 *   → loop { gate + red-check → independent audit → skeptic → fix }
 *   → pull request → Vercel preview → review → wait for the merge → production
 *
 * Agents do judgement only. Anything a command can decide — the gate, whether
 * the new tests fail without the change, merging the base, opening the PR —
 * is a plain durable step, never a model relaying a command's output.
 *
 * Every step's result is in the run's event log, so the run survives anything:
 * a redeploy, a crashed function, the sandbox timing out. On resume, finished
 * steps return their recorded results and only the interrupted job reruns.
 */
/** `answer`: started by a person's comment on a ticket waiting on them — resume only if it settles what was open. */
export type ShipInput = { issue: number; base?: string; notes?: string; size?: Size | 'sized'; answer?: boolean };

type Finding = {
  severity: 'blocker' | 'minor'; category: string; file: string; line?: number;
  claim: string; evidence: string; fix: string; also?: { category: string; claim: string; evidence: string }[];
};
type Profile = {
  size: Size; why: string; think: Model; build: Model;
  planAudits: string[]; planRounds: number; lenses: string[]; buildRounds: number;
  browserAlways?: boolean; probes: number; gateScope?: 'branch'; reaudit: boolean; learns: boolean; escalated?: boolean;
};

const PROFILES: Record<Size, Omit<Profile, 'why'>> = {
  // A person is waiting and the change is understood: one combined audit, the
  // browser specs the change reaches, a fix re-gated rather than re-audited.
  fast: { size: 'fast', think: 'sonnet', build: 'sonnet', planAudits: [], planRounds: 0, lenses: ['combined'], buildRounds: 2, probes: 0, gateScope: 'branch', reaudit: false, learns: false },
  // Contained: one combined audit, the whole suite, a browser audit only when
  // something visible changed without a browser test to prove it.
  small: { size: 'small', think: 'sonnet', build: 'sonnet', planAudits: [], planRounds: 0, lenses: ['combined', 'browser'], buildRounds: 2, probes: 2, reaudit: true, learns: true },
  // A rule, stored data or the harness: Opus, a plan audit, three lenses.
  full: { size: 'full', think: 'opus', build: 'opus', planAudits: ['criteria', 'fit'], planRounds: 3, lenses: ['criteria', 'rules', 'browser'], buildRounds: 4, probes: 5, reaudit: true, learns: true },
};

const STUCK_AFTER = 2;

export async function ship(input: ShipInput) {
  'use workflow';
  try {
    const r: any = await shipRun(input);
    await setAttributes({ outcome: String(r.outcome), ...(typeof r.spend === 'number' ? { spend_usd: r.spend.toFixed(2) } : {}) });
    return r;
  } catch (e: any) {
    // Anything unexpected — a step that failed for good, a deployment mid-rollout — must never
    // leave a ticket sitting at "ai-working" with nobody told. Say so on the issue, hand it to a person.
    const { workflowRunId } = getWorkflowMetadata();
    const why = String(e?.message || e).slice(0, 400);
    await disposeSandbox(`ship-${input.issue}-${workflowRunId.slice(-8).toLowerCase()}`).catch(() => null);
    await setLabels(input.issue, ['needs-human'], ['ai-working', 'ready-for-ai']).catch(() => null);
    await comment(input.issue, `### 🏭 Ship on Vercel · the run crashed\n\n\`${why}\`\n\nNothing is lost: the work so far is on its branch. Reply here (or add \`ready-for-ai\`) to try again.\n\n` +
      `<sub>[run](${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId})</sub>`).catch(() => null);
    await setAttributes({ outcome: 'crashed' }).catch(() => null);
    return { outcome: 'crashed', issue: input.issue, reason: why };
  }
}

async function shipRun(input: ShipInput) {
  await setAttributes({ issue: String(input.issue) });

  const { workflowRunId } = getWorkflowMetadata();
  const n = input.issue;
  const BASE = input.base || 'main';
  // The run's sandbox. A fix after review gets a fresh one (forked, in seconds): `let`, so the agents follow it.
  let box = `ship-${n}-${workflowRunId.slice(-8).toLowerCase()}`;
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;

  // ── State the issue comment shows ────────────────────────────────────────
  const PHASES = ['Triage', 'Plan', 'Plan audit', 'Build', 'Gate', 'Audit', 'Pull request', 'Preview', 'Review & QA', 'Merge', 'Production'];
  const status: Record<string, 'todo' | 'running' | 'done' | 'skipped' | 'failed'> = Object.fromEntries(PHASES.map((p) => [p, 'todo']));
  const lines: string[] = [];
  const rounds: { round: number; gate: string; raised: number; confirmed: number; covered: string }[] = [];
  const spend = { total: 0, agents: 0, byModel: {} as Record<string, number>, byPhase: {} as Record<string, number> };
  let current = 'Triage';
  let commentId: number | null = null;
  let profile: Profile | null = null;
  let triage: Triage | null = null;
  let branch = '';
  let specPath = '';
  let prUrl = '';
  let previewUrl = '';

  const dollars = (x: number) => `$${x.toFixed(2)}`;
  const render = (headline: string) => [
    `### 🏭 Ship on Vercel · ${headline}`,
    '',
    PHASES.map((p) => `${{ todo: '◻️', running: '⏳', done: '✅', skipped: '⏭️', failed: '❌' }[status[p]]} ${p}`).join(' · '),
    '',
    profile ? `**Run:** ${profile.size}${profile.escalated ? ' (escalated on its diff)' : ''} — ${profile.why}` : '',
    branch ? `**Branch:** \`${branch}\`${specPath ? ` · 📄 [Spec](https://github.com/${ALLOWED_REPO}/blob/${branch}/${specPath})` : ''}` : '',
    prUrl ? `**Pull request:** ${prUrl}${previewUrl ? ` · 🔎 [Preview](${previewUrl})` : ''}` : '',
    rounds.length ? `\n| Round | Gate | Audit |\n| --- | --- | --- |\n${rounds.map((r) => `| ${r.round} | ${r.gate} | ${r.raised} raised · ${r.confirmed} confirmed |`).join('\n')}` : '',
    '',
    `**AI spend so far:** ${dollars(spend.total)} over ${spend.agents} agent run${spend.agents === 1 ? '' : 's'}` +
      (Object.keys(spend.byModel).length ? ` (${Object.entries(spend.byModel).map(([m, c]) => `${m.replace(/^claude-/, '')} ${dollars(c)}`).join(', ')})` : ''),
    lines.length ? `\n<details><summary>Log</summary>\n\n${lines.map((l) => `- ${l}`).join('\n')}\n</details>` : '',
    '',
    `<sub>Durable run [${workflowRunId}](${runUrl}) · resumes from its last finished step if anything dies</sub>`,
    '<!-- ship-on-vercel -->',
  ].filter((l) => l !== '').join('\n');

  // Every call publishes the comment and streams the lines logged since the last one.
  let streamed = 0;
  const show = async (headline = current) => {
    const fresh = lines.slice(streamed);
    streamed = lines.length;
    commentId = await progress(n, commentId, render(headline), [`— ${headline}`, ...fresh]);
  };
  const enter = async (phase: string) => {
    for (const p of PHASES) if (status[p] === 'running') status[p] = 'done';
    status[phase] = 'running';
    current = phase;
    // Searchable in Vercel's run list: which ticket, what size, where it is now.
    // On the run in Vercel, searchable: which ticket, where it is, what it has cost so far (review and QA included).
    await setAttributes({
      issue: String(n), title: issueTitle.slice(0, 200), phase,
      spend_usd: spend.total.toFixed(2), agents: String(spend.agents),
      ...(profile ? { size: profile.size } : {}), ...(prUrl ? { pr: prUrl.split('/').pop()! } : {}),
    });
    await show();
  };
  const log = (s: string) => { lines.push(s); console.log(`#${n} ${s}`); };

  // ── Jobs and agents ───────────────────────────────────────────────────────
  let seq = 0;
  const jobId = (label: string) => `${String(++seq).padStart(3, '0')}-${label.replace(/[^a-zA-Z0-9#:._-]+/g, '-').replace(/[#:]/g, '_')}`;

  const PREAMBLE =
    `You are one step of the ORBIT factory, which takes GitHub issue #${n} in ${ALLOWED_REPO} to a pull request. ` +
    `You run headless in a Vercel Sandbox, in ${REPO_DIR}. git and gh are authenticated by the network itself — never ` +
    `look for, print or set a token. The network reaches GitHub, npm and AI Gateway only. Chromium is installed; never ` +
    `run \`npx playwright install\`. CLAUDE.md is the specification for this repo and its rules hold. ` +
    `Each turn re-reads your whole context, so batch reads into one Bash command (\`; echo ---;\`). ` +
    `Start from \`node scripts/context.mjs index\`: pick the one or two docs in context/engineering-context/ for the ` +
    `area, read them by the piece (\`node scripts/context.mjs show <doc> Gotchas <part>\`), and take their word for how ` +
    `the app fits together — open source only for the lines you will change or must verify. ` +
    `When you are done, your final answer is the structured result; nothing else you write is read.\n\n`;

  async function agent(label: string, prompt: string, schema: any, model: Model, effort?: Effort): Promise<any | null> {
    const id = jobId(label);
    const done = await runJob(box, id, { 'prompt.md': PREAMBLE + prompt, 'schema.json': JSON.stringify(schema) }, agentScript(model, effort));
    const r: AgentRun = readAgent(done, schema);
    spend.total += r.costUsd;
    spend.agents += 1;
    spend.byPhase[current] = (spend.byPhase[current] || 0) + r.costUsd;
    for (const [m, c] of Object.entries(r.byModel)) spend.byModel[m] = (spend.byModel[m] || 0) + c;
    log(`${label}: ${r.value ? 'done' : `no result — ${r.error}`} (${model}, ${r.turns} turns, ${r.seconds}s, ${dollars(r.costUsd)})`);
    // The phase step already streamed this agent's result; the comment catches up at the next phase.
    return r.value;
  }

  /** A shell job whose script writes $JOB/result.json; returns it parsed, or null. */
  async function command(label: string, script: string): Promise<any | null> {
    const done = await runJob(box, jobId(label), {}, script);
    if (!done) return null;
    try { return JSON.parse(done.result); } catch { log(`${label}: unreadable result (exit ${done.exit}) ${done.tail.slice(-200)}`); return null; }
  }

  // What people said — the comment that asked for this run, and every answer on the issue or an earlier attempt's PR.
  let said: { at: string; who: string; where: string; text: string }[] = [];
  const ticketText = (issue: Issue, doneWhen: string[]) =>
    `GitHub issue #${n}: ${issue.title}\n\n${issue.body}\n` +
    (doneWhen.length ? `\nDone when (as the plan read it):\n${doneWhen.map((c) => `- ${c}`).join('\n')}\n` : '') +
    (input.notes ? `\nThe person who asked for this run wrote: "${input.notes}" — where it changes what to build, it amends the ticket.\n` : '') +
    (said.length ? `\nPeople have said, in order (newest last) — a person's answer amends the ticket where it changes what to build, and settles what a hand-back asked:\n` +
      said.map((c) => `- ${c.who} on ${c.where}: "${c.text.replace(/\s+/g, ' ')}"`).join('\n') + '\n' : '');

  // ── Findings ──────────────────────────────────────────────────────────────
  const key = (f: Finding) => `${f.category}|${f.file}|${f.line ? Math.floor(f.line / 10) : f.claim.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60)}`;
  const where = (f: Finding) => `${f.file}|${f.line ? f.line : f.claim.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
  const dedupe = (fs: Finding[]) => {
    const m = new Map<string, Finding>();
    for (const f of fs) {
      const k = where(f);
      const g = m.get(k);
      if (!g) { m.set(k, { ...f, also: [...(f.also || [])] }); continue; }
      for (const r of [f, ...(f.also || [])]) if (g.claim !== r.claim && !g.also!.some((a) => a.claim === r.claim)) g.also!.push({ category: r.category, claim: r.claim, evidence: r.evidence });
    }
    return [...m.values()];
  };
  const list = (fs: Finding[]) => fs.map((f, i) =>
    `${i + 1}. [${f.category}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.claim}\n   evidence: ${f.evidence}\n   fix: ${f.fix}` +
    (f.also?.length ? f.also.map((a) => `\n   also, [${a.category}]: ${a.claim} — ${a.evidence}`).join('') : '')).join('\n');

  // ── Hand-back: a draft PR with everything still open, and a person's label ─
  async function handBack(stage: string, why: string, open: Finding[] = []) {
    log(`handed back at ${stage}: ${why}`);
    status[current] = 'failed';
    let draft: { number: number; url: string } | null = null;
    if (branch) {
      const pushed = await command('push', `git push -u origin HEAD >"$JOB/push.log" 2>&1; echo "{\\"ok\\":$([ $? = 0 ] && echo true || echo false),\\"ahead\\":$(git rev-list --count origin/${BASE}..HEAD 2>/dev/null || echo 0)}" > "$JOB/result.json"`);
      if (pushed?.ok && pushed.ahead > 1) {
        draft = await openPullRequest({
          head: branch, base: BASE, draft: true, labels: [],
          title: issueTitle,
          body: `Refs #${n}\n\n## Why this stopped\n${stage}: ${why}\n\n${open.length ? `## Still open\n${list(open)}\n\n` : ''}` +
            `The work so far is on this branch. **Just reply — here or on #${n}.** Your comment is the answer: the factory picks it up, continues on this branch and turns this into the pull request.\n\n<sub>🏭 Ship on Vercel · [run](${runUrl})</sub>`,
        });
        prUrl = draft.url;
      }
    }
    await setLabels(n, ['needs-human'], ['ai-working', 'ready-for-ai']);
    await show(`handed back at ${stage}`);
    await disposeSandbox(box);
    return { outcome: 'needs-human', issue: n, stage, reason: why, draft: draft?.url ?? null, spend: spend.total };
  }

  // ════════════════════════════════════════════════════════════════════════
  // 1. Triage — read the issue, size the run with Jev.
  // ════════════════════════════════════════════════════════════════════════
  const issue = await readIssue(n);
  const issueTitle = issue.title;
  if (issue.isPullRequest || issue.state !== 'open') {
    return { outcome: 'declined', issue: n, reason: issue.isPullRequest ? 'that is a pull request, not an issue' : 'the issue is closed' };
  }
  // An earlier attempt handed back as a draft? Continue it, with what people answered.
  const earlier = await findEarlierAttempt(n);
  said = await peopleSaid(n, earlier?.number ?? null);
  // A comment on a ticket waiting on a person: resume only if it answers what is open.
  if (input.answer && earlier) {
    const body = (await readPullRequest(earlier.number)).body;
    const open = body.slice(Math.max(0, body.indexOf('## Why this stopped')), body.indexOf('The work so far') > 0 ? body.indexOf('The work so far') : undefined).trim();
    const verdict = await judgeAnswers(open || body.slice(0, 3000), said);
    if (!verdict.answered) {
      await comment(earlier.number, `🏭 Not resuming yet — Jev reads the replies as not settling everything that is open` +
        `${verdict.probability !== null ? ` (${Math.round(verdict.probability * 100)}% that they do)` : ''}. Still open:\n\n${open.replace(/^## Why this stopped\n?/, '')}\n\n` +
        `Reply again with the missing answer, or add \`ready-for-ai\` to go ahead as things stand.`);
      return { outcome: 'waiting', issue: n, draft: earlier.url, answered: verdict.probability };
    }
  }
  await setLabels(n, ['ai-working'], ['ready-for-ai', 'needs-human', 'ready-for-human']);
  if (earlier) { await setLabels(earlier.number, [], ['ready-for-ai', 'needs-human']); prUrl = earlier.url; }
  await enter('Triage');
  if (earlier) log(`continuing ${earlier.draft ? 'the draft' : 'pull request'} #${earlier.number} on ${earlier.head}, with ${said.length} comment${said.length === 1 ? '' : 's'} from people`);
  triage = input.size ? { size: input.size, picked: null, sure: null, why: 'asked for explicitly', ms: 0 } : await triageIssue(issue);
  log(`triage: ${triage.why}${triage.ms ? ` in ${triage.ms} ms` : ''}`);
  if (triage.size !== 'sized') profile = { ...PROFILES[triage.size], why: triage.why };

  // ════════════════════════════════════════════════════════════════════════
  // 2. Plan — a sandbox, a branch, and a spec as the branch's first commit.
  // ════════════════════════════════════════════════════════════════════════
  await enter('Plan');
  await prepareSandbox(box, BASE, 'push');
  const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 5).join('-') || 'change';
  const made = await command('branch', earlier
    // Continue the earlier attempt's branch, brought up to date with the base.
    ? `git fetch -q --prune origin && git checkout -q -B "${earlier.head}" "origin/${earlier.head}" && ` +
      `{ git merge -q --no-edit "origin/${BASE}" >/dev/null 2>&1 || git merge --abort; } && echo '{"branch":"${earlier.head}"}' > "$JOB/result.json"`
    : `git fetch -q --prune origin && b="issue-${n}-${slug}"; i=2; while git ls-remote --exit-code --heads origin "$b" >/dev/null; do b="issue-${n}-${slug}-$i"; i=$((i+1)); done; ` +
      `git checkout -q -B "$b" "origin/${BASE}" && echo "{\\"branch\\":\\"$b\\"}" > "$JOB/result.json"`);
  if (!made?.branch) return handBack('Plan', 'could not make a branch from ' + BASE);
  branch = made.branch;
  await show();

  const plan = await agent('plan',
    `${ticketText(issue, [])}\n` +
    `You are the planner. Work on branch ${branch} (already checked out, from origin/${BASE}). Write no code.\n\n` +
    (earlier ? `An earlier run of this ticket handed it back to a person, and this branch holds its work: a spec under specs/${n}-*.md and probably code and tests. ` +
      `Read the spec and \`git log --oneline origin/${BASE}..HEAD\`. Do not start over: revise that spec so it settles what the people above answered — record each ` +
      `answer as a Decision, and change *Where* and *How it will be proved* where the answer changes them — then commit ("docs(spec): …") and push. ` +
      `Return the spec's existing path.\n\n` : '') +
    `First decide whether the ticket is shippable: it is not if it states no outcome a check could be written against, ` +
    `or asks for two unrelated things — then return shippable=false with the reason and stop.\n\n` +
    `Otherwise write the spec at specs/${n}-${slug}.md — half a page, this shape:\n` +
    `# <title>\n## What this changes\n<what an attendee or caller sees now>\n## Where\n- \`<file>\` — <function or line>; test in \`<test file>\` using <lane or helper from tests/helpers.js>\n` +
    `## How it will be proved\n| Done when | Check | Layer |\n| --- | --- | --- |\n## Decisions\n<only what the ticket left open>\n## Out of scope\n<only if needed>\n\n` +
    `*Where* is the builder's map: name each file, the function or line to change, and the test file and helper, so the builder searches for nothing. ` +
    `Every Done-when criterion maps to a named check at the cheapest layer that can prove it (unit or API before a browser), and ` +
    `every row must be false on main today — judge that by reading, not running. If a criterion already holds on main as written, ` +
    `the first Decision says so and what this build proves instead. Never open data/orbit.db; the seed doc and the API say what it holds. ` +
    `Commit it as the branch's first commit ("docs(spec): <title in lower case>") and push (\`git push -u origin HEAD\`).\n\n` +
    `Then report facts about the change — what it touches and risks, from the files you opened, not from how long the ticket is — and ` +
    `each Done-when criterion verbatim (write them as checkable criteria if the ticket has none). Return each Decision as a yes/no question for the reviewer.`,
    S.PLAN, profile?.think ?? 'opus', 'medium');
  if (!plan) return handBack('Plan', 'the planner did not finish');
  if (!plan.shippable) {
    await comment(n, `### 🏭 Ship on Vercel · not started\n\n${plan.reason}\n\nEdit the issue and add \`ready-for-ai\` again.`);
    await setLabels(n, ['needs-human'], ['ai-working']);
    status.Plan = 'failed';
    await show('not shippable as written');
    await disposeSandbox(box);
    return { outcome: 'declined', issue: n, reason: plan.reason };
  }
  specPath = plan.spec.path;
  const doneWhen: string[] = plan.doneWhen;
  const ticket = ticketText(issue, doneWhen);
  if (!profile) profile = profileFor(plan.facts);
  log(`sized ${profile.size} — ${profile.why}`);
  await show();

  // ════════════════════════════════════════════════════════════════════════
  // 3. Plan audit — the cheapest place to catch a misreading.
  // ════════════════════════════════════════════════════════════════════════
  const history: Finding[] = [];
  let carried: Finding[] = [];
  const planAudits = profile.planRounds ? profile.planAudits : [];
  if (!planAudits.length) status['Plan audit'] = 'skipped';
  const REPLAN = new Set(['criterion-unmet', 'claude-md', 'logic', 'scope']);
  for (let round = 1; planAudits.length && round <= profile.planRounds; round++) {
    await enter('Plan audit');
    const asks: Record<string, string> = {
      combined: 'Does every Done-when criterion map to a check that would fail today and pass once built, at the cheapest layer — and does the plan contradict anything CLAUDE.md decides, or name files that do not exist or do not own what it says?',
      criteria: 'Does every Done-when criterion map to a check that would fail today and pass once built, at the cheapest layer? Is anything in the spec not asked for by the ticket?',
      fit: 'Does the plan contradict anything CLAUDE.md decides? Do the files it names exist and own what it says they own?',
    };
    const reports = await Promise.all(planAudits.map((l) => agent(`plan-audit:${l}#${round}`,
      `${ticket}\nYou are auditing a spec you did not write: ${specPath} on branch ${branch}. ${asks[l]}\n\n` +
      `Judge the plan, do not build it: open source only for a line the spec cites that the docs do not settle; run no tests. ` +
      `Blockers only for what would make the change wrong or unprovable. Category scope only when the TICKET itself is contradictory or unbuildable. Cite file and line. Empty is a good answer.`,
      S.FINDINGS, profile!.think, 'medium')));
    if (reports.some((r) => !r)) return handBack('Plan audit', 'a plan auditor did not finish');
    const blockers = reports.flatMap((r: any) => r.findings as Finding[]).filter((f) => f.severity === 'blocker' && !carried.some((c) => where(c) === where(f)));
    const confirmed = await confirm(blockers, 'the spec', ticket);
    history.push(...confirmed);
    log(`plan audit ${round}: ${blockers.length} blockers raised, ${confirmed.length} confirmed`);
    carried.push(...confirmed.filter((f) => !REPLAN.has(f.category)));
    const open = confirmed.filter((f) => REPLAN.has(f.category));
    if (!open.length) break;
    if (round === profile.planRounds && open.some((f) => f.category === 'scope')) return handBack('Plan audit', 'the ticket itself is in question', open);
    if (round === profile.planRounds) { carried.push(...open); break; }
    const revised = await agent(`revise-spec#${round}`,
      `${ticket}\nIndependent auditors confirmed these problems with ${specPath} on branch ${branch}:\n\n${list(open)}\n\n` +
      `Revise the spec to resolve each. A technical question the ticket does not settle is yours: decide it under *Decisions*, with why. Commit ("docs(spec): …") and push.`,
      S.SPEC_REVISED, profile.think);
    if (!revised) return handBack('Plan audit', 'the spec reviser did not finish', open);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 4. Build — the failing test first, committed red, then the change.
  // ════════════════════════════════════════════════════════════════════════
  await enter('Build');
  const built = await agent('build',
    `${ticket}\nImplement ${specPath} on branch ${branch}. Its *Where* is your map: open those files directly.\n\n` +
    (earlier ? `This branch already holds an earlier run's work (\`git log --oneline origin/${BASE}..HEAD\`, \`git diff origin/${BASE}...HEAD\`): keep what still holds, ` +
      `change what the revised spec and the people's answers change, and add the tests that prove it. The rules below still apply.\n\n` : '') +
    `Write the check first and confirm it fails for the reason you expect — commit it on its own, red, as "test(…)", before any fix: ` +
    `that commit is the evidence the check proves something. Then implement, \`npm test\` after every edit; Conventional Commits; push. ` +
    `Keep the docs true in the same push: \`node scripts/context.mjs for <changed files>\` names the context/engineering-context/ docs that own them — update what the change made wrong, and list a new file in its area doc's \`files\`. ` +
    `Then search every doc an agent reads instead of the code — \`git grep -n -i\` over CLAUDE.md, .claude/rules/ and context/ for the page, route, function and the words your change makes untrue ` +
    `(a feature you built that a doc calls a placeholder, "coming soon", "not built yet" or "no UI calls it") — and fix each one. ` +
    `Prove each criterion at the cheapest layer (a rule, payload or 400 in a unit/API test; a browser test only for what only a page shows, ` +
    `the variants of one criterion in one test, never mode: 'serial'). Every state the change adds gets its own assertion; when a state depends on the clock, ` +
    `also a moment before it applies (Day 1 08:00 — the seed's morning is already attended). A browser test you added runs once, alone, before you hand over ` +
    `(\`npx playwright test <file> -g "<title>" --project=desktop\`); do NOT run the whole suite — the gate does. ` +
    (profile.size === 'fast' ? 'This is a fast run: unit and API tests first, at most one browser test (none if nothing an attendee sees changes). ' : '') +
    `If something an attendee sees changed, call \`await shotForPR(page, '<what it shows>')\` (tests/helpers.js) in the browser test at the moment the change is on screen. ` +
    `Leave \`git status\` clean.` +
    (carried.length ? `\n\nThe plan audit left these for the build to resolve:\n${list(carried)}` : ''),
    S.BUILT, profile.build);
  if (!built || !built.ok) return handBack('Build', built ? built.summary : 'the builder did not finish');

  // ════════════════════════════════════════════════════════════════════════
  // 5. Gate → audit → fix, until a round is clean.
  // ════════════════════════════════════════════════════════════════════════
  const LENS_ASK: Record<string, string> = {
    combined: `Read the ticket, then the spec (does it read the ticket right? a misreading is criterion-unmet; a self-contradicting ticket is scope), then \`git diff origin/${BASE}...HEAD\`. ` +
      `For each Done-when criterion find what satisfies it and the test that proves it — nothing satisfying it is a blocker, and so is a test that would pass before the change, ` +
      `or an existing test weakened the ticket did not ask to change (test-weakened). Then the diff against CLAUDE.md and .claude/rules/ for the areas it touches (quote the rule and the line), and logic errors (an input and the wrong output). ` +
      `A change the ticket did not ask for — a file, a dependency, a behaviour no criterion needs — is a blocker (category unasked), however well meant. ` +
      `Last, the docs: \`node scripts/context.mjs for <changed files>\`, and \`git grep -n -i\` over CLAUDE.md, .claude/rules/ and context/ for the page, route and functions the diff touches — ` +
      `a doc that now describes the code wrongly is docs-stale, a blocker when an agent following it would build the wrong thing (a doc still calling a built page a placeholder is one). ` +
      `context/engineering-context/harness/code-review-playbook.md §2–§4 says what not to flag.`,
    criteria: `Read the ticket, then the spec, then \`git diff origin/${BASE}...HEAD\`. For each Done-when criterion find what satisfies it and the test that proves it. ` +
      `Nothing satisfying it is a blocker; so is a test that would pass before the change, asserts the implementation against itself, or weakens an existing test the ticket did not ask to change (test-weakened); ` +
      `and so is a change the ticket did not ask for — a file, a dependency, a behaviour no criterion needs (category unasked).`,
    rules: `Read \`git diff origin/${BASE}...HEAD\` against CLAUDE.md and .claude/rules/. A blocker is a recorded decision contradicted — quote the rule and the line — or a logic error with an input and the wrong output. ` +
      `context/engineering-context/harness/code-review-playbook.md §2–§4 says what not to flag.`,
    browser: `Drive the change in a real browser and try to break it, following context/engineering-context/harness/qa-playbook.md §1–§3: probes in tests/qa-probe.spec.js, ` +
      `run for both projects, re-run before calling anything a bug, delete the probe after and leave \`git status\` clean. Spend the budget where the branch's own tests do not reach; ` +
      `if the change depends on the time, one probe pins the clock before it applies (Day 1 08:00). A reproduced bug in this change is a blocker; one that is already on ${BASE} is minor. ` +
      `If nothing visible changed, say so in covered and return no findings.`,
  };
  const lensesFor = (p: Profile) => p.lenses.filter((l) => l !== 'browser' || p.size === 'full' || p.browserAlways || (built.ui && !built.browserTest));

  const streak = new Map<string, number>();
  let gate: any = null;
  let red: any = null;
  let minors: Finding[] = [];
  let audited = 0;
  let redStreak = 0;
  for (let round = 1; ; round++) {
    await enter('Gate');
    const ran = await command(`gate#${round}`, gateScript(BASE, profile.gateScope));
    if (!ran) return handBack('Gate', 'the gate job did not finish');
    gate = readGate(ran.gate);
    if (ran.sync === 'conflict') gate = { ...gate, ok: false };
    const facts = String(ran.facts || '');

    // The diff now says what the ticket risks; a small run that reached a risky
    // path, or grew past 300 app lines, gets the auditors a full run has.
    const appLines = Number((/--app-lines=(\d+)/.exec(facts) || [])[1] || 0);
    const reasons = [/--risky=yes\b/.test(facts) && 'the diff touches a risky path', appLines > 300 && `the diff is ${appLines} app lines`].filter(Boolean);
    if (profile.size === 'small' && !profile.escalated && reasons.length) {
      profile = { ...profile, escalated: true, think: 'opus', buildRounds: Math.max(profile.buildRounds, 3), lenses: ['criteria', 'rules', 'browser'] };
      log(`escalated: ${reasons.join(', ')}`);
    }
    redStreak = gate.ok ? 0 : redStreak + 1;
    if (redStreak >= 2 && profile.build !== 'opus') { profile = { ...profile, build: 'opus' }; log('the gate was red twice running — the fixer moves to Opus'); }

    let open: Finding[] = [];
    if (gate.ok && !profile.reaudit && audited > 0) {
      rounds.push({ round, gate: `✅ ${gateLine(gate)}`, raised: 0, confirmed: 0, covered: 'the fix, re-gated — not re-audited (fast)' });
      minors = await confirm(dedupe(minors).slice(0, 3), 'the change', ticket);
      break;
    }
    if (gate.ok) {
      audited++;
      await enter('Audit');
      red = parseRed(ran.red);
      const lenses = lensesFor(profile);
      const auditPrompt = (l: string) =>
        `${ticket}\nYou are auditing a change you did not write, on branch ${branch}. The spec is ${specPath}. ${LENS_ASK[l]}\n\n` +
        (l === 'browser'
          ? `The gate just ran the suite green at ${gate.sha.slice(0, 7)} — do not run \`npm test\` or the suite. Budget: ${profile!.probes} probes, one file, both viewports in one run.\n\n`
          : `The gate just ran at ${gate.sha.slice(0, 7)}: ${gateLine(gate)}. Do not re-run it — read the tests; run a command only to prove one specific claim.\n\n`) +
        ((l === 'combined' || l === 'criteria') && carried.length ? `The plan audit left these for the build to resolve — a blocker if any is unresolved:\n${list(carried)}\n\n` : '') +
        ((l === 'combined' || l === 'criteria') && gate.tampered?.length ? `The gate flagged removed assertions or added skips:\n${gate.tampered.join('\n')}\n\n` : '') +
        `Blockers only for something that would change a merge decision; everything else is minor. Change no code. Empty is a good answer.`;
      // Readers in parallel; the browser lens boots the app, so it runs alone after them.
      const readers = lenses.filter((l) => l !== 'browser');
      const reports: any[] = await Promise.all(readers.map((l) => agent(`audit:${l}#${round}`, auditPrompt(l), S.FINDINGS, profile!.think)));
      if (lenses.includes('browser')) reports.push(await agent(`audit:browser#${round}`, auditPrompt('browser'), S.FINDINGS, 'sonnet'));
      for (let i = 0; i < reports.length; i++) {
        if (reports[i]) continue;
        const l = [...readers, 'browser'][i];
        reports[i] = await agent(`audit:${l}-retry#${round}`, auditPrompt(l), S.FINDINGS, l === 'browser' ? 'sonnet' : profile.think);
        if (!reports[i]) return handBack('Audit', `the ${l} auditor did not finish twice`);
      }
      const raised: Finding[] = [
        ...reports.flatMap((r) => r.findings as Finding[]),
        ...(red && red.checked && red.failedOnBase === false ? [{
          severity: 'blocker' as const, category: 'test-proves-nothing', file: red.tests[0] || 'tests/',
          claim: 'the tests this branch added or changed pass with its app code reverted',
          evidence: `scripts/red-check.mjs reverted ${red.reverted.join(', ')} to ${BASE} and ran ${red.tests.join(', ')}: none failed`,
          fix: 'add a test that exercises the changed code where an attendee meets it, and fails on the base branch',
        }] : []),
      ];
      minors = raised.filter((f) => f.severity === 'minor');
      open = await confirm(raised.filter((f) => f.severity === 'blocker'), 'the change', ticket);
      history.push(...open);
      rounds.push({ round, gate: `✅ ${gateLine(gate)}`, raised: raised.length, confirmed: open.length,
        covered: reports.map((r) => `ran ${r.ran}: ${String(r.covered).slice(0, 80)}`).join(' · ') });
      log(`round ${round}: green, ${raised.length} raised, ${open.length} confirmed`);
      if (!open.length) { minors = await confirm(dedupe(minors).slice(0, 3), 'the change', ticket); break; }
    } else if (ran.sync === 'conflict') {
      open = (ran.conflicts?.length ? ran.conflicts : [`origin/${BASE}`]).map((file: string) => ({
        severity: 'blocker', category: 'conflict', file, claim: `conflicts with origin/${BASE}`,
        evidence: `git merge origin/${BASE} conflicted in ${file}`,
        fix: `git merge origin/${BASE}; resolve ${file} keeping both this branch's change and what landed on ${BASE}; npm test; commit the merge`,
      }));
      rounds.push({ round, gate: `⚠️ conflicts with ${BASE}`, raised: open.length, confirmed: open.length, covered: '' });
    } else {
      const failures = [...(gate.unit.failed ? [{ test: 'npm test', error: gate.unit.output || `${gate.unit.failed} failed` }] : []), ...gate.browser.failed];
      if (!failures.length) return handBack('Gate', 'the gate is red but names no failing test');
      open = dedupe(failures.map((f: any) => ({ severity: 'blocker', category: 'gate', file: f.test, claim: `gate red: ${f.test}`, evidence: f.error, fix: 'make the gate green without editing, skipping or deleting an existing test' })));
      rounds.push({ round, gate: `❌ ${gateLine(gate)}`, raised: open.length, confirmed: open.length, covered: '' });
      log(`round ${round}: gate red, ${open.length} failing`);
    }
    await show();

    for (const k of new Set(open.map(key))) streak.set(k, (streak.get(k) || 0) + 1);
    for (const k of [...streak.keys()]) if (!open.some((f) => key(f) === k)) streak.delete(k);
    if (open.some((f) => f.category === 'scope')) return handBack('Audit', 'the ticket itself is in question', open);
    if (open.some((f) => (streak.get(key(f)) || 0) > STUCK_AFTER)) return handBack('Audit', `the same finding survived ${STUCK_AFTER} fix attempts`, open);
    if (audited >= profile.buildRounds || round >= profile.buildRounds + 2) return handBack('Audit', `still not clean after ${round} rounds`, open);

    const fixed = await agent(`fix#${round}`,
      `${ticket}\nOn branch ${branch}, with the spec at ${specPath}, these were independently confirmed:\n\n${list(open)}\n\n` +
      `Fix each at its cause, and only what is listed. A gate failure in a test or code this branch did not touch may be the environment, not you: run that test on ` +
      `origin/${BASE} (a scratch worktree, then remove it) — if it fails there too, change nothing for it and return ok=false with a summary that starts "pre-existing:". ` +
      `Never work around a failure by changing something the ticket did not ask for. Never edit an existing test to make it pass, never skip or delete one. If a finding shows the spec was wrong, fix the spec too and say so; ` +
      `if a fix changes what a context doc says, fix the doc. \`npm test\` after every edit; a browser test you added or changed runs alone by title; not the whole suite. Leave \`git status\` clean. Commit and push.`,
      S.BUILT, profile.build);
    if (!fixed) return handBack('Audit', 'the fixer did not finish', open);
    if (!fixed.ok) return handBack(gate.ok ? 'Audit' : 'Gate', fixed.summary, open);
  }

  // Learn: what the audits caught becomes context the next run reads — on this branch, before review.
  let lessons: { pattern: string; proposal: string }[] = [];
  if (profile.learns && history.length) {
    const learned = await agent('learn',
      `On branch ${branch}, independent audits confirmed these problems the builder had missed:\n\n${list(history)}\n\n` +
      `Find at most two classes of mistake that would recur on a different ticket — not this ticket's specifics. Write each where it would have been seen in time: ` +
      `the *Gotchas* of the context/engineering-context/ doc for that area (usually), or CLAUDE.md (only for a decision). If it is already written, make it shorter and higher instead. ` +
      `Present tense, checked against the code. \`npm test\`. Commit as "docs(context): …" and push. If nothing generalises, change nothing and return an empty list.`,
      S.LESSON, profile.think);
    lessons = learned?.lessons || [];
  }

  // ════════════════════════════════════════════════════════════════════════
  // 6. Pull request — composed from what the run knows; no agent needed.
  // ════════════════════════════════════════════════════════════════════════
  await enter('Pull request');
  const final = await command('push', [
    `git fetch -q origin ${BASE}`,
    `if ! git merge --no-edit origin/${BASE} >"$JOB/merge.log" 2>&1; then git merge --abort; echo '{"ok":false,"why":"conflict"}' > "$JOB/result.json"; exit 0; fi`,
    `AFTER=$(git log --name-only --format= ${gate.sha}..HEAD | grep -vE '^(context/|specs/)|\\.md$' | grep -v '^$' | sort -u | paste -sd, -)`,
    `git push -q -u origin HEAD >"$JOB/push.log" 2>&1 || { echo '{"ok":false,"why":"push failed"}' > "$JOB/result.json"; exit 0; }`,
    `SHOTS=""; if [ "${built.ui ? 1 : 0}" = 1 ]; then TITLES=$(git diff origin/${BASE}...HEAD -- tests/ | grep -oE "^\\+\\s*test\\('[^']+'" | sed -E "s/^\\+\\s*test\\('//; s/'$//" | paste -sd'|' -); ` +
      `if [ -n "$TITLES" ]; then FILES=$(git diff --name-only origin/${BASE}...HEAD -- 'tests/*.spec.js' | paste -sd' ' -); rm -rf .screenshots/pr; PR_SHOTS=1 npx playwright test $FILES -g "$TITLES" --project=desktop >"$JOB/shots.log" 2>&1; ` +
      `ls .screenshots/pr/*.png >/dev/null 2>&1 && SHOTS=$(GITHUB_REPOSITORY=${ALLOWED_REPO} node scripts/pr-media.mjs ${n} .screenshots/pr/*.png 2>>"$JOB/shots.log"); fi; fi`,
      `STAT=$(git diff --stat origin/${BASE}...HEAD | tail -40)`,
    `SHOTS="$SHOTS" STAT="$STAT" AFTER="$AFTER" HEAD_SHA=$(git rev-parse HEAD) node -e 'const e=process.env;require("fs").writeFileSync(e.JOB+"/result.json",JSON.stringify({ok:true,head:e.HEAD_SHA,shots:e.SHOTS,stat:e.STAT,codeAfterGate:(e.AFTER||"").split(",").filter(Boolean)}))'`,
  ].join('\n'));
  if (!final?.ok) return handBack('Pull request', final?.why === 'conflict' ? `conflicts with ${BASE} after the gate` : 'could not push the branch');
  if (final.codeAfterGate?.length) return handBack('Pull request', `code changed after the gate passed: ${final.codeAfterGate.join(', ')}`);

  const fixedCount = rounds.reduce((x, r) => x + r.confirmed, 0);
  const notVerified = [
    ...(!(red && red.checked) ? ['no red-check ran — no app code changed'] : []),
    ...(red && red.checked && !red.failedOnBase ? ['the new tests also pass without the change (judged a refactor)'] : []),
    ...(gate.scope === 'branch' ? ['only the browser specs this change reaches ran; main runs the whole suite after merge'] : []),
    ...(!profile.reaudit && rounds.some((r) => r.confirmed) ? ['the fix for what the audit found was re-gated, not re-audited'] : []),
    ...(gate.browser.flakyTests?.length ? [`${gate.browser.flakyTests.length} test(s) flaky, passed on retry`] : []),
  ];
  const body = [
    `Closes #${n} · 📄 [Spec](https://github.com/${ALLOWED_REPO}/blob/${branch}/${specPath})`,
    '',
    '## What changes',
    built.summary,
    final.shots ? `\n${final.shots}` : '',
    built.tryIt ? `\n## 🧪 Try it\n${built.tryIt}\n\nOpen it on this pull request's Vercel preview (link below once it builds).` : '',
    '',
    '## ✅ Done when',
    ...doneWhen.map((c) => `- [x] ${c}`),
    plan.spec.decisions?.length ? `\n## 🤔 Decisions for you\n${plan.spec.decisions.map((d: string) => `- ${d}`).join('\n')}` : '',
    built.keyFiles?.length ? `\n## 👀 Where to look\n${built.keyFiles.map((k: any) => `- \`${k.file}\` — ${k.why}`).join('\n')}` : '',
    '',
    '## 🛡️ Checks',
    [`Tests pass — ${gateLine(gate)}${gate.scope === 'branch' ? ' (the specs this change reaches)' : ', desktop and mobile'}`,
      ...(red && red.checked && red.failedOnBase ? ['the new tests fail without the change'] : []),
      `independent audit: ${fixedCount ? `${fixedCount} problem${fixedCount === 1 ? '' : 's'} found and fixed, ` : ''}clean after ${rounds.length} round${rounds.length === 1 ? '' : 's'}`].join(' · '),
    notVerified.length ? `\n**Not verified:** ${notVerified.join('; ')}.` : '',
    minors.length ? `\n<details><summary>Worth a closer look</summary>\n\n${list(minors)}\n</details>` : '',
    `\n<details><summary>Every file changed</summary>\n\n\`\`\`\n${final.stat}\n\`\`\`\n</details>`,
    `\n<details><summary>Audit rounds</summary>\n\n| Round | Gate | Audit | Covered |\n| --- | --- | --- | --- |\n${rounds.map((r) => `| ${r.round} | ${r.gate} | ${r.raised} raised · ${r.confirmed} confirmed | ${r.covered || '—'} |`).join('\n')}` +
      (lessons.length ? `\n\nLessons written to the docs: ${lessons.map((l) => l.proposal).join('; ')}` : '') + '\n</details>',
    '',
    `<sub>🏭 Built by Ship on Vercel · ${profile.size}${profile.escalated ? ', escalated' : ''} · ${triage.why} · ${dollars(spend.total)} of AI · [durable run](${runUrl})</sub>`,
  ].filter((l) => l !== '').join('\n');
  const pr = await openPullRequest({ head: branch, base: BASE, title: issueTitle, body, draft: false, labels: [`ship:${profile.size}`] });
  // Listen for the merge from the moment the pull request exists: a person may
  // merge while the preview builds or review runs, and a close that finds no
  // hook is lost. A hook keeps what it receives until the run awaits it.
  const decision = createHook<{ merged: boolean; sha?: string }>({ token: `pr:${ALLOWED_REPO}#${pr.number}` });
  prUrl = pr.url;
  await setLabels(n, ['ready-for-human'], ['ai-working']);
  log(`pull request #${pr.number} opened`);
  await show();

  // ════════════════════════════════════════════════════════════════════════
  // 7. Preview — Vercel builds the pull request; the review reads it there.
  // ════════════════════════════════════════════════════════════════════════
  await enter('Preview');
  let preview = await previewForPr(pr.number);
  for (let i = 0; i < 60 && (preview.state === 'pending' || preview.state === 'none'); i++) {
    await sleep('20s');
    preview = await previewForPr(pr.number);
  }
  if (preview.state === 'ready') { previewUrl = preview.url!; log(`preview ready: ${previewUrl}`); }
  else { status.Preview = 'failed'; log(`preview ${preview.state}${preview.url ? `: ${preview.url}` : ''}`); }

  // ════════════════════════════════════════════════════════════════════════
  // 8. Review & QA — two more workflows, in parallel, each on its own
  //    sandbox; QA tries to break the change on the preview itself.
  // ════════════════════════════════════════════════════════════════════════
  await disposeSandbox(box); // ship is done with its machine; review and QA bring their own
  await enter('Review & QA');
  const verdictLine = (name: string, v: any) => !v || v.verdict === 'none' ? `${name}: did not run` : `${name}: ${v.verdict === 'pass' ? `pass, ${v.confidence} confidence` : 'blocker'}${v.skipped ? ` (${v.skipped})` : ''}`;
  // Review and QA are one more audit round: what they find, ship fixes itself — the same fixer,
  // gate and push as before the PR — then asks them again (each re-checks only what changed).
  // Two rounds at most; still not clean goes to a person, with the pull request left open.
  const checks = async (round: number) => {
    // Under ship, review leaves stale docs to ship's fixer: two workflows never push one branch at once.
    // Screenshots ride along: every round's push is a new preview, so the comment shows what will merge.
    const [reviewRun, qaRun, shotsRun] = await Promise.all([start(review, [{ pr: pr.number, fixDocs: false }]), start(qa, [{ pr: pr.number }]), start(shots, [{ pr: pr.number }])]);
    log(`review & QA ${round ? `round ${round + 1} ` : ''}— runs ${reviewRun.runId}, ${qaRun.runId} · screenshots ${shotsRun.runId}`);
    const [rv, qv, sv]: any[] = await Promise.all([reviewRun.returnValue.catch(() => null), qaRun.returnValue.catch(() => null), shotsRun.returnValue.catch(() => null)]);
    log(verdictLine('review', rv));
    log(verdictLine('QA', qv));
    log(`screenshots: ${sv?.outcome === 'posted' ? `${sv.pages} page${sv.pages === 1 ? '' : 's'} — ${sv.url}` : sv?.outcome ?? 'did not run'}`);
    for (const v of [rv, qv]) if (v?.spend) { spend.total += v.spend; spend.byPhase['Review & QA'] = (spend.byPhase['Review & QA'] || 0) + v.spend; }
    const found: Finding[] = [
      ...(rv?.blockers || []).map((b: any) => ({ severity: 'blocker', category: `review:${b.category}`, file: b.file, line: b.line, claim: b.claim, evidence: [b.how && `how: ${b.how}`, b.harm && `harm: ${b.harm}`, b.evidence].filter(Boolean).join(' · ') || 'raised by review', fix: 'resolve what the review found' })),
      ...(rv?.docs || []).map((d: any) => ({ severity: 'blocker', category: 'docs-stale', file: d.file, line: d.line, claim: d.claim, evidence: d.evidence || 'raised by review', fix: 'make the doc say what the code does now' })),
      ...(qv?.bugs || []).map((b: any) => ({ severity: 'blocker', category: 'qa-bug', file: 'tests/qa-probe.spec.js', claim: `${b.title}: ${b.aim}`, evidence: `on the preview — expected: ${b.expected ?? '?'} · actual: ${b.actual ?? '?'}`, fix: 'make the change behave as expected, and add a test that proves it' })),
    ];
    return { rv, qv, found };
  };
  let verdicts = await checks(0);
  for (let round = 1; verdicts.found.length && round <= 2; round++) {
    const open = verdicts.found;
    log(`review & QA found ${open.length} thing${open.length === 1 ? '' : 's'} to fix — fix round ${round}`);
    await show();
    box = `ship-${n}-${workflowRunId.slice(-8).toLowerCase()}-r${round}`;
    await prepareSandbox(box, BASE, 'push');
    const onBranch = await command(`branch#r${round}`, `git fetch -q --prune origin && git checkout -q -B "${branch}" "origin/${branch}" && echo '{"ok":true}' > "$JOB/result.json"`);
    if (!onBranch) { log('could not check the branch out again'); break; }
    const fixed = await agent(`fix#r${round}`,
      `${ticket}\nThe pull request for this ticket, #${pr.number} on branch ${branch} (spec ${specPath}), was reviewed and tried on its preview. These were found:\n\n${list(open)}\n\n` +
      `Fix each at its cause, and only these. A stale doc: make it say what the code does now, and \`git grep -n -i\` CLAUDE.md, .claude/rules/ and context/ for the same claim elsewhere. ` +
      `A QA bug: reproduce it in a test first, then fix it. Never edit an existing test to make it pass, never skip or delete one. \`npm test\` after every edit; a browser test you add or change runs alone by title. ` +
      `Leave \`git status\` clean. Commit and push.`,
      S.BUILT, profile.build);
    if (!fixed?.ok) { log(`the fixer could not finish: ${fixed?.summary ?? 'no result'}`); break; }
    const ran = await command(`gate#r${round}`, gateScript(BASE, profile.gateScope));
    const g = readGate(ran?.gate ?? '');
    rounds.push({ round: rounds.length + 1, gate: `${g.ok ? '✅' : '❌'} ${gateLine(g)} (after review)`, raised: open.length, confirmed: open.length, covered: 'fixed what review and QA found' });
    if (!g.ok) { log('the gate is red after the fix'); break; }
    await command(`push#r${round}`, `git push -q origin HEAD >"$JOB/push.log" 2>&1; echo '{"ok":true}' > "$JOB/result.json"`);
    await disposeSandbox(box);
    await show();
    verdicts = await checks(round);
  }
  await disposeSandbox(box);
  if (verdicts.found.length) {
    status['Review & QA'] = 'failed';
    await setLabels(n, ['needs-human'], []);
    await comment(pr.number, `### 🏭 Still open after ${verdicts.rv || verdicts.qv ? 'review and QA' : 'the checks'}\n\nShip fixed what it could; these remain:\n\n${list(verdicts.found)}\n\n` +
      `The pull request stays open — merge it as it is, or reply with how to settle these and ship will pick it up.`);
  }
  await comment(pr.number, `<sub>🏭 Ship on Vercel · AI spend for this ticket, build to review: ${dollars(spend.total)} — ${Object.entries(spend.byPhase).map(([p, c]) => `${p} ${dollars(c)}`).join(', ')}</sub>`);

  // ════════════════════════════════════════════════════════════════════════
  // 9. Merge — a person's click. The run sleeps until GitHub says so.
  // ════════════════════════════════════════════════════════════════════════
  await enter('Merge');
  await show('waiting for you to review and merge');
  const outcome = await decision;
  if (!outcome.merged) {
    status.Merge = 'skipped';
    await show('closed without merging');
    return { outcome: 'closed', issue: n, pr: prUrl, spend: spend.total };
  }

  // ════════════════════════════════════════════════════════════════════════
  // 10. Production — merged means deployed; check it really is.
  // ════════════════════════════════════════════════════════════════════════
  if (BASE !== 'main') {
    status.Production = 'skipped';
    await show(`merged into ${BASE} — production deploys from main`);
    return { outcome: 'merged', issue: n, pr: prUrl, preview: previewUrl, base: BASE, spend: spend.total };
  }
  await enter('Production');
  let prod = await findDeployment(outcome.sha || final.head, 'Production');
  for (let i = 0; i < 60 && (prod.state === 'pending' || prod.state === 'none'); i++) {
    await sleep('20s');
    prod = await findDeployment(outcome.sha || final.head, 'Production');
  }
  const health = await productionHealth(PRODUCTION_URL);
  status.Production = prod.state === 'ready' && health.ok ? 'done' : 'failed';
  log(`production ${prod.state}; health ${health.ok ? `ok (${health.sessions} sessions)` : `failing (${health.status})`}`);
  await show(status.Production === 'done' ? `live on ${PRODUCTION_URL}` : 'merged, but production is not healthy');
  if (status.Production === 'done') await setLabels(n, [], ['ready-for-human']);
  return { outcome: 'shipped', issue: n, pr: prUrl, preview: previewUrl, production: status.Production === 'done', spend: spend.total };

  // ── helpers that need the run's state ─────────────────────────────────────
  async function confirm(findings: Finding[], what: string, t: string): Promise<Finding[]> {
    const judged = await Promise.all(dedupe(findings).map((f) => agent(`skeptic:${f.category}`,
      `${t}\nThe spec is ${specPath}, on branch ${branch}. An auditor claims this ${f.severity === 'minor' ? 'minor problem' : 'blocker'} in ${what}. Try to REFUTE it. ` +
      `Open the cited file and line yourself; \`npm test\` is fine, but do not boot the app or run Playwright. Refute if the line does not say what is claimed, if the behaviour is already on origin/${BASE}, ` +
      `if it is style rather than a defect, if its fix would contradict CLAUDE.md, or if CLAUDE.md or the spec *as first committed* (\`git log --diff-filter=A --format=%H -- ${specPath}\`, then \`git show\`) shows it was deliberate. ` +
      `A later edit to the spec does not make a missed Done-when criterion deliberate. If you cannot tell, it is NOT refuted.` +
      (f.also?.length ? ' Several auditors read this location differently ("also"): refute only if EVERY reading is wrong.' : '') + `\n\n${list([f])}`,
      S.REFUTATION, profile?.think ?? 'sonnet', 'medium').then((v) => (v && v.refuted ? null : f))));
    // A skeptic that did not finish refuted nothing.
    return judged.filter(Boolean) as Finding[];
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────
function profileFor(f: any): Profile {
  const areas = new Set<string>((f?.areas || []).filter((a: string) => a !== 'tests' && a !== 'docs'));
  const heavy = [f?.changesRule && 'changes a business rule', f?.changesData && 'changes the schema, seed or stored data', areas.has('harness') && 'changes the harness'].filter(Boolean);
  if (heavy.length) return { ...PROFILES.full, why: heavy.join(', ') };
  const p: Profile = { ...PROFILES.small, why: '' };
  const added: string[] = [];
  const broad = [f?.changesApi && 'changes the API', areas.size >= 3 && `touches ${areas.size} areas`, f?.files >= 7 && `~${f.files} app files`].filter(Boolean);
  if (broad.length) { p.lenses = ['criteria', 'rules', 'browser']; p.buildRounds = 3; added.push(`${broad.join(', ')} → criteria and rules auditors`); }
  if (f?.openQuestions >= 2) { p.planAudits = ['combined']; p.planRounds = 1; added.push(`${f.openQuestions} open questions → a plan audit`); }
  if (f?.uiInteraction || f?.layoutFit) { p.browserAlways = true; p.probes = 4; added.push('interaction or fit → a browser audit'); }
  return { ...p, why: [f?.why || 'a contained change', ...added].join('; ') };
}

function gateScript(base: string, scope?: 'branch') {
  return [
    `git fetch -q origin ${base}`,
    `SYNC=current; CONFLICTS=""`,
    `if git merge --no-edit origin/${base} >"$JOB/merge.log" 2>&1; then grep -q "Already up to date" "$JOB/merge.log" || { SYNC=merged; git push -q origin HEAD || true; }; ` +
      `else SYNC=conflict; CONFLICTS=$(git diff --name-only --diff-filter=U | paste -sd, -); git merge --abort; fi`,
    `GATE=""; RED=""; FACTS=""`,
    `if [ "$SYNC" != conflict ]; then`,
    `  GATE=$(${scope === 'branch' ? 'GATE_SCOPE=branch ' : ''}GATE_BASE=origin/${base} node scripts/gate.mjs 2>"$JOB/gate.err" | tail -1)`,
    `  case "$GATE" in *'"ok":true'*) RED=$(${scope === 'branch' ? 'RED_SCOPE=unit ' : ''}GATE_BASE=origin/${base} node scripts/red-check.mjs 2>"$JOB/red.err" | tail -1);; esac`,
    `  FACTS=$(node scripts/qa-facts.mjs origin/${base} 2>/dev/null | tail -1)`,
    `fi`,
    `SYNC="$SYNC" CONFLICTS="$CONFLICTS" GATE="$GATE" RED="$RED" FACTS="$FACTS" node -e 'const e=process.env;require("fs").writeFileSync(e.JOB+"/result.json",JSON.stringify({sync:e.SYNC,conflicts:(e.CONFLICTS||"").split(",").filter(Boolean),gate:e.GATE,red:e.RED,facts:e.FACTS}))'`,
  ].join('\n');
}

function readGate(line: string) {
  try {
    const r = JSON.parse(line);
    if (typeof r.ok !== 'boolean' || typeof r.sha !== 'string' || !r.unit || !r.browser || !Array.isArray(r.browser.failed) || !Array.isArray(r.tampered)) throw new Error('not a gate result');
    if (r.dirty) return { ...r, ok: false, browser: { ...r.browser, failed: [...r.browser.failed, { test: 'git status', error: 'the gate ran on uncommitted changes — commit or discard them' }] } };
    return r;
  } catch {
    return { ok: false, sha: '?', unit: { passed: 0, failed: 0 }, tampered: [], browser: { passed: 0, flaky: 0, skipped: 0, failed: [{ test: 'gate.mjs', error: `unreadable gate output: ${String(line).slice(0, 200)}` }] } };
  }
}

function parseRed(line: string) {
  try {
    const r = JSON.parse(line);
    if (typeof r.checked !== 'boolean') return null;
    if (r.checked && (typeof r.failedOnBase !== 'boolean' || !Array.isArray(r.tests) || !Array.isArray(r.reverted))) return null;
    return r;
  } catch { return null; }
}

function gateLine(r: any) {
  return `unit ${r.unit.passed} passed${r.unit.failed ? ` · ${r.unit.failed} failed` : ''} · browser ${r.browser.passed} passed` +
    (r.browser.failed.length ? ` · ${r.browser.failed.length} failed` : '') + (r.browser.flaky ? ` · ${r.browser.flaky} flaky` : '');
}
