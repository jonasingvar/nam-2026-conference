import { createHook, getWorkflowMetadata, setAttributes, sleep } from 'workflow';
import { start } from 'workflow/api';
import { review } from './review';
import { qa } from './qa';
import { shots } from './shots';
import { pinPreview } from '../lib/shots-steps';
import { runJob } from '../lib/jobs';
import { routedAgent } from '../lib/kit';
import { chooseModels, describe, modelBook, type Job, type ModelBook } from '../lib/models';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import {
  comment, findDeployment, findEarlierAttempt, openPullRequest, peopleSaid, previewForPr, productionHealth, progress, readIssue, readPullRequest, setLabels, type Issue,
} from '../lib/github-steps';
import { judgeAnswers, triageIssue, type Size, type Triage } from '../lib/triage';
import { isTestGap } from '../lib/review-policy';
import { chooseTests, recordGate, stageTestMap } from '../lib/phases';
import { classify as classifyFiles, mergeShards, type Facts, type Project, type Selection } from '../lib/select';
import { factsScript, runShards } from '../lib/testrun';
import { ALLOWED_REPO, FACTORY_DASHBOARD, FULL_SUITE_LABEL, PRODUCTION_URL, REPO_DIR } from '../lib/constants';
import * as S from './schemas';

/**
 * ship — a GitHub issue to a merged, deployed change, as one durable run.
 *
 *   triage (Jev) → plan (spec, first commit) → [plan audit] → build (test first)
 *   → loop { select → (gate on desktop ∥ mobile, red-check) ∥ (independent audit → skeptic) → fix }
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
  size: Size; why: string;
  planAudits: string[]; planRounds: number; lenses: string[]; buildRounds: number;
  browserAlways?: boolean; probes: number; gateScope?: 'branch'; reaudit: boolean; learns: boolean; escalated?: boolean;
};

const PROFILES: Record<Size, Omit<Profile, 'why'>> = {
  // Every size gates on the tests its change needs (lib/select.ts: the map's
  // candidates, the specs it reaches and smoke, never less than GATE_SCOPE=branch);
  // verify and main run more. `gateScope` now only narrows the red-check to unit tests.
  // A person is waiting and the change is understood: one combined audit, a fix re-gated rather than re-audited.
  fast: { size: 'fast', planAudits: [], planRounds: 0, lenses: ['combined'], buildRounds: 2, probes: 0, gateScope: 'branch', reaudit: false, learns: false },
  // Contained: one combined audit, a browser audit only when
  // something visible changed without a browser test to prove it.
  small: { size: 'small', planAudits: [], planRounds: 0, lenses: ['combined', 'browser'], buildRounds: 2, probes: 2, reaudit: true, learns: true },
  // A rule, stored data or the harness: Opus, a plan audit, three lenses.
  full: { size: 'full', planAudits: ['criteria', 'fit'], planRounds: 3, lenses: ['criteria', 'rules', 'browser'], buildRounds: 4, probes: 5, reaudit: true, learns: true },
};

const STUCK_AFTER = 2;

/** The jobs a ship run books a model for. */
const SHIP_JOBS: Job[] = ['spec', 'planAudit', 'reviseSpec', 'implement', 'fix', 'audit', 'browserAudit', 'skeptic', 'learn', 'testSelect'];

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
    const box = `ship-${input.issue}-${workflowRunId.slice(-8).toLowerCase()}`;
    await Promise.all([box, `${box}-gd`, `${box}-gm`].map((b) => disposeSandbox(b))).catch(() => null);
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
    // Done and current phases marked; the ones still to come in plain text, so the line reads as a path, not a grid.
    PHASES.map((p) => ({ todo: p, running: `**⏳ ${p}**`, done: `✅ ${p}`, skipped: `<s>${p}</s>`, failed: `❌ **${p}**` }[status[p]])).join(' → '),
    '',
    profile ? `**Size:** ${profile.size}${profile.escalated ? ' (escalated on its diff)' : ''} — ${profile.why.replace(/^Jev: \w+ \((\d+% sure)\)$/, 'Jev, $1')}` : '',
    branch ? `**Branch:** \`${branch}\`${specPath ? ` · 📄 [Spec](https://github.com/${ALLOWED_REPO}/blob/${branch}/${specPath})` : ''}` : '',
    prUrl ? `**Pull request:** ${prUrl}${previewUrl ? ` · 🔎 [Preview](${previewUrl})` : ''}` : '',
    rounds.length ? `\n| Round | Gate | Audit |\n| --- | --- | --- |\n${rounds.map((r) => `| ${r.round} | ${r.gate} | ${r.raised} raised · ${r.confirmed} confirmed |`).join('\n')}` : '',
    '',
    `**AI spend so far:** ${dollars(spend.total)} over ${spend.agents} agent run${spend.agents === 1 ? '' : 's'}` +
      (Object.keys(spend.byModel).length ? ` (${Object.entries(spend.byModel).map(([m, c]) => `${m} ${dollars(c)}`).join(', ')})` : '') +
      (models && models.attempts.length ? ` · expected ${dollars(models.totals().est)}${models.climbs.length ? ` · ${models.climbs.length} climb${models.climbs.length === 1 ? '' : 's'}` : ''}` : ''),
    models && models.table() ? `\n<details open><summary><b>Models</b> — which job runs on what, and what it costs</summary>\n\n${models.table()}\n\n<sub>Picked per job by Jev from AI Gateway's live catalog: the cheapest tier likely to be enough. A failure climbs one tier (↑).</sub>\n</details>` : '',
    lines.length ? `\n<details><summary>Log</summary>\n\n${lines.map((l) => `- ${l}`).join('\n')}\n</details>` : '',
    '',
    // An HTML link: GitHub does not render markdown links inside a <sub> line.
    `<sub>Durable run <a href="${runUrl}">${workflowRunId}</a> · resumes from its last finished step if anything dies</sub>`,
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
      // Which model each job ran on (job=model, ↑ a climb), what was expected, and how often a cheap pick failed.
      ...(models && models.attempts.length ? { models: models.summary().slice(0, 250), est_usd: models.totals().est.toFixed(2), climbs: String(models.climbs.length) } : {}),
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

  // Which model each job runs on: Jev's choice, priced from the gateway's catalog, climbing on failure.
  let models: ModelBook | null = null;
  /** The tier of whichever job last wrote the code: a red gate after it sends the fixer above it. */
  let lastEdit: { job: Job; tier: number; model: string } | null = null;
  async function agent(label: string, prompt: string, schema: any, job: Job): Promise<any | null> {
    const { value, pick } = await routedAgent({
      box, jobId, book: models!, job, label, prompt: PREAMBLE + prompt, schema, log,
      onRun: (_r, cost) => {
        spend.total += cost.total;
        spend.agents += 1;
        spend.byPhase[current] = (spend.byPhase[current] || 0) + cost.total;
        for (const [m, c] of Object.entries(cost.byModel)) spend.byModel[m] = (spend.byModel[m] || 0) + c;
      },
    });
    if (job === 'implement' || job === 'fix') lastEdit = { job, tier: pick.tier, model: pick.model };
    // The phase step already streamed this agent's result; the comment catches up at the next phase.
    return value;
  }
  const chooseFor = async (size: Size, jobs: Job[]) => {
    const choice = await chooseModels(`GitHub issue #${n}: ${issueTitle}\n\n${issue.body}` + (input.notes ? `\n\nThe person who asked wrote: ${input.notes}` : ''), size, jobs);
    if (models) models.adopt(choice); else models = modelBook(choice, size);
    // The per-job choice is the Models table; the log keeps one line, and the stream the detail.
    log(`models chosen for a ${size} run by Jev in ${choice.ms} ms${choice.live ? '' : ' (last known prices)'}${choice.why ? ` — ${choice.why}` : ''}`);
  };

  /** A shell job whose script writes $JOB/result.json; returns it parsed, or null. */
  async function command(label: string, script: string, where = box): Promise<any | null> {
    const done = await runJob(where, jobId(label), {}, script);
    if (!done) return null;
    try { return JSON.parse(done.result); } catch { log(`${label}: unreadable result (exit ${done.exit}) ${done.tail.slice(-200)}`); return null; }
  }

  // ── The gate: the tests this change needs, desktop and mobile side by side ──
  // Two sandboxes of their own (forked from the warm one once, resumed each round), so ship's own
  // sandbox is free for the auditors while the tests run. They take the commit from a ref of its own
  // (refs/factory/gate/<sha>): a push to the branch of an open pull request would start verify on
  // code the gate has not finished with.
  const shardBox: Record<Project, string> = { desktop: `${box}-gd`, mobile: `${box}-gm` };
  let shardsReady: Promise<unknown> | null = null;
  const disposeShards = async () => { if (shardsReady) { shardsReady = null; await Promise.all([disposeSandbox(shardBox.desktop), disposeSandbox(shardBox.mobile)]); } };
  /** The selection the last gate ran, for the pull request's checks line and verify's record. */
  let lastSel: Selection | null = null;
  let fullSuite = false;
  let gateRef = '';
  /** Merge the base, put the commit where the shards can fetch it, and choose the tests. */
  async function selectGate(tag: string, pushMerged: boolean) {
    const staged = await stageTestMap(box);
    const ran = await command(`select${tag}`, [
      `git fetch -q origin ${BASE}`,
      gateRef ? `git push -q origin ":${gateRef}" >/dev/null 2>&1 || true` : '',
      `SYNC=current; CONFLICTS=""`,
      `if git merge --no-edit origin/${BASE} >"$JOB/merge.log" 2>&1; then grep -q "Already up to date" "$JOB/merge.log" || { SYNC=merged; ${pushMerged ? 'git push -q origin HEAD || true; ' : ''}}; ` +
        `else SYNC=conflict; CONFLICTS=$(git diff --name-only --diff-filter=U | paste -sd, -); git merge --abort; fi`,
      `SHA=$(git rev-parse HEAD); QA=""; touch "$JOB/diff.txt"`,
      `if [ "$SYNC" != conflict ]; then`,
      `  git push -q origin "HEAD:refs/factory/gate/$SHA" >"$JOB/ref.log" 2>&1 || SYNC=unpushed`,
      `  QA=$(node scripts/qa-facts.mjs origin/${BASE} 2>/dev/null | tail -1)`,
      `  git diff origin/${BASE}...HEAD | head -c 40000 > "$JOB/diff.txt"`,
      // What the auditor is told to look at: removed assertions or added skips (gate.mjs's own reader), known before the gate runs.
      `  git diff origin/${BASE}...HEAD -- tests/ playwright.config.js package.json scripts/gate.mjs > "$JOB/watched.diff"`,
      `  node --input-type=module -e 'import { tampered } from "./scripts/gate.mjs"; import { readFileSync } from "node:fs"; console.log(JSON.stringify(tampered(readFileSync(process.env.JOB + "/watched.diff", "utf8"))))' > "$JOB/tampered.json" 2>/dev/null || echo '[]' > "$JOB/tampered.json"`,
      `fi`,
      `export EXTRA=$(SYNC="$SYNC" CONFLICTS="$CONFLICTS" SHA="$SHA" QA="$QA" node -e 'const e=process.env,fs=require("fs");let t=[];try{t=JSON.parse(fs.readFileSync(e.JOB+"/tampered.json","utf8"))}catch{}console.log(JSON.stringify({sync:e.SYNC,conflicts:(e.CONFLICTS||"").split(",").filter(Boolean),sha:e.SHA,qaFacts:e.QA,tampered:t,diff:fs.readFileSync(e.JOB+"/diff.txt","utf8")}))')`,
      `if [ "$SYNC" = conflict ]; then node -e 'require("fs").writeFileSync(process.env.JOB+"/result.json",process.env.EXTRA)'; exit 0; fi`,
      factsScript(BASE),
    ].filter(Boolean).join('\n'));
    if (!ran) return null;
    if (ran.sync === 'conflict') return { ran, sel: null as Selection | null };
    gateRef = `refs/factory/gate/${ran.sha}`;
    const facts = (ran.facts ?? null) as Facts | null;
    const p = models!.pick('testSelect');
    const chosen = await chooseTests({
      classified: classifyFiles(facts?.changed ?? []), facts, diff: String(ran.diff || ''), escapes: staged.escapes,
      pick: { model: p.model, price: models!.catalog[p.model] ?? null },
      // Never weaker than GATE_SCOPE=branch; everything when a person asked for it.
      options: { floor: true, full: fullSuite ? `the ${FULL_SUITE_LABEL} label` : undefined },
    });
    if (chosen.asked) {
      models!.record({ job: 'testSelect', label: `select${tag}`, model: p.model, tier: p.tier, est: p.est, cost: chosen.cost, ok: !!chosen.answer, seconds: chosen.seconds });
      spend.total += chosen.cost;
    }
    const sel = chosen.selection;
    log(`select: ${sel.mode} — ${sel.reason}; ${sel.ran} of ${sel.total} browser tests${sel.notes.length ? ` (${sel.notes.join('; ')})` : ''}${chosen.error ? ` — selector failed: ${chosen.error}` : ''}`);
    await setAttributes({ selection: sel.mode, selected: String(sel.ran), of: String(sel.total) });
    return { ran, sel };
  }
  const gateRecord = (head: string, g: any, sel: Selection) => ({
    by: 'ship' as const, sha: head, ranAt: String(g.sha), pr: null, ok: !!g.ok, unitOk: !g.unit.failed,
    mode: sel.mode, reason: sel.reason, confidence: sel.confidence, tests: sel.tests,
  });
  /** The two shards on the selected commit; one verdict, as gate.mjs would give it, and the red-check from desktop. */
  async function gateShards(sel: Selection, sha: string, tag: string) {
    if (!shardsReady) shardsReady = Promise.all([prepareSandbox(shardBox.desktop, BASE, 'none'), prepareSandbox(shardBox.mobile, BASE, 'none')]);
    await shardsReady;
    const checkout = `git fetch -q --prune origin && git fetch -q origin "+refs/factory/gate/${sha}:refs/factory/gate/${sha}" && git checkout -q --detach ${sha} && ` +
      `{ [ "$(sha256sum package-lock.json | cut -c1-16)" = "$(cat /vercel/.factory/prepared)" ] || { npm ci --no-audit --no-fund >/dev/null 2>&1 && sha256sum package-lock.json | cut -c1-16 > /vercel/.factory/prepared; }; }`;
    const out = await runShards(sel, {
      base: BASE, full: sel.mode === 'full', tag, red: profile!.gateScope === 'branch' ? 'unit' : 'all',
      run: (p, label, script) => command(label, `${checkout} || { echo '{"gate":"","red":""}' > "$JOB/result.json"; exit 0; }\n${script}`, shardBox[p]),
    });
    lastSel = sel;
    const merged = mergeShards({ desktop: out.desktop.gate, mobile: out.mobile.gate });
    return { gate: { ...merged, scope: sel.mode }, red: out.desktop.red };
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
    await Promise.all([disposeSandbox(box), disposeShards()]);
    return { outcome: 'needs-human', issue: n, stage, reason: why, draft: draft?.url ?? null, spend: spend.total };
  }

  // ════════════════════════════════════════════════════════════════════════
  // 1. Triage — read the issue, size the run with Jev.
  // ════════════════════════════════════════════════════════════════════════
  const issue = await readIssue(n);
  fullSuite = issue.labels.includes(FULL_SUITE_LABEL);
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
  // A sized run is chosen for as small until its plan says otherwise (then chosen again).
  await chooseFor(profile?.size ?? 'small', SHIP_JOBS);

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
    S.PLAN, 'spec');
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
  if (!profile) {
    profile = profileFor(plan.facts);
    if (profile.size !== 'small') await chooseFor(profile.size, SHIP_JOBS.filter((j) => j !== 'spec'));
  }
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
      S.FINDINGS, 'planAudit')));
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
      S.SPEC_REVISED, 'reviseSpec');
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
    `Leave \`git status\` clean.` +
    (carried.length ? `\n\nThe plan audit left these for the build to resolve:\n${list(carried)}` : ''),
    S.BUILT, 'implement');
  if (!built || !built.ok) return handBack('Build', built ? built.summary : 'the builder did not finish');

  // ════════════════════════════════════════════════════════════════════════
  // 5. Gate → audit → fix, until a round is clean.
  // ════════════════════════════════════════════════════════════════════════
  const LENS_ASK: Record<string, string> = {
    combined: `Read the ticket, then the spec (does it read the ticket right? a misreading is criterion-unmet; a self-contradicting ticket is scope), then \`git diff origin/${BASE}...HEAD\`. ` +
      `For each Done-when criterion find what satisfies it, and run it — code that does not do what a criterion says is a blocker. A test gap (a test that would pass before the change, ` +
      `one asserting the implementation against itself, an existing test weakened the ticket did not ask to change) is minor, never a blocker: the fixer tightens it as polish. Then the diff against CLAUDE.md and .claude/rules/ for the areas it touches (quote the rule and the line), and logic errors (an input and the wrong output). ` +
      `A change the ticket did not ask for — a file, a dependency, a behaviour no criterion needs — is a blocker (category unasked), however well meant. ` +
      `Last, the docs: \`node scripts/context.mjs for <changed files>\`, and \`git grep -n -i\` over CLAUDE.md, .claude/rules/ and context/ for the page, route and functions the diff touches — ` +
      `a doc that now describes the code wrongly is docs-stale, a blocker when an agent following it would build the wrong thing (a doc still calling a built page a placeholder is one). ` +
      `context/engineering-context/harness/code-review-playbook.md §2–§4 says what not to flag.`,
    criteria: `Read the ticket, then the spec, then \`git diff origin/${BASE}...HEAD\`. For each Done-when criterion find what satisfies it, and run it to see. ` +
      `Code that does not do what a criterion says is a blocker; so is a change the ticket did not ask for — a file, a dependency, a behaviour no criterion needs (category unasked). ` +
      `A test gap — a test that would pass before the change, asserts the implementation against itself, or weakens an existing test (test-proves-nothing, test-weakened) — is minor, never a blocker.`,
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
  /** Test gaps: never blockers, never a reason to hand back — tightened as polish when a fix round runs anyway. */
  let polish: Finding[] = [];
  const polishAsk = (p: Finding[]) => p.length
    ? `\n\nAlso, as polish — not required, and never a reason to return ok=false: tighten these tests so they would fail without the change, if it is quick:\n${list(p)}`
    : '';
  let audited = 0;
  /** The independent audit of one commit, its blockers through their skeptics — run while the gate runs. */
  async function auditRound(round: number, sha: string, sel: Selection, flagged: string[]): Promise<{ dead: string } | { reports: any[]; raised: Finding[]; confirmed: Finding[] }> {
    const lenses = lensesFor(profile!);
    const auditPrompt = (l: string) =>
      `${ticket}\nYou are auditing a change you did not write, on branch ${branch}. The spec is ${specPath}. ${LENS_ASK[l]}\n\n` +
      `The gate is running right now at ${sha.slice(0, 7)}, in other sandboxes: unit tests and ${sel.ran} browser tests (${sel.mode}: ${sel.reason}). ` +
      (l === 'browser'
        ? `Do not run \`npm test\` or the suite. Budget: ${profile!.probes} probes, one file, both viewports in one run.\n\n`
        : `Do not run it — read the tests; run a command only to prove one specific claim.\n\n`) +
      ((l === 'combined' || l === 'criteria') && carried.length ? `The plan audit left these for the build to resolve — a blocker if any is unresolved:\n${list(carried)}\n\n` : '') +
      ((l === 'combined' || l === 'criteria') && flagged.length ? `The gate flagged removed assertions or added skips:\n${flagged.join('\n')}\n\n` : '') +
      `Blockers only for something that would change a merge decision; everything else is minor. Change no code. Empty is a good answer.`;
    // Readers in parallel; the browser lens boots the app, so it runs alone after them.
    const readers = lenses.filter((l) => l !== 'browser');
    // An auditor that returns nothing has already been run once more, a tier up (routedAgent).
    const reports: any[] = await Promise.all(readers.map((l) => agent(`audit:${l}#${round}`, auditPrompt(l), S.FINDINGS, 'audit')));
    if (lenses.includes('browser')) reports.push(await agent(`audit:browser#${round}`, auditPrompt('browser'), S.FINDINGS, 'browserAudit'));
    const dead = reports.findIndex((r) => !r);
    if (dead >= 0) return { dead: [...readers, 'browser'][dead] };
    const raised: Finding[] = reports.flatMap((r) => r.findings as Finding[]);
    const confirmed = await confirm(raised.filter((f) => f.severity === 'blocker' && !isTestGap(f)), 'the change', ticket);
    return { reports, raised, confirmed };
  }
  for (let round = 1; ; round++) {
    await enter('Gate');
    const chosen = await selectGate(`#${round}`, true);
    if (!chosen) return handBack('Gate', 'the gate job did not finish');
    const ran = chosen.ran;
    const facts = String(ran.qaFacts || '');

    // The diff now says what the ticket risks; a small run that reached a risky
    // path, or grew past 300 app lines, gets the auditors a full run has.
    const appLines = Number((/--app-lines=(\d+)/.exec(facts) || [])[1] || 0);
    const reasons = [/--risky=yes\b/.test(facts) && 'the diff touches a risky path', appLines > 300 && `the diff is ${appLines} app lines`].filter(Boolean);
    if (profile.size === 'small' && !profile.escalated && reasons.length) {
      profile = { ...profile, escalated: true, buildRounds: Math.max(profile.buildRounds, 3), lenses: ['criteria', 'rules', 'browser'] };
      // A risky diff is judged by the strong tier at least, whatever Jev expected from the ticket.
      for (const j of ['audit', 'skeptic', 'fix'] as Job[]) models!.raise(j, 2, reasons.join(', '));
      log(`escalated: ${reasons.join(', ')} — audit ${describe(models!.pick('audit'))}, fixer ${describe(models!.pick('fix'))}`);
    }
    let open: Finding[] = [];
    if (ran.sync === 'conflict' || !chosen.sel) {
      gate = { ok: false, sha: '?', unit: { passed: 0, failed: 0 }, tampered: [], browser: { passed: 0, flaky: 0, skipped: 0, failed: [] } };
      open = (ran.conflicts?.length ? ran.conflicts : [`origin/${BASE}`]).map((file: string) => ({
        severity: 'blocker', category: 'conflict', file, claim: `conflicts with origin/${BASE}`,
        evidence: `git merge origin/${BASE} conflicted in ${file}`,
        fix: `git merge origin/${BASE}; resolve ${file} keeping both this branch's change and what landed on ${BASE}; npm test; commit the merge`,
      }));
      rounds.push({ round, gate: `⚠️ conflicts with ${BASE}`, raised: open.length, confirmed: open.length, covered: '' });
    } else {
      // The gate and the audit read the same commit and change nothing, so they run at the same time:
      // the tests in their two sandboxes, the auditors (and their skeptics) in this one. A fast run's fix is re-gated, not re-audited.
      const auditing = profile.reaudit || audited === 0;
      if (auditing) { status.Audit = 'running'; current = 'Audit'; }
      const sha = String(ran.sha);
      const [g, a] = await Promise.all([gateShards(chosen.sel, sha, `#${round}`), auditing ? auditRound(round, sha, chosen.sel, Array.isArray(ran.tampered) ? ran.tampered : []) : Promise.resolve(null)]);
      gate = g.gate;
      red = parseRed(g.red);
      // The code the last edit wrote fails the gate: the fixer works one tier above that model.
      const edit = lastEdit as { job: Job; tier: number; model: string } | null; // set inside agent(), which TS cannot see
      if (!gate.ok && edit) {
        const up = models!.raise('fix', edit.tier + 1, `the gate was red after ${edit.job} on ${edit.model.replace(/^[^/]+\//, '')}`);
        if (up) log(`the gate is red after ${edit.job} — the fixer climbs to ${describe(up)}`);
      }
      if (a && 'dead' in a) return handBack('Audit', `the ${a.dead} auditor did not finish twice`);
      const raised: Finding[] = [
        ...(a ? a.raised : []),
        ...(gate.ok && red && red.checked && red.failedOnBase === false ? [{
          severity: 'minor' as const, category: 'test-proves-nothing', file: red.tests[0] || 'tests/',
          claim: 'the tests this branch added or changed pass with its app code reverted',
          evidence: `scripts/red-check.mjs reverted ${red.reverted.join(', ')} to ${BASE} and ran ${red.tests.join(', ')}: none failed`,
          fix: 'add a test that exercises the changed code where an attendee meets it, and fails on the base branch',
        }] : []),
      ];
      if (a) {
        // A test gap is never a blocker, whatever the auditor called it: it rides along with the next fix as polish.
        minors = raised.filter((f) => f.severity === 'minor' || isTestGap(f)).map((f) => ({ ...f, severity: 'minor' as const }));
        polish = minors.filter(isTestGap);
        history.push(...a.confirmed);
      }
      const covered = a ? a.reports.map((r: any) => `ran ${r.ran}: ${String(r.covered).slice(0, 80)}`).join(' · ') : 'the fix, re-gated — not re-audited (fast)';
      if (gate.ok) {
        if (!a) {
          rounds.push({ round, gate: `✅ ${gateLine(gate)}`, raised: 0, confirmed: 0, covered });
          minors = await confirm(dedupe(minors).slice(0, 3), 'the change', ticket);
          break;
        }
        // Only a round whose gate was green counts toward the audit budget, as when the audit waited for it.
        audited++;
        open = a.confirmed;
        rounds.push({ round, gate: `✅ ${gateLine(gate)}`, raised: raised.length, confirmed: open.length, covered });
        log(`round ${round}: green, ${raised.length} raised, ${open.length} confirmed`);
        if (!open.length) { minors = await confirm(dedupe(minors).slice(0, 3), 'the change', ticket); break; }
      } else {
        // Red: the failing tests and whatever the audit confirmed at the same commit go to one fix round.
        const failures = [...(gate.unit.failed ? [{ test: 'npm test', error: gate.unit.output || `${gate.unit.failed} failed` }] : []), ...gate.browser.failed];
        if (!failures.length && !a?.confirmed.length) return handBack('Gate', 'the gate is red but names no failing test');
        const red_ = failures.map((f: any) => ({ severity: 'blocker' as const, category: 'gate', file: f.test, claim: `gate red: ${f.test}`, evidence: f.error, fix: 'make the gate green without editing, skipping or deleting an existing test' }));
        open = dedupe([...red_, ...(a?.confirmed ?? [])]);
        rounds.push({ round, gate: `❌ ${gateLine(gate)}`, raised: red_.length + (a ? raised.length : 0), confirmed: open.length, covered: a ? `audited alongside: ${a.confirmed.length} confirmed, fixed with the gate` : '' });
        log(`round ${round}: gate red, ${red_.length} failing${a ? `; the audit beside it confirmed ${a.confirmed.length}` : ''}`);
      }
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
      `if a fix changes what a context doc says, fix the doc. \`npm test\` after every edit; a browser test you added or changed runs alone by title; not the whole suite. Leave \`git status\` clean. Commit and push.` +
      polishAsk(polish),
      S.BUILT, 'fix');
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
      S.LESSON, 'learn');
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
    gateRef ? `git push -q origin ":${gateRef}" >/dev/null 2>&1 || true` : '',
    // Screenshots are the shots workflow's (before and after, on the preview), not a media branch.
    `STAT=$(git diff --stat origin/${BASE}...HEAD | tail -40)`,
    `STAT="$STAT" AFTER="$AFTER" HEAD_SHA=$(git rev-parse HEAD) node -e 'const e=process.env;require("fs").writeFileSync(e.JOB+"/result.json",JSON.stringify({ok:true,head:e.HEAD_SHA,stat:e.STAT,codeAfterGate:(e.AFTER||"").split(",").filter(Boolean)}))'`,
  ].filter(Boolean).join('\n'));
  await disposeShards();
  gateRef = '';
  if (!final?.ok) return handBack('Pull request', final?.why === 'conflict' ? `conflicts with ${BASE} after the gate` : 'could not push the branch');
  if (final.codeAfterGate?.length) return handBack('Pull request', `code changed after the gate passed: ${final.codeAfterGate.join(', ')}`);
  // What the gate ran green, for verify: the pull request's head differs from the gated commit only in
  // docs and specs (just checked), so verify runs only what its own selection adds. Written before the
  // pull request opens, since opening it is what starts verify.
  const ranSel = lastSel as Selection | null; // set inside gateShards(), which TS cannot see
  if (ranSel) await recordGate(gateRecord(final.head, gate, ranSel)).catch(() => null);

  const fixedCount = rounds.reduce((x, r) => x + r.confirmed, 0);
  const notVerified = [
    ...(!(red && red.checked) ? ['no red-check ran — no app code changed'] : []),
    ...(red && red.checked && !red.failedOnBase ? ['the new tests also pass without the change (judged a refactor)'] : []),
    ...(ranSel && ranSel.mode !== 'full' ? [`the gate ran ${ranSel.ran} of ${ranSel.total} browser tests, the ones this change reaches; verify adds what its own selection needs, and main runs them all after merge`] : []),
    ...(!profile.reaudit && rounds.some((r) => r.confirmed) ? ['the fix for what the audit found was re-gated, not re-audited'] : []),
    ...(gate.browser.flakyTests?.length ? [`${gate.browser.flakyTests.length} test(s) flaky, passed on retry`] : []),
  ];
  // Read top-down in ten seconds: what it does, whether it is proven, what needs a person — the rest folded.
  const oneLine = (t: string) => { const l = String(t).split('\n')[0].trim(); return l.length > 160 ? `${l.slice(0, 157)}…` : l; };
  const fold = (summary: string, inner: string) => `\n<details><summary>${summary}</summary>\n\n${inner}\n</details>`;
  const body = [
    `Closes #${n} · 📄 [Spec](https://github.com/${ALLOWED_REPO}/blob/${branch}/${specPath}) · screenshots and the preview link arrive on this pull request once it builds`,
    '',
    built.summary,
    '',
    `**🛡️ Checks:** ` + [`Tests pass — ${gateLine(gate)}${ranSel && ranSel.mode !== 'full' ? ` · ran ${ranSel.ran} of ${ranSel.total} browser tests (${ranSel.mode}: ${ranSel.reason})` : ', desktop and mobile'}`,
      ...(red && red.checked && red.failedOnBase ? ['the new tests fail without the change'] : []),
      `independent audit: ${fixedCount ? `${fixedCount} problem${fixedCount === 1 ? '' : 's'} found and fixed, ` : ''}clean after ${rounds.length} round${rounds.length === 1 ? '' : 's'}`].join(' · '),
    notVerified.length ? `\n**Not verified:** ${notVerified.join('; ')}.` : '',
    // Decisions the ticket left open are the person's to check: they stay in view.
    plan.spec.decisions?.length ? `\n**🤔 Decisions for you**\n${plan.spec.decisions.map((d: string) => `- ${d}`).join('\n')}` : '',
    fold(`✅ Done when (${doneWhen.length})`, doneWhen.map((c) => `- [x] ${oneLine(c)}`).join('\n')),
    built.tryIt ? fold('🧪 Try it', built.tryIt) : '',
    built.keyFiles?.length ? fold('👀 Where to look', built.keyFiles.map((k: any) => `- \`${k.file}\` — ${k.why}`).join('\n')) : '',
    minors.length ? fold('Worth a closer look', list(minors)) : '',
    fold('Every file changed', `\`\`\`\n${final.stat}\n\`\`\``),
    fold('Audit rounds', `| Round | Gate | Audit | Covered |\n| --- | --- | --- | --- |\n${rounds.map((r) => `| ${r.round} | ${r.gate} | ${r.raised} raised · ${r.confirmed} confirmed | ${r.covered || '—'} |`).join('\n')}` +
      (lessons.length ? `\n\nLessons written to the docs: ${lessons.map((l) => l.proposal).join('; ')}` : '')),
    '',
    // An HTML link: GitHub renders no markdown link inside a <sub> line.
    `<sub>🏭 Built by Ship on Vercel · ${profile.size}${profile.escalated ? ', escalated' : ''} · ${triage.why} · ${dollars(spend.total)} of AI · <a href="${runUrl}">durable run</a></sub>`,
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
  if (preview.state === 'ready') { previewUrl = preview.url!; log(`preview ready: ${previewUrl}`); await pinPreview(pr.number, previewUrl, preview.sha ?? '').catch(() => null); }
  else if (preview.state === 'skipped') log('preview skipped — this change builds nothing of the app');
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
    for (const [name, v] of [['review', rv], ['QA', qv]] as const) if (v?.models) log(`${name} ran on ${v.models} — $${Number(v.spend || 0).toFixed(3)} (expected $${Number(v.est || 0).toFixed(3)})`);
    log(`screenshots: ${sv?.outcome === 'posted' ? `${sv.pages} page${sv.pages === 1 ? '' : 's'} — ${sv.url}` : sv?.outcome ?? 'did not run'}`);
    for (const v of [rv, qv]) if (v?.spend) { spend.total += v.spend; spend.byPhase['Review & QA'] = (spend.byPhase['Review & QA'] || 0) + v.spend; }
    const found: Finding[] = [
      ...(rv?.blockers || []).map((b: any) => ({ severity: 'blocker', category: `review:${b.category}`, file: b.file, line: b.line, claim: b.claim, evidence: [b.how && `how: ${b.how}`, b.harm && `harm: ${b.harm}`, b.evidence].filter(Boolean).join(' · ') || 'raised by review', fix: 'resolve what the review found' })),
      ...(rv?.docs || []).map((d: any) => ({ severity: 'blocker', category: 'docs-stale', file: d.file, line: d.line, claim: d.claim, evidence: d.evidence || 'raised by review', fix: 'make the doc say what the code does now' })),
      ...(qv?.bugs || []).map((b: any) => ({ severity: 'blocker', category: 'qa-bug', file: 'tests/qa-probe.spec.js', claim: `${b.title}: ${b.aim}`, evidence: `on the preview — expected: ${b.expected ?? '?'} · actual: ${b.actual ?? '?'}`, fix: 'make the change behave as expected, and add a test that proves it' })),
    ];
    // Review's test gaps ride along with a fix round as polish; on their own they start none and hold nothing up.
    const testPolish: Finding[] = (rv?.polish || []).map((b: any) => ({ severity: 'minor', category: b.category, file: b.file, line: b.line, claim: b.claim, evidence: b.evidence || 'shown by review', fix: 'make the test fail without the change' }));
    return { rv, qv, found, polish: testPolish };
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
      // Not pushed by the fixer: a push to the open pull request starts verify, and ship's gate below goes first.
      `Leave \`git status\` clean. Commit, but do not push — ship pushes once its gate has run.` + polishAsk(verdicts.polish),
      S.BUILT, 'fix');
    if (!fixed?.ok) { log(`the fixer could not finish: ${fixed?.summary ?? 'no result'}`); await command(`push#r${round}`, `git push -q origin HEAD >"$JOB/push.log" 2>&1; echo '{"ok":true}' > "$JOB/result.json"`); break; }
    fullSuite = fullSuite || (await readPullRequest(pr.number)).labels.includes(FULL_SUITE_LABEL);
    const chosen = await selectGate(`#r${round}`, false);
    const g = chosen?.sel ? (await gateShards(chosen.sel, String(chosen.ran.sha), `#r${round}`)).gate : null;
    rounds.push({ round: rounds.length + 1, gate: g ? `${g.ok ? '✅' : '❌'} ${gateLine(g)} (after review)` : `⚠️ no gate (${chosen ? 'conflicts' : 'did not finish'})`, raised: open.length, confirmed: open.length, covered: 'fixed what review and QA found' });
    // Recorded before the push, so the verify the push starts runs only what this gate did not.
    if (g?.ok && chosen?.sel) await recordGate(gateRecord(String(chosen.ran.sha), g, chosen.sel)).catch(() => null);
    const pushed = await command(`push#r${round}`, `git push -q origin HEAD >"$JOB/push.log" 2>&1; ${gateRef ? `git push -q origin ":${gateRef}" >/dev/null 2>&1; ` : ''}echo '{"ok":true}' > "$JOB/result.json"`);
    gateRef = '';
    await disposeShards();
    if (!g?.ok) { log(`the gate is red after the fix${pushed ? ' — pushed, so the pull request shows it' : ''}`); break; }
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
    // One independent skeptic per claim: it sees the claim and the cited line, never the auditor's evidence or reasoning,
    // and must demonstrate it — the same bar review holds (code-review-playbook.md §2). What it cannot show is dropped.
    const judged = await Promise.all(dedupe(findings).map((f) => agent(`skeptic:${f.category}`,
      `${t}\nThe spec is ${specPath}, on branch ${branch}. Someone claims this about ${what} (\`git diff origin/${BASE}...HEAD\`):\n\n` +
      `${f.file}${f.line ? ':' + f.line : ''} — ${f.claim}${f.also?.length ? f.also.map((a) => `\nalso read as: ${a.claim}`).join('') : ''}\n\n` +
      `Check it yourself, from the code — do not take the claim's word for anything. It stands only if you demonstrate it: run the code, \`npm test\`, a throwaway test or a command ` +
      `(commit nothing; do not boot the app or run Playwright), or quote the exact lines and show what they do. ` +
      `Refute it if you cannot show it, if the code does not do what is claimed, if the behaviour is already on origin/${BASE}, if it is style or a nitpick — it works, just not exactly as someone ` +
      `would read the ticket, and nobody is hurt — if its fix would contradict CLAUDE.md, or if CLAUDE.md or the spec *as first committed* ` +
      `(\`git log --diff-filter=A --format=%H -- ${specPath}\`, then \`git show\`) shows it was deliberate. A later edit to the spec does not make a missed Done-when criterion deliberate.`,
      S.REFUTATION, 'skeptic').then((v) => (v && !v.refuted ? f : null))));
    // Not demonstrated — refuted, or a skeptic that did not finish — is not raised.
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
