import { getWorkflowMetadata, setAttributes } from 'workflow';
import { kit } from '../lib/kit';
import { disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { setStatus } from '../lib/github-steps';
import { chooseModels, modelBook } from '../lib/models';
import { chooseTests, classify, gateRecordFor, recordEscapes, recordGate, saveTestMap, stageTestMap } from '../lib/phases';
import { breakdownLine, mergeShards, none, statusLine, withoutRan, type Facts, type Project, type Selection } from '../lib/select';
import { factsScript, runShards } from '../lib/testrun';
import { FACTORY_DASHBOARD, FACTORY_DEPS, REPO_DIR } from '../lib/constants';

/**
 * verify — CI, on Vercel. Every push to a pull request and to main; reports
 * the commit status `factory/verify`. It runs what the change needs:
 *
 *   classify   the changed paths: factory only → the factory's typecheck and
 *              tests, no app gate; docs only → the context check if context/
 *              changed, else nothing; app → the app's checks; both → both.
 *   select     (app) the tests that matter: the test map's candidates, the
 *              specs the imports reach, the branch's own specs and the smoke
 *              set, adjusted by a cheap model that reads the diff
 *              (lib/select.ts). Unsure or no map: wider. A pull request
 *              labelled `full-suite`, and main, run everything.
 *   runDesktop / runMobile   the two Playwright projects side by side, each in
 *              its own sandbox forked from the warm one (npm test with desktop).
 *
 * A pull request ship opened has already been gated on this code: what its
 * gate ran green is not run again — only what verify's selection adds.
 * On main it also rebuilds the test map (coverage, one test at a time, in a
 * third sandbox) and records an escape for any failure the merged pull
 * request's selection had skipped.
 */
export type VerifyInput = { sha: string; ref: string; base?: string; fast?: boolean; pr?: number; full?: boolean };

const boxes = (sha: string, runId: string) => {
  const b = `verify-${sha.slice(0, 8)}-${runId.slice(-6).toLowerCase()}`;
  return { desktop: b, mobile: `${b}-m`, map: `${b}-map` };
};

export async function verify(input: VerifyInput) {
  'use workflow';
  try {
    return await verifyRun(input);
  } catch (e: any) {
    const { workflowRunId } = getWorkflowMetadata();
    const b = boxes(input.sha, workflowRunId);
    await Promise.all([disposeSandbox(b.desktop), disposeSandbox(b.mobile), disposeSandbox(b.map)]).catch(() => null);
    const why = String(e?.message || e).slice(0, 140);
    await setStatus(input.sha, 'factory/verify', 'error', why, `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`).catch(() => null);
    return { ok: false, reason: why };
  }
}

async function verifyRun(input: VerifyInput) {
  const { workflowRunId } = getWorkflowMetadata();
  const issue = /^issue-(\d+)-/.exec(input.ref)?.[1];
  await setAttributes({ sha: input.sha.slice(0, 12), ref: input.ref.slice(0, 200), ...(input.pr ? { pr: String(input.pr) } : {}), ...(issue ? { issue } : {}) });
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const box = boxes(input.sha, workflowRunId);
  const base = input.base || 'main';
  const onMain = input.ref === 'main' && !input.pr;
  await setStatus(input.sha, 'factory/verify', 'pending', 'Choosing what to run…', runUrl);

  // ── classify ──────────────────────────────────────────────────────────────
  const ch = await classify(input.sha, onMain ? null : base);
  // Main runs the whole app suite whatever the commit touched: it is the safety net under every selection.
  const c = onMain ? { ...ch.classified, app: true } : ch.classified;
  await setAttributes({ kind: ch.classified.kind });
  if (!c.app && !c.factory && !c.context) {
    const line = statusLine(c, { mode: 'none' } as Selection, {});
    await setStatus(input.sha, 'factory/verify', 'success', line, runUrl);
    await setAttributes({ verdict: 'pass', selected: '0' });
    return { ok: true, line };
  }

  const k = kit(box.desktop, `verifying ${input.ref} at ${input.sha.slice(0, 7)}`, 'read');
  const km = kit(box.mobile, `verifying ${input.ref} at ${input.sha.slice(0, 7)} (mobile)`, 'read');
  const prepMobile = c.app ? prepareSandbox(box.mobile, input.sha, 'none') : null;
  const prep = await prepareSandbox(box.desktop, input.sha, 'none');
  k.log(`sandbox ${prep.how} in ${prep.seconds}s`);

  // ── select ────────────────────────────────────────────────────────────────
  let facts: Facts | null = null;
  let sel: Selection = none(null, '');
  let reused = 0;
  let unitDone = false;
  let prior: Awaited<ReturnType<typeof gateRecordFor>> = null;
  if (c.app) {
    const staged = await stageTestMap(box.desktop);
    const listed = await k.command('select', factsScript(base));
    facts = (listed?.facts ?? null) as Facts | null;
    const full = onMain ? 'main runs everything' : input.full ? 'the full-suite label' : undefined;
    const choice = full ? null : await chooseModels(`Pull request${input.pr ? ` #${input.pr}` : ''} on ${input.ref}. Files changed: ${ch.files.slice(0, 80).join(', ')}`, 'fast', ['testSelect']);
    const book = choice ? modelBook(choice, 'fast') : null;
    const pick = book?.pick('testSelect') ?? null;
    const chosen = await chooseTests({
      classified: c, facts, diff: ch.diff, escapes: staged.escapes,
      pick: pick ? { model: pick.model, price: book!.catalog[pick.model] ?? null } : null, options: { full },
    });
    sel = chosen.selection;
    if (book && pick && chosen.asked) book.record({ job: 'testSelect', label: 'select', model: pick.model, tier: pick.tier, est: pick.est, cost: chosen.cost, ok: !!chosen.answer, seconds: chosen.seconds });
    k.log(`select: ${sel.mode} — ${sel.reason}; ${sel.ran} of ${sel.total} browser tests [${breakdownLine(sel)}]${chosen.answer ? ` (selector ${Math.round(chosen.answer.confidence * 100)}%: ${chosen.answer.summary.slice(0, 200)})` : chosen.error ? ` (selector failed: ${chosen.error})` : ''}`);
    // Ship gated this very code before it opened the pull request: run only what it did not.
    prior = onMain || input.full ? null : await gateRecordFor(input.sha);
    if (prior?.by === 'ship' && prior.ok && facts) {
      const before = sel.ran;
      sel = withoutRan(sel, facts, prior.tests);
      reused = before - sel.ran;
      unitDone = prior.unitOk;
      k.log(`ship's gate ran ${reused} of these green at ${prior.ranAt.slice(0, 7)}${unitDone ? ', and npm test' : ''}`);
    }
    await setAttributes({
      selection: sel.mode, selected: String(sel.ran), of: String(sel.total), reason: sel.reason.slice(0, 120), breakdown: breakdownLine(sel),
      ...(sel.confidence !== null ? { confidence: sel.confidence.toFixed(2) } : {}),
      ...(reused ? { reused: String(reused) } : {}),
      ...(book?.summary() ? { models: book.summary() } : {}),
    });
    await setStatus(input.sha, 'factory/verify', 'pending', `Running ${sel.ran} of ${sel.total} browser tests…`, runUrl);
  }

  // ── run: the two shards, the factory's checks, the docs check, main's map — side by side ──
  const kmFor = async () => { await prepMobile; return km; };
  const [shards, factory, docs, map] = await Promise.all([
    c.app
      ? runShards(sel, {
        base, full: sel.mode === 'full', unit: !unitDone,
        run: async (p: Project, label, script) => (p === 'desktop' ? k : await kmFor()).command(label, script),
      })
      : Promise.resolve(null),
    c.factory
      ? (async () => (c.app ? await kmFor() : k).command('factory', [
        `${FACTORY_DEPS}`,
        `R=failed; (cd factory && npx tsc --noEmit -p . && npm test) >"$JOB/factory.log" 2>&1 && R=ok`,
        `echo "{\\"factory\\":\\"$R\\"}" > "$JOB/result.json"`,
      ].join('\n')))()
      : Promise.resolve(null),
    c.context
      ? k.command('docs', `R=failed; node scripts/context.mjs check >"$JOB/docs.log" 2>&1 && R=ok; echo "{\\"docs\\":\\"$R\\"}" > "$JOB/result.json"`)
      : Promise.resolve(null),
    onMain && ch.classified.app ? buildMap(input.sha, box.map) : Promise.resolve(null),
  ]);
  await Promise.all([disposeSandbox(box.desktop), disposeSandbox(box.mobile)]);

  const g = shards ? mergeShards({ desktop: shards.desktop.gate, mobile: shards.mobile.gate }) : null;
  const factoryResult: string | undefined = c.factory ? (factory?.factory ?? 'failed') : undefined;
  const docsResult: string | undefined = c.context ? (docs?.docs ?? 'failed') : undefined;
  const unitLine = !g ? undefined : unitDone ? 'green in ship\'s gate' : g.unit.failed ? `${g.unit.failed} failed` : `all (${g.unit.passed})`;
  const ok = (!g || g.ok) && factoryResult !== 'failed' && docsResult !== 'failed';
  const failedCount = (g ? g.browser.failed.length + (g.unit.failed ? 1 : 0) : 0) + (factoryResult === 'failed' ? 1 : 0) + (docsResult === 'failed' ? 1 : 0);
  const line = statusLine(c, sel, { unit: unitLine, factory: factoryResult, docs: docsResult, failed: ok ? 0 : failedCount, reused, label: !!input.full });
  const first = g?.browser.failed[0]?.test || (g?.unit.failed ? 'npm test' : factoryResult === 'failed' ? 'factory: typecheck or tests' : docsResult === 'failed' ? 'context check' : '');
  await setStatus(input.sha, 'factory/verify', ok ? 'success' : 'failure', ok ? line : `${first} — ${line}`, runUrl);
  await setAttributes({ verdict: ok ? 'pass' : 'fail' });

  // What ran here, for main's escape check after this pull request merges (and ship's, if it gated first).
  if (!onMain && g) {
    const union = (p: Project) => [...new Set([...(prior?.tests[p] ?? []), ...sel.tests[p]])];
    await recordGate({
      by: 'verify', sha: input.sha, ranAt: input.sha, pr: input.pr ?? null, ok, unitOk: !g.unit.failed,
      mode: prior && prior.mode !== 'full' && sel.mode === 'full' ? prior.mode : sel.mode, reason: sel.reason, confidence: sel.confidence,
      tests: { desktop: union('desktop'), mobile: union('mobile') },
    }).catch(() => null);
  }
  // Main is the safety net: a failure the merged pull request's selection skipped is an escape.
  if (onMain && g && !g.ok) {
    const escaped = await recordEscapes(input.sha, g.browser.failed.map((f: any) => f.test)).catch(() => []);
    if (escaped.length) await setAttributes({ escapes: String(escaped.length) });
  }
  if (map) k.log(`test map: ${JSON.stringify(map).slice(0, 200)}`);
  return { ok, line, failed: g?.browser.failed.map((f: any) => f.test) ?? [] };
}

/**
 * Main: rebuild the test map — the suite once more under coverage, one test at
 * a time, in its own sandbox so the status never waits for it — and keep it in
 * Blob for the next pull request.
 */
async function buildMap(sha: string, name: string) {
  const prep = await prepareSandbox(name, sha, 'none');
  const k = kit(name, `building the test map at ${sha.slice(0, 7)}`, 'read');
  const built = await k.command('testmap', `node scripts/test-map.mjs build 2>"$JOB/map.err" | tail -1 > "$JOB/result.json"`);
  const saved = built?.ok ? await saveTestMap(name, `${REPO_DIR}/test-results/test-map.json`, sha) : null;
  await disposeSandbox(name);
  if (saved) await setAttributes({ testMap: `${saved.tests} tests, ${saved.files} files, ${built.seconds}s` });
  return { prepared: prep.seconds, built, saved };
}
