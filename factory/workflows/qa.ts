import { getWorkflowMetadata, sleep } from 'workflow';
import { kit, checkoutPr } from '../lib/kit';
import { allowPreviews, disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { comment, findDeployment, readIssue, readMarker, readPullRequest, setStatus } from '../lib/github-steps';
import { FACTORY_DASHBOARD, PRODUCTION_URL, REPO_DIR } from '../lib/constants';
import * as S from './schemas';

/**
 * qa — try to break a pull request on its real Vercel preview.
 *
 * Not the tests again: an agent reads what the PR's own tests already prove,
 * and probes only the gaps (≤ 5 probes, both viewports) — in a browser in the
 * sandbox, against the deployed preview, the way an attendee meets it. A probe
 * that fails is run again on the preview and once on the base's own
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
  outputDir: '/vercel/.factory/qa-results',
  reporter: [['json', { outputFile: process.env.QA_REPORT }]],
  // The sandbox's network proxy terminates TLS to inject the preview bypass.
  use: { ...base.use, baseURL, ignoreHTTPSErrors: true },
  projects: base.projects.map((p) => ({ ...p, use: { ...p.use, baseURL, ignoreHTTPSErrors: true } })),
};
`;

/** Run named probes against one URL; which titles passed on which project. */
const probeRun = (url: string, titles: string[]) => [
  `cat > ${CONFIG} <<'CFG'\n${remoteConfig()}\nCFG`,
  `QA_BASE_URL='${url}' QA_REPORT="$JOB/report.json" npx playwright test --config=${CONFIG} ${titles.length ? `-g '${titles.map((t) => t.replace(/[.*+?^${}()|[\]\\']/g, '.')).join('|')}'` : ''} >"$JOB/run.log" 2>&1`,
  `node -e 'const r=JSON.parse(require("fs").readFileSync(process.env.JOB+"/report.json","utf8"));const out=[];const walk=s=>{for(const x of s.suites||[])walk(x);for(const sp of s.specs||[])for(const t of sp.tests||[])out.push({title:sp.title,project:t.projectName,ok:t.status==="expected"||t.status==="flaky",error:((t.results||[]).slice(-1)[0]?.error?.message||"").slice(0,400)})};walk(r);require("fs").writeFileSync(process.env.JOB+"/result.json",JSON.stringify({results:out}))' || echo '{"results":[]}' > "$JOB/result.json"`,
].join('\n');

export async function qa(input: QaInput) {
  'use workflow';
  const { workflowRunId } = getWorkflowMetadata();
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const pr = await readPullRequest(input.pr);
  if (pr.state !== 'open' || pr.draft) return { verdict: 'none', reason: pr.draft ? 'draft' : 'not open' };
  const box = `qa-${pr.number}-${workflowRunId.slice(-8).toLowerCase()}`;
  const k = kit(box, `QA of pull request #${pr.number}`);
  await setStatus(pr.headSha, 'factory/qa', 'pending', 'Waiting for the preview…', runUrl);

  const publish = async (pass: boolean, confidence: 'high' | 'medium' | 'low', headline: string, body: string[], marker: any) => {
    const callout = pass ? (confidence === 'high' ? '> [!TIP]' : confidence === 'medium' ? '> [!NOTE]' : '> [!WARNING]') : '> [!CAUTION]';
    const meter = { high: '●●●', medium: '●●○', low: '●○○' }[confidence];
    await comment(pr.number, [callout, `> ### QA · ${pass ? `${confidence} confidence${confidence === 'low' ? ' — unproven' : ''} &nbsp; \`${meter}\`` : 'bug'}`, `> ${headline}`, '', ...body,
      '', `<sub>🏭 Factory QA · ${k.spendLine()} · [run](${runUrl})</sub>`, `<!-- factory-verdict:qa ${JSON.stringify(marker)} -->`].filter((l) => l !== '').join('\n'));
    if (pr.issue) await comment(pr.issue, `${callout}\n> ### QA · ${pass ? `${confidence} confidence` : 'bug'}\n> ${headline} → #${pr.number}`);
    await setStatus(pr.headSha, 'factory/qa', pass ? 'success' : 'failure', pass ? `${confidence} confidence${confidence === 'low' ? ' (unproven)' : ''}` : headline, runUrl);
  };

  // The preview of this head, and the deployment of the base to compare against.
  let preview = await findDeployment(pr.headSha, 'Preview');
  for (let i = 0; i < 45 && (preview.state === 'pending' || preview.state === 'none'); i++) { await sleep('20s'); preview = await findDeployment(pr.headSha, 'Preview'); }
  if (preview.state !== 'ready') {
    await setStatus(pr.headSha, 'factory/qa', 'error', `No preview to test (${preview.state})`, runUrl);
    return { verdict: 'none', reason: `preview ${preview.state}` };
  }
  const previewUrl = preview.url!;

  const issue = pr.issue ? await readIssue(pr.issue).catch(() => null) : null;
  const previous = await readMarker(pr.number, 'factory-verdict:qa');

  await prepareSandbox(box, pr.headSha);
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
  const marker = (bugs: any[]) => ({ pass: 'qa', commit: co.head, bugs });

  // Nothing an attendee can meet changed: the harness, tests and docs are code review's.
  if (/--app-change=no/.test(f)) {
    await publish(true, 'high', 'Skipped — this pull request changes nothing an attendee can reach; code review covers it.', [], marker([]));
    await disposeSandbox(box);
    return { verdict: 'pass', confidence: 'high', skipped: 'no app change' };
  }

  const ticket = issue ? `The ticket, #${issue.number}: ${issue.title}\n\n${issue.body}\n` : `No linked ticket; the pull request says: ${pr.title}\n\n${pr.body.slice(0, 2000)}\n`;
  const prevProbes: any[] = previous?.bugs || [];

  // 1. Triage: are the tests this PR adds enough, or where are the gaps?
  k.setPhase('triage');
  let gaps: string[] = [];
  let mode: string = 'explore';
  if (!prevProbes.length) {
    const t = await k.agent('triage',
      `${ticket}\nPull request #${pr.number} (branch ${pr.head}) is deployed at ${previewUrl}. Read context/engineering-context/harness/qa-playbook.md §1 ` +
      `(\`awk '/^## 1\\./,/^## 2\\./' context/engineering-context/harness/qa-playbook.md\`), the diff (\`git diff origin/${pr.base}...HEAD\`) and the tests it adds. ` +
      `For each Done-when criterion, name the test file IN THIS DIFF that pins it, or "". Then: enough (every criterion pinned and nothing left worth a probe), ` +
      `focused (list the specific gaps, one probe each) or explore (the change needs open exploration).`,
      S.QA_TRIAGE, 'sonnet', 'low');
    if (t) {
      mode = t.mode;
      gaps = t.gaps;
      // "Enough" is checked against the diff, never taken on trust, and never for a large change.
      const pinned = (t.criteria as any[]).every((c) => c.testFile && files.includes(c.testFile));
      if (mode === 'enough' && pinned && size !== 'large') {
        await publish(true, 'high', `Skipped — the tests this pull request adds pin every criterion (${(t.criteria as any[]).map((c) => c.testFile).filter((x, i, a) => a.indexOf(x) === i).join(', ')}).`, [], marker([]));
        await disposeSandbox(box);
        return { verdict: 'pass', confidence: 'high', skipped: 'tests are enough' };
      }
      if (mode === 'enough') { mode = 'focused'; gaps = (t.criteria as any[]).filter((c) => !c.testFile || !files.includes(c.testFile)).map((c) => c.criterion); }
    }
  }

  // 2. Probe the preview: write them, run them on both viewports, report each.
  k.setPhase('probe');
  const budget = size === 'large' ? 5 : 3;
  const probed = await k.agent('probe',
    `${ticket}\nPull request #${pr.number} (branch ${pr.head}) is deployed at ${previewUrl} — a real Vercel preview with its own fresh database. ` +
    `Follow context/engineering-context/harness/qa-playbook.md §1–§3 (\`awk '/^## 1\\./,/^## 4\\./' context/engineering-context/harness/qa-playbook.md\`), except where this says otherwise.\n\n` +
    (prevProbes.length ? `This is a re-review. Re-run these previous bugs' probes first, verbatim: ${prevProbes.map((b) => `"${b.title}"`).join(', ')}; then at most ${budget - prevProbes.length} new probes, aimed at \`git diff ${previous.commit} HEAD\`.\n` :
      mode === 'focused' ? `Probe exactly these gaps, one probe each:\n${gaps.map((g) => `- ${g}`).join('\n')}\n` : `Explore: at most ${budget} probes where the PR's own tests do not reach.\n`) +
    `\nWrite every probe into tests/qa-probe.spec.js using tests/helpers.js (\`visit(page, path, { as, at })\`, \`momentOn\`, \`ATTENDEES\`; API helpers already point at the preview). ` +
    `Never start the app. Run them against the preview, both viewports, with:\n` +
    `  cat > ${CONFIG} <<'CFG'\n${remoteConfig()}\nCFG\n  QA_BASE_URL=${previewUrl} QA_REPORT=/tmp/qa.json npx playwright test --config=${CONFIG}\n` +
    `Re-run a failing probe once before reporting it. Leave tests/qa-probe.spec.js in place (the factory reproduces failures from it, then deletes it) and change nothing else. ` +
    `Report every probe with its exact title, and expected/actual for any that failed.`,
    S.QA_PROBES, size === 'large' ? 'opus' : 'sonnet');
  if (!probed) {
    await publish(true, 'low', 'The probes did not finish — nothing here was exercised.', [], marker([]));
    await disposeSandbox(box);
    return { verdict: 'pass', confidence: 'low' };
  }

  // 3. Reproduce each failure: again on the preview, then on the base's deployment.
  k.setPhase('reproduce');
  const failing = (probed.probes as any[]).filter((p) => !p.passedDesktop || !p.passedMobile);
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
        S.BASE_SAME, 'sonnet', 'low');
      if (same?.preExisting) preExisting.push(p); else questions.push({ ...p, note: same ? `a gap in what this adds, not on ${pr.base}: ${same.why}` : 'fails on the base too' });
      continue;
    }
    const v = await k.agent('skeptic:probe',
      `${ticket}\nA QA probe on pull request #${pr.number} failed twice on its preview and passed on the base's deployment:\n` +
      `"${p.title}" — ${p.aim}\nexpected: ${p.expected}\nactual: ${p.actual}\n\nRead the probe in tests/qa-probe.spec.js and the code it exercises. Try to REFUTE it as a bug in this change: ` +
      `refuted if the probe itself is wrong (a wrong selector, a wrong expectation, a clock not pinned); contrived if real but reachable only from an input nobody gives in normal use. If you cannot tell, confirmed.`,
      S.SKEPTIC, 'sonnet', 'medium');
    const verdict = v?.verdict ?? 'confirmed';
    if (verdict === 'confirmed') bugs.push(p); else questions.push({ ...p, note: `${verdict}: ${v?.why ?? ''}` });
  }
  await k.command('clean', `rm -f tests/qa-probe.spec.js; git status --porcelain | grep -q . && git checkout -- . ; echo '{"ok":true}' > "$JOB/result.json"`);

  // 4. The verdict: coverage, not feeling.
  const plan = (probed.probes as any[]).length;
  const ranBoth = (probed.probes as any[]).filter((p) => p.passedDesktop !== undefined && p.passedMobile !== undefined).length;
  const share = plan ? ranBoth / plan : 0;
  const confidence = !plan ? 'low' : share >= 0.99 && size !== 'large' ? 'high' : share >= 0.99 ? 'medium' : share >= 0.5 ? 'medium' : 'low';
  const pass = bugs.length === 0;
  const lineFor = (p: any) => `- **${p.title}** — ${p.aim}${p.expected ? `\n  expected: ${p.expected}\n  actual: ${p.actual}` : ''}${p.note ? `\n  (${p.note})` : ''}`;
  await publish(pass, confidence as any,
    pass ? `${probed.covered} — on the preview, desktop and mobile.` : `${bugs.length} bug${bugs.length === 1 ? '' : 's'} in this change, reproduced on the preview and not on ${pr.base}.`,
    [
      bugs.length ? `#### Bugs in this change\n${bugs.map(lineFor).join('\n')}` : '',
      preExisting.length ? `#### Pre-existing (also on ${pr.base})\n${preExisting.map(lineFor).join('\n')}` : '',
      questions.length ? `#### Questions\n${questions.map(lineFor).join('\n')}` : '',
      `#### Probed\n${(probed.probes as any[]).map((p) => `- ${p.passedDesktop && p.passedMobile ? '✅' : '❌'} ${p.title}`).join('\n')}`,
      `\n🔎 Preview: ${previewUrl}`,
    ],
    marker(bugs.map((b) => ({ title: b.title, aim: b.aim }))));
  await disposeSandbox(box);
  return { verdict: pass ? 'pass' : 'fail', confidence, bugs: bugs.map((b) => b.title), preview: previewUrl, spend: k.spend.total };
}
