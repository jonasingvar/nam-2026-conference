import { head, put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';
import { gateway, generateText, jsonSchema, Output } from 'ai';
import { advance, type JobPoll } from './sandbox-steps';
import { TEST_MAP_IN_SANDBOX } from './constants';
import { changesOf, pullOfCommit } from './github-steps';
import type { Price } from './models';
import {
  classify as classifyFiles, decideSelection, escapesFrom, readAnswer, selectorPrompt, SELECTOR_SCHEMA,
  type Classified, type Escape, type Facts, type GateRecord, type SelectOptions, type SelectorAnswer, SMOKE,
} from './select';
import { jevPicksTests, pickSpecs, type JevPick } from './test-pick';

/**
 * One durable step per kind of work, so a run's trace in Vercel reads as its
 * phases — spec, implement, gate, codeAudit, skeptic, fix, openPullRequest —
 * instead of anonymous job plumbing. Each starts its job in the sandbox if it
 * is not running yet, waits up to two minutes for it, and says how it stands;
 * the workflow sleeps and calls the same step again until it is done. A
 * crash anywhere costs only the step that was waiting.
 */
type Phase = (sandbox: string, id: string, files: Record<string, string>, script: string) => Promise<JobPoll>;

// ── ship ─────────────────────────────────────────────────────────────────────
export async function makeBranch(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function spec(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function planAudit(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function reviseSpec(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function implement(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function gate(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function codeAudit(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function skeptic(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function fix(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function learn(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function pushBranch(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
// ── review, QA, respond, verify ──────────────────────────────────────────────
export async function checkout(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function measureDiff(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function recheckBlocker(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function reviewLens(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function qaTriage(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
// QA, split so the trace shows where its time goes: seed the preview's instances, plan (a thinking
// model), write the probes (a cheap one), and the factory's own run of them on each viewport.
export async function warmPreview(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function planProbes(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function writeProbes(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function runProbes(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
// ── shots ────────────────────────────────────────────────────────────────────
export async function listPages(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function screenshot(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function reproduce(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function reproduceOnBase(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function cleanUp(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function makeChange(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function job(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
// ── verify, and ship's gate: what to run, then desktop and mobile side by side ──
export async function selectTests(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function runDesktop(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function runMobile(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function factoryChecks(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function docsCheck(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}
export async function buildTestMap(s: string, id: string, f: Record<string, string>, c: string) {
  'use step';
  return advance(s, id, f, c);
}

makeBranch.maxRetries = 5;
spec.maxRetries = 5;
planAudit.maxRetries = 5;
reviseSpec.maxRetries = 5;
implement.maxRetries = 5;
gate.maxRetries = 5;
codeAudit.maxRetries = 5;
skeptic.maxRetries = 5;
fix.maxRetries = 5;
learn.maxRetries = 5;
pushBranch.maxRetries = 5;
checkout.maxRetries = 5;
measureDiff.maxRetries = 5;
recheckBlocker.maxRetries = 5;
reviewLens.maxRetries = 5;
qaTriage.maxRetries = 5;
warmPreview.maxRetries = 5;
planProbes.maxRetries = 5;
writeProbes.maxRetries = 5;
runProbes.maxRetries = 5;
reproduce.maxRetries = 5;
reproduceOnBase.maxRetries = 5;
cleanUp.maxRetries = 5;
makeChange.maxRetries = 5;
listPages.maxRetries = 5;
screenshot.maxRetries = 5;
job.maxRetries = 5;
selectTests.maxRetries = 5;
runDesktop.maxRetries = 5;
runMobile.maxRetries = 5;
factoryChecks.maxRetries = 5;
docsCheck.maxRetries = 5;
buildTestMap.maxRetries = 5;

/** Which named step a job runs under, from its label's first word. */
export function phaseFor(label: string): Phase {
  // Labels arrive as job ids, their separators made safe: audit:combined#3 → audit_combined_3.
  const head = label.split(/[_:#~]/)[0];
  const table: Record<string, Phase> = {
    branch: makeBranch, plan: spec, 'plan-audit': planAudit, 'revise-spec': reviseSpec, build: implement,
    gate, audit: codeAudit, skeptic, fix, learn, push: pushBranch,
    checkout, facts: measureDiff, recheck: recheckBlocker, lens: reviewLens,
    triage: qaTriage, warm: warmPreview, probeplan: planProbes, write: writeProbes, run: runProbes, again: reproduce, base: reproduceOnBase, clean: cleanUp, change: makeChange,
    pages: listPages, shoot: screenshot,
    select: selectTests, desktop: runDesktop, mobile: runMobile, factory: factoryChecks, docs: docsCheck, testmap: buildTestMap,
  };
  return table[head] ?? job;
}

// ── Test selection: the steps around the sandbox jobs ───────────────────────
// (Blob: the public store orbit-pr-media; the sandbox holds no token, so the function reads and writes it.)
const MAP_LATEST = 'test-map/latest.json';
const ESCAPES = 'test-map/escapes.json';
const recordPath = (sha: string) => `test-select/${sha}.json`;

async function blobJson(path: string): Promise<any | null> {
  try {
    const meta = await head(path);
    const r = await fetch(`${meta.url}?v=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
const putJson = (path: string, value: unknown) =>
  put(path, JSON.stringify(value), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });

/** What a commit changes (GitHub), sorted into what it needs checked. */
export async function classify(sha: string, base: string | null) {
  'use step';
  const ch = await changesOf(sha, base);
  // Too big to list is not "nothing changed": treat it as the app.
  const c = classifyFiles(ch.complete ? [...ch.files, ...ch.removed] : [...ch.files, 'package.json']);
  return { classified: c, files: ch.files, diff: ch.diff };
}
classify.maxRetries = 3;

/**
 * Put the newest test map into the sandbox (the sandbox cannot reach Blob),
 * and read the recent escapes for the selector. A missing map is no error:
 * the selection widens.
 */
export async function stageTestMap(sandbox: string) {
  'use step';
  const latest = await blobJson(MAP_LATEST);
  const map = latest?.url ? await fetch(latest.url).then((r) => (r.ok ? r.text() : null)).catch(() => null) : null;
  if (map) {
    const sb = await Sandbox.get({ name: sandbox });
    await sb.writeFiles([{ path: TEST_MAP_IN_SANDBOX, content: Buffer.from(map) }]);
  }
  const escapes: Escape[] = (await blobJson(ESCAPES)) || [];
  return { map: map ? { sha: latest.sha as string, builtAt: latest.builtAt as string } : null, escapes: escapes.slice(-20) };
}
stageTestMap.maxRetries = 3;

/**
 * The selector: one structured answer from the model the book picked for
 * `testSelect`, through AI Gateway, from the function — the sandbox stays
 * without credentials — then the pure decision. A failed call is no answer,
 * and no answer widens the run.
 */
export async function chooseTests(o: {
  classified: Classified; facts: Facts | null; diff: string; escapes: Escape[];
  pick: { model: string; price: Price | null } | null; options: SelectOptions;
  /** With `options.jev`: what was asked for, in words — the ticket's title, or a person's comment. */
  about?: string;
}) {
  'use step';
  const t0 = Date.now();
  // Jev picks the verticals: one yes/no per spec file, from what was asked and the diff (lib/test-pick.ts).
  if (o.options.jev && o.classified.app && o.facts?.tests && !o.options.full) {
    const f = o.facts;
    const bySpec = new Map<string, string[]>();
    for (const t of [...f.tests!.desktop, ...f.tests!.mobile]) {
      if (t.spec === 'tests/presentation.spec.js' && !f.deck) continue;
      const titles = bySpec.get(t.spec) ?? [];
      if (!titles.includes(t.title)) titles.push(t.title);
      bySpec.set(t.spec, titles);
    }
    const seen = new Set([...Object.keys(f.map?.desktop ?? {}), ...Object.keys(f.map?.mobile ?? {})]);
    // The smoke spec is not a vertical: it opens every page, so Jev always finds it plausible (67% on a
    // home-page fix, which added 18 tests to the 13 that mattered). It is the fallback, never a pick.
    const verticals = [...bySpec].filter(([spec]) => spec !== SMOKE).map(([spec, titles]) => ({ spec, titles, ranChanged: seen.has(spec) }));
    const jev = await jevPicksTests({ about: o.about || '', files: o.classified.files, diff: o.diff, verticals });
    const own = f.changed.filter((x) => bySpec.has(x));
    const picked = pickSpecs(jev, own);
    const selection = decideSelection(o.classified, f, null, { ...o.options, picked });
    return { selection, answer: null as SelectorAnswer | null, asked: false, cost: 0, error: jev.error ?? '', seconds: Math.round((Date.now() - t0) / 1000), jev };
  }
  let answer: SelectorAnswer | null = null;
  let cost = 0;
  let error = '';
  const ask = o.classified.app && o.facts && !o.options.full && !o.options.jev && o.pick;
  if (ask) {
    try {
      const r = await generateText({
        model: gateway(o.pick!.model),
        prompt: selectorPrompt({ files: o.classified.files, diff: o.diff, facts: o.facts!, escapes: o.escapes }),
        output: Output.object({ schema: jsonSchema(SELECTOR_SCHEMA as any) }),
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(90_000),
      });
      answer = readAnswer(r.output);
      const p = o.pick!.price;
      if (p) cost = (r.usage.inputTokens || 0) * p.input + (r.usage.outputTokens || 0) * p.output;
    } catch (e: any) {
      error = String(e?.message || e).slice(0, 200);
    }
  }
  const selection = decideSelection(o.classified, o.facts, answer, o.options);
  return { selection, answer, asked: !!ask, cost, error, seconds: Math.round((Date.now() - t0) / 1000), jev: null as JevPick | null };
}
chooseTests.maxRetries = 1;

/** Copy the map main's coverage run wrote out of the sandbox into Blob, and point `latest` at it. */
export async function saveTestMap(sandbox: string, path: string, sha: string) {
  'use step';
  const sb = await Sandbox.get({ name: sandbox });
  const buf = await sb.readFileToBuffer({ path });
  if (!buf) return null;
  const map = JSON.parse(buf.toString('utf8'));
  if (!map?.tests || !map?.files) return null;
  const blob = await put(`test-map/${sha}.json`, buf, { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
  await putJson(MAP_LATEST, { sha, url: blob.url, builtAt: map.builtAt, seconds: map.seconds });
  return { url: blob.url, files: Object.keys(map.files).length, tests: map.tests.desktop.length + map.tests.mobile.length };
}
saveTestMap.maxRetries = 3;

/** What a gate ran at a commit, for the next gate on the same code and for main's escape check. */
export async function recordGate(rec: GateRecord) {
  'use step';
  await putJson(recordPath(rec.sha), rec);
  return true;
}
recordGate.maxRetries = 3;

export async function gateRecordFor(sha: string): Promise<GateRecord | null> {
  'use step';
  return blobJson(recordPath(sha));
}
gateRecordFor.maxRetries = 3;

/**
 * Main's full run failed: which of those failures did the merged pull
 * request's selection skip? Each is an escape — kept (the last 50) for the
 * selector to read on every later pull request.
 */
export async function recordEscapes(sha: string, failed: string[]) {
  'use step';
  const pr = await pullOfCommit(sha).catch(() => null);
  if (!pr) return [];
  const rec: GateRecord | null = await blobJson(recordPath(pr.headSha));
  const missed = escapesFrom(failed, rec);
  if (!missed.length) return [];
  const at = new Date().toISOString();
  const log: Escape[] = (await blobJson(ESCAPES)) || [];
  const added = missed.map((test) => ({ at, pr: pr.number, sha, test, mode: rec?.mode ?? 'none', reason: rec?.reason ?? '' }));
  await putJson(ESCAPES, [...log, ...added].slice(-50));
  return added;
}
recordEscapes.maxRetries = 2;
