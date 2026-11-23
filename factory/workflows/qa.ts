import { getWorkflowMetadata, setAttributes, sleep } from 'workflow';
import { kit, checkoutPr } from '../lib/kit';
import { allowPreviews, disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { comment, findDeployment, previewForPr, readIssue, readMarker, readPullRequest, setStatus } from '../lib/github-steps';
import { chooseModels, describe, modelBook, type Job } from '../lib/models';
import { FACTORY_DASHBOARD, PRODUCTION_URL, REPO_DIR } from '../lib/constants';
import * as S from './schemas';

/**
 * qa — try to break a pull request on its real Vercel preview.
 *
 * Not the tests again: an agent reads what the PR's own tests already prove,
 * and probes only the gaps (≤ 5 probes, both viewports) — in a browser in the
 * sandbox, against the deployed preview, the way an attendee meets it.
 *
 * Thinking and typing are separate jobs. A planner (the model Jev picks for
 * judgement) decides each probe exactly: route, attendee, pinned clock,
 * actions, expected result. A writer (a cheap, fast model) turns that plan
 * into tests/qa-probe.spec.js and runs it once to fix its own selectors. Then
 * the factory runs the file itself, desktop and mobile in parallel, as its own
 * steps — so the trace shows how long writing and running each take, and a
 * probe's pass or fail is a command's word, not an agent's. Probes that do not
 * compile or run send the writer one tier up, once. While the triage reads the
 * diff, a command warms the preview: every function instance seeds its own
 * SQLite on first request, and a cold one made the first probes slow.
 *
 * A probe that fails is run again on the preview and once on the base's own
 * deployment: only a failure that reproduces here and not there, and survives
 * a skeptic, is a bug in this change. One that fails on both is pre-existing.
 *
 * Confidence is coverage: the share of the plan that ran on both viewports.
 * A low one publishes as unproven, not green.
 */
export type QaInput = { pr: number };

const CONFIG = '/vercel/.factory/qa.config.mjs';
const remoteConfig = () => `
import base from '${REPO_DIR}/playwright.config.js';
const baseURL = process.env.QA_BASE_URL;
export default {
  ...base,
  testDir: '${REPO_DIR}/tests',
  testMatch: 'qa-probe.spec.js',
  webServer: undefined,
  retries: 0,
  workers: 2,
  outputDir: process.env.QA_OUT || '/vercel/.factory/qa-results',
  reporter: [['json', { outputFile: process.env.QA_REPORT }]],
  // The sandbox's network proxy terminates TLS to inject the preview bypass.
  use: { ...base.use, baseURL, ignoreHTTPSErrors: true },
  projects: base.projects.map((p) => ({ ...p, use: { ...p.use, baseURL, ignoreHTTPSErrors: true } })),
};
`;

/** Run probes (all, or these titles) against one URL, on one project or both; which titles passed where, and any load errors. */
export const probeRun = (url: string, titles: string[], project?: 'desktop' | 'mobile') => [
  `cat > ${CONFIG} <<'CFG'\n${remoteConfig()}\nCFG`,
  `QA_BASE_URL='${url}' QA_REPORT="$JOB/report.json" QA_OUT="$JOB/out" npx playwright test --config=${CONFIG}${project ? ` --project=${project}` : ''} ` +
    `${titles.length ? `-g '${titles.map((t) => t.replace(/[.*+?^${}()|[\]\\']/g, '.')).join('|')}'` : ''} >"$JOB/run.log" 2>&1`,
  `node -e 'const fs=require("fs");let r;try{r=JSON.parse(fs.readFileSync(process.env.JOB+"/report.json","utf8"))}catch{r={errors:[{message:fs.readFileSync(process.env.JOB+"/run.log","utf8").slice(-600)}]}}` +
    `const out=[];const walk=s=>{for(const x of s.suites||[])walk(x);for(const sp of s.specs||[])for(const t of sp.tests||[])out.push({title:sp.title,project:t.projectName,ok:t.status==="expected"||t.status==="flaky",error:((t.results||[]).slice(-1)[0]?.error?.message||"").slice(0,400)})};walk(r);` +
    `fs.writeFileSync(process.env.JOB+"/result.json",JSON.stringify({results:out,errors:(r.errors||[]).map(e=>String(e.message||e).slice(0,400))}))' || echo '{"results":[],"errors":["no report"]}' > "$JOB/result.json"`,
].join('\n');

/** Hit the preview's pages and API a few times over, in parallel, so its function instances seed their databases before a probe waits on one. */
export const warmScript = (url: string) => [
  `P="/ /schedule /speakers /api/bootstrap /api/sessions /api/speakers /api/users /api/users/1/schedule /api/live /api/health"`,
  `for r in 1 2 3; do for p in $P; do echo "${url.replace(/\/$/, '')}$p"; done; done | xargs -P 10 -I{} curl -sk -o /dev/null -m 60 -w '%{http_code} %{time_total}\\n' {} > "$JOB/warm.log" 2>&1`,
  `node -e 'const l=require("fs").readFileSync(process.env.JOB+"/warm.log","utf8").trim().split("\\n").filter(Boolean).map(x=>x.split(" "));` +
    `require("fs").writeFileSync(process.env.JOB+"/result.json",JSON.stringify({requests:l.length,ok:l.filter(x=>/^[23]/.test(x[0])).length,slowest:Math.max(0,...l.map(x=>+x[1]||0))}))'`,
].join('\n');

/** What a probe plan item looks like to the writer and to the report. */
type Planned = { title: string; aim: string; route: string; as: string; at?: string; steps: string[]; expect: string[] };
type Ran = { title: string; project: string; ok: boolean; error: string };

/** Which plan items ran on which project, from the factory's own runs; titles the writer did not write did not run. */
export function tally(plan: Planned[], runs: Ran[]) {
  return plan.map((p) => {
    const on = (project: string) => runs.find((r) => r.title === p.title && r.project === project);
    const d = on('desktop');
    const m = on('mobile');
    return { ...p, passedDesktop: d ? d.ok : undefined, passedMobile: m ? m.ok : undefined, error: [d && !d.ok ? `desktop: ${d.error}` : '', m && !m.ok ? `mobile: ${m.error}` : ''].filter(Boolean).join(' · ') };
  });
}

const QA_JOBS: Job[] = ['qaTriage', 'qaPlan', 'qaWrite', 'qaSkeptic', 'baseSame'];

export async function qa(input: QaInput) {
  'use workflow';
  try {
    const r: any = await qaRun(input);
    await setAttributes({
      verdict: String(r.verdict), ...(r.confidence ? { confidence: String(r.confidence) } : {}), ...(typeof r.spend === 'number' ? { spend_usd: r.spend.toFixed(2) } : {}),
      ...(r.models ? { models: String(r.models).slice(0, 250) } : {}), ...(typeof r.est === 'number' ? { est_usd: r.est.toFixed(2) } : {}),
      ...(typeof r.climbs === 'number' ? { climbs: String(r.climbs) } : {}),
    });
    return r;
  } catch (e: any) {
    // Never leave a pull request's check at "pending": say what stopped it.
    const why = String(e?.message || e).slice(0, 140);
    const { workflowRunId } = getWorkflowMetadata();
    // Never leave a sandbox (and its snapshot) behind.
    await disposeSandbox(`qa-${input.pr}-${workflowRunId.slice(-8).toLowerCase()}`).catch(() => null);
    const pr = await readPullRequest(input.pr).catch(() => null);
    if (pr) await setStatus(pr.headSha, 'factory/qa', 'error', why, `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`).catch(() => null);
    return { verdict: 'none', reason: why };
  }
}

async function qaRun(input: QaInput) {
  const { workflowRunId } = getWorkflowMetadata();
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const pr = await readPullRequest(input.pr);
  await setAttributes({ pr: String(pr.number), sha: pr.headSha.slice(0, 12), ...(pr.issue ? { issue: String(pr.issue) } : {}) });
  if (pr.state !== 'open' || pr.draft) return { verdict: 'none', reason: pr.draft ? 'draft' : 'not open' };
  const box = `qa-${pr.number}-${workflowRunId.slice(-8).toLowerCase()}`;
  const k = kit(box, `QA of pull request #${pr.number}`, 'read');
  await setStatus(pr.headSha, 'factory/qa', 'pending', 'Waiting for the preview…', runUrl);

  const publish = async (pass: boolean, confidence: 'high' | 'medium' | 'low', headline: string, body: string[], marker: any) => {
    const callout = pass ? (confidence === 'high' ? '> [!TIP]' : confidence === 'medium' ? '> [!NOTE]' : '> [!WARNING]') : '> [!CAUTION]';
    const meter = { high: '●●●', medium: '●●○', low: '●○○' }[confidence];
    const table = k.models?.table();
    await comment(pr.number, [callout, `> ### QA · ${pass ? `${confidence} confidence${confidence === 'low' ? ' — unproven' : ''} &nbsp; \`${meter}\`` : 'bug'}`, `> ${headline}`, '', ...body,
      table ? `\n<details><summary>Models, time and cost</summary>\n\n${table}\n\n${k.lines.map((l) => `- ${l}`).join('\n')}\n</details>` : '',
      '', `<sub>🏭 Factory QA · ${k.spendLine()} · [run](${runUrl})</sub>`, `<!-- factory-verdict:qa ${JSON.stringify(marker)} -->`].filter((l) => l !== '').join('\n'));
    // The verdict lives on the pull request; ship's one progress comment on the issue reports it.
    await setStatus(pr.headSha, 'factory/qa', pass ? 'success' : 'failure', pass ? `${confidence} confidence${confidence === 'low' ? ' (unproven)' : ''}` : headline, runUrl);
  };
  const outcome = (r: Record<string, unknown>) => {
    const t = k.models?.totals();
    return { ...r, spend: k.spend.total, ...(k.models ? { models: k.models.summary(), est: t!.est, climbs: t!.climbs } : {}) };
  };

  // The preview of this head, and the deployment of the base to compare against.
  let preview = await previewForPr(pr.number);
  for (let i = 0; i < 45 && (preview.state === 'pending' || preview.state === 'none'); i++) { await sleep('20s'); preview = await previewForPr(pr.number); }
  if (preview.state !== 'ready') {
    await setStatus(pr.headSha, 'factory/qa', 'error', `No preview to test (${preview.state})`, runUrl);
    return { verdict: 'none', reason: `preview ${preview.state}` };
  }
  const previewUrl = preview.url!;

  const issue = pr.issue ? await readIssue(pr.issue).catch(() => null) : null;
  const previous = await readMarker(pr.number, 'factory-verdict:qa');

  await prepareSandbox(box, pr.headSha, 'read');
  const co = await k.command('checkout', checkoutPr(pr.number, pr.head, pr.base));
  if (!co) { await disposeSandbox(box); await setStatus(pr.headSha, 'factory/qa', 'error', 'Could not check out the pull request', runUrl); return { verdict: 'none' }; }
  const baseDeploy = (await findDeployment(co.base, 'Preview')).url ?? (pr.base === 'main' ? PRODUCTION_URL : null);
  await allowPreviews(box, [previewUrl, ...(baseDeploy ? [baseDeploy] : [])]);

  const facts = await k.command('facts', [
    `FACTS=$(node scripts/qa-facts.mjs origin/${pr.base} 2>/dev/null | tail -1)`,
    `FILES=$(git diff --name-only origin/${pr.base}...HEAD | paste -sd, -)`,
    `FACTS="$FACTS" FILES="$FILES" node -e 'const e=process.env;require("fs").writeFileSync(e.JOB+"/result.json",JSON.stringify({facts:e.FACTS,files:(e.FILES||"").split(",").filter(Boolean)}))'`,
  ].join('\n'));
  const f = String(facts?.facts || '');
  const files: string[] = facts?.files ?? [];
  const size = (/--size=(\w+)/.exec(f) || [])[1] || 'large';
  // `probed` tells review this pass exercised the preview; a skip or a run whose probes never ran is no evidence.
  const marker = (bugs: any[], probed = false) => ({ pass: 'qa', commit: co.head, bugs, probed });

  // Nothing an attendee can meet changed: the harness, tests and docs are code review's.
  if (/--app-change=no/.test(f)) {
    await publish(true, 'high', 'Skipped — this pull request changes nothing an attendee can reach; code review covers it.', [], marker([]));
    await disposeSandbox(box);
    return outcome({ verdict: 'pass', confidence: 'high', skipped: 'no app change' });
  }

  const ticket = issue ? `The ticket, #${issue.number}: ${issue.title}\n\n${issue.body}\n` : `No linked ticket; the pull request says: ${pr.title}\n\n${pr.body.slice(0, 2000)}\n`;
  const prevProbes: any[] = previous?.bugs || [];

  // Which model does each QA job get: Jev reads the ticket and the diff's facts; the catalog prices it.
  const qaSize = size === 'large' ? 'full' : 'small';
  const choice = await chooseModels(`${ticket}\nPull request #${pr.number}: ${pr.title}\nFiles changed: ${files.join(', ')}\nFacts: ${f}`, qaSize, QA_JOBS);
  const models = modelBook(choice, qaSize);
  k.useModels(models);
  k.log(`models (${choice.ms} ms${choice.live ? '' : ', last known prices'}${choice.why ? `; ${choice.why}` : ''}): ` +
    QA_JOBS.map((j) => `${j} ${describe(models.pick(j))}`).join(' · '));

  // 1. Triage — are the tests this PR adds enough, or where are the gaps? — while the preview warms.
  k.setPhase('triage');
  const warming = k.command('warm', warmScript(previewUrl));
  let gaps: string[] = [];
  let mode: string = 'explore';
  if (!prevProbes.length) {
    const t = await k.agent('triage',
      `${ticket}\nPull request #${pr.number} (branch ${pr.head}) is deployed at ${previewUrl}. Read context/engineering-context/harness/qa-playbook.md §1 ` +
      `(\`awk '/^## 1\\./,/^## 2\\./' context/engineering-context/harness/qa-playbook.md\`), the diff (\`git diff origin/${pr.base}...HEAD\`) and the tests it adds. ` +
      `For each Done-when criterion, name the test file IN THIS DIFF that pins it, or "". Then: enough (every criterion pinned and nothing left worth a probe), ` +
      `focused (list the specific gaps, one probe each) or explore (the change needs open exploration).`,
      S.QA_TRIAGE, 'qaTriage');
    if (t) {
      mode = t.mode;
      gaps = t.gaps;
      // "Enough" is checked against the diff, never taken on trust, and never for a large change.
      const pinned = (t.criteria as any[]).every((c) => c.testFile && files.includes(c.testFile));
      if (mode === 'enough' && pinned && size !== 'large') {
        await warming;
        await publish(true, 'high', `Skipped — the tests this pull request adds pin every criterion (${(t.criteria as any[]).map((c) => c.testFile).filter((x, i, a) => a.indexOf(x) === i).join(', ')}).`, [], marker([]));
        await disposeSandbox(box);
        return outcome({ verdict: 'pass', confidence: 'high', skipped: 'tests are enough' });
      }
      if (mode === 'enough') { mode = 'focused'; gaps = (t.criteria as any[]).filter((c) => !c.testFile || !files.includes(c.testFile)).map((c) => c.criterion); }
    }
  }

  // 2. Plan the probes: a thinking job, no code — exact enough that writing them is mechanical.
  k.setPhase('plan');
  const budget = size === 'large' ? 5 : 3;
  const planned = await k.agent('probeplan',
    `${ticket}\nPull request #${pr.number} (branch ${pr.head}) is deployed at ${previewUrl} — a real Vercel preview with its own fresh database. ` +
    `Follow context/engineering-context/harness/qa-playbook.md §1–§3 (\`awk '/^## 1\\./,/^## 4\\./' context/engineering-context/harness/qa-playbook.md\`) to decide what to probe — ` +
    `you PLAN the probes, you do not write or run them: another agent writes each one from your plan alone, without exploring, and the factory runs them on desktop and mobile.\n\n` +
    (prevProbes.length ? `This is a re-review. Plan these previous bugs' probes first, with the same titles: ${prevProbes.map((b) => `"${b.title}" (${b.aim})`).join(', ')}; then at most ${budget - prevProbes.length} new probes, aimed at \`git diff ${previous.commit} HEAD\`.\n` :
      mode === 'focused' ? `Probe exactly these gaps, one probe each:\n${gaps.map((g) => `- ${g}`).join('\n')}\n` : `Explore: at most ${budget} probes where the PR's own tests do not reach.\n`) +
    `\nFor each probe give: the route; the seeded attendee (tests/helpers.js ATTENDEES); the pinned clock as "<dayIndex> HH:MM" when the outcome depends on the time, else ""; ` +
    `the steps, naming each control by its test id or role and accessible name as the source under src/ has it (grep data-testid; quote it exactly); and every expected result, ` +
    `observable and specific (a test id and the text or count it must show). Each probe stands alone: its own attendee and day, releasing anything it books (CLAUDE.md, *Writing tests against this*). ` +
    `Change no file.`,
    S.QA_PLAN, 'qaPlan');
  const plan: Planned[] = (planned?.probes ?? []).map((p: any) => ({ ...p, title: String(p.title).startsWith('qa: ') ? p.title : `qa: ${p.title}` }));
  if (!plan.length) {
    await warming;
    await publish(true, 'low', 'The probes were not planned — nothing here was exercised.', [], marker([]));
    await disposeSandbox(box);
    return outcome({ verdict: 'pass', confidence: 'low' });
  }

  // 3. Write them — a cheap, fast model, one run to fix its own selectors — then the factory runs them, each viewport its own step.
  k.setPhase('probe');
  const write = (fix?: string) => k.agent(fix ? 'write#again' : 'write',
    `You turn a QA plan into Playwright probes. The plan is decided — do not add, drop or reinterpret probes, and do not explore beyond what a selector needs.\n\n` +
    `The plan (JSON):\n${JSON.stringify(plan, null, 2)}\n\n` +
    `Write every probe into tests/qa-probe.spec.js, one test() per plan item, titled exactly as its "title". Use tests/helpers.js: \`visit(page, path, { as: ATTENDEES.<name>, at })\` ` +
    `(at is \`await momentOn(dayIndex, 'HH:MM')\` from the plan's "at", or omitted when it is ""), \`conferenceDays()\`, \`waitForResults(page)\`; API helpers already point at the preview. ` +
    `Assert on roles and test ids, read from the source under src/ — never CSS classes. Each "expect" item is one expect().\n` +
    `Never start the app. Check it compiles with \`npx playwright test --config=${CONFIG} --list\`, then run it ONCE, desktop only:\n` +
    `  QA_BASE_URL=${previewUrl} QA_REPORT=/tmp/qa.json npx playwright test --config=${CONFIG} --project=desktop\n` +
    `If a probe fails because of your selector or your code, fix that and stop — do not run it again, and never weaken an expectation to make it pass: ` +
    `a failure the plan's expectation explains is a finding, and the factory runs the file itself, on both viewports. Change no other file.` +
    (fix ? `\n\nThe file as written did not run for the factory:\n${fix}\nFix tests/qa-probe.spec.js so every planned probe loads and runs.` : ''),
    S.QA_WRITTEN, 'qaWrite');
  const runBoth = async (tag: string) => {
    const [d, m] = await Promise.all([k.command(`run:desktop${tag}`, probeRun(previewUrl, [], 'desktop')), k.command(`run:mobile${tag}`, probeRun(previewUrl, [], 'mobile'))]);
    return { results: [...(d?.results ?? []), ...(m?.results ?? [])] as Ran[], errors: [...(d?.errors ?? []), ...(m?.errors ?? [])] as string[] };
  };
  // The writer checks and runs its file with the factory's preview config, so it must exist before the writer starts
  // (probeRun writes it too, but only after the writer is done).
  await k.command('config', `cat > ${CONFIG} <<'CFG'\n${remoteConfig()}\nCFG\necho '{"ok":true}' > "$JOB/result.json"`);
  const [, firstWrite] = await Promise.all([warming.then((w) => w && k.log(`warm: ${w.ok}/${w.requests} ok, slowest ${Number(w.slowest).toFixed(1)}s`)), write()]);
  let written = firstWrite;
  let ran = await runBoth('');
  const broken = (r: typeof ran) => r.errors.length > 0 || plan.some((p) => !r.results.some((x) => x.title === p.title));
  if (broken(ran)) {
    // Probes that do not compile or do not run are the writer's failure, and visible: one tier up, once.
    const why = ran.errors.length ? ran.errors.join('\n').slice(0, 1500) : `not found in the file: ${plan.filter((p) => !ran.results.some((x) => x.title === p.title)).map((p) => `"${p.title}"`).join(', ')}`;
    const up = models.climb('qaWrite', 'its probes did not compile or run');
    if (up) {
      k.log(`write: the probes did not run — climbing to ${describe(up)}`);
      written = await write(why);
      ran = await runBoth('#again');
    }
  }
  const probes = tally(plan, ran.results);
  if (!ran.results.length) {
    // Nothing ran on either viewport — whatever the writer said, nothing was exercised.
    await publish(true, 'low', 'The probes did not run — nothing here was exercised.', [], marker([]));
    await disposeSandbox(box);
    return outcome({ verdict: 'pass', confidence: 'low' });
  }

  // 4. Reproduce each failure: again on the preview, then on the base's deployment.
  k.setPhase('reproduce');
  const failing = probes.filter((p) => p.passedDesktop === false || p.passedMobile === false)
    .map((p) => ({ ...p, expected: p.expect.join('; '), actual: p.error }));
  const bugs: any[] = [];
  const preExisting: any[] = [];
  const questions: any[] = [];
  for (const p of failing) {
    const again = await k.command(`again:${p.title.slice(0, 30)}`, probeRun(previewUrl, [p.title]));
    const reproduced = (again?.results ?? []).some((r: any) => !r.ok);
    if (!reproduced) { questions.push({ ...p, note: 'did not fail a second time' }); continue; }
    const onBase = baseDeploy ? await k.command(`base:${p.title.slice(0, 30)}`, probeRun(baseDeploy, [p.title])) : null;
    const failsOnBase = (onBase?.results ?? []).some((r: any) => !r.ok);
    if (failsOnBase) {
      // Failing on the base too means pre-existing only if the base does the same
      // thing — a probe of something this PR adds fails there simply because the
      // feature is not there yet. Ask, rather than assume.
      const same = await k.agent('skeptic:base',
        `A QA probe failed on pull request #${pr.number}'s preview and also on ${pr.base}'s deployment:\n"${p.title}" — ${p.aim}\nexpected: ${p.expected}\nactual: ${p.actual}\n\n` +
        `Read the probe (tests/qa-probe.spec.js) and \`git diff origin/${pr.base}...HEAD\`. Does ${pr.base} fail it for the same reason (pre-existing), or only because what it probes does not exist there yet (new: a gap in this change)?`,
        S.BASE_SAME, 'baseSame');
      if (same?.preExisting) preExisting.push(p); else questions.push({ ...p, note: same ? `a gap in what this adds, not on ${pr.base}: ${same.why}` : 'fails on the base too' });
      continue;
    }
    const v = await k.agent('skeptic:probe',
      `${ticket}\nA QA probe on pull request #${pr.number} failed twice on its preview and passed on the base's deployment:\n` +
      `"${p.title}" — ${p.aim}\nexpected: ${p.expected}\nactual: ${p.actual}\n\nRead the probe in tests/qa-probe.spec.js and the code it exercises. Try to REFUTE it as a bug in this change: ` +
      `refuted if the probe itself is wrong (a wrong selector, a wrong expectation, a clock not pinned); contrived if real but reachable only from an input nobody gives in normal use. If you cannot tell, confirmed.`,
      S.SKEPTIC, 'qaSkeptic');
    const verdict = v?.verdict ?? 'confirmed';
    if (verdict === 'confirmed') bugs.push(p); else questions.push({ ...p, note: `${verdict}: ${v?.why ?? ''}` });
  }
  await k.command('clean', `rm -f tests/qa-probe.spec.js; git status --porcelain | grep -q . && git checkout -- . ; echo '{"ok":true}' > "$JOB/result.json"`);

  // 5. The verdict: coverage, not feeling.
  const ranBoth = probes.filter((p) => p.passedDesktop !== undefined && p.passedMobile !== undefined).length;
  const share = plan.length ? ranBoth / plan.length : 0;
  const confidence = share >= 0.99 && size !== 'large' ? 'high' : share >= 0.5 ? 'medium' : 'low';
  const pass = bugs.length === 0;
  const lineFor = (p: any) => `- **${p.title}** — ${p.aim}${p.expected ? `\n  expected: ${p.expected}\n  actual: ${p.actual}` : ''}${p.note ? `\n  (${p.note})` : ''}`;
  const mark = (p: (typeof probes)[number]) => (p.passedDesktop === undefined || p.passedMobile === undefined ? '⚪' : p.passedDesktop && p.passedMobile ? '✅' : '❌');
  await publish(pass, confidence as any,
    pass ? `${planned!.covered} — on the preview, desktop and mobile.` : `${bugs.length} bug${bugs.length === 1 ? '' : 's'} in this change, reproduced on the preview and not on ${pr.base}.`,
    [
      bugs.length ? `#### Bugs in this change\n${bugs.map(lineFor).join('\n')}` : '',
      preExisting.length ? `#### Pre-existing (also on ${pr.base})\n${preExisting.map(lineFor).join('\n')}` : '',
      questions.length ? `#### Questions\n${questions.map(lineFor).join('\n')}` : '',
      `#### Probed\n${probes.map((p) => `- ${mark(p)} ${p.title}`).join('\n')}`,
      `\n🔎 Preview: ${previewUrl}`,
    ],
    marker(bugs.map((b) => ({ title: b.title, aim: b.aim })), ranBoth > 0));
  await disposeSandbox(box);
  return outcome({ verdict: pass ? 'pass' : 'fail', confidence, bugs: bugs.map((b) => ({ title: b.title, aim: b.aim, expected: b.expected, actual: b.actual })), preview: previewUrl });
}
