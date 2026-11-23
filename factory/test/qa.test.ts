import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_DIR, baseCheckout, classify, coverage, isStateful, localRun, mark, probeRun, stripAnsi, tally, warmScript, type Kind } from '../workflows/qa.ts';
import { REPO_DIR } from '../lib/constants.ts';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamLine } from '../lib/sandbox-steps.ts';
import { KNOWN_PRICES } from '../lib/models.ts';

const planned = (title: string) => ({ title, aim: 'a', route: '/', as: 'jonas', at: '', steps: [], expect: ['x shows'] });

test('a probe passes or fails by the factory\'s own run, per viewport; one the writer never wrote did not run', () => {
  const out = tally([planned('qa: a'), planned('qa: b'), planned('qa: c')], [
    { title: 'qa: a', project: 'desktop', ok: true, error: '' },
    { title: 'qa: a', project: 'mobile', ok: false, error: 'expected 3 got 2' },
    { title: 'qa: b', project: 'desktop', ok: true, error: '' },
    { title: 'qa: b', project: 'mobile', ok: true, error: '' },
  ]);
  assert.deepEqual(out.map((p) => [p.passedDesktop, p.passedMobile]), [[true, false], [true, true], [undefined, undefined]]);
  assert.match(out[0].error, /^mobile: expected 3 got 2$/);
});

test('the factory runs one viewport per job, and reports load errors so a broken file climbs the writer', () => {
  assert.match(probeRun('https://x.vercel.app', [], 'mobile'), /--project=mobile/);
  assert.doesNotMatch(probeRun('https://x.vercel.app', ['qa: a']), /--project=/);
  assert.match(probeRun('https://x.vercel.app', []), /errors:\(r\.errors\|\|\[\]\)/);
  // Each job writes its artefacts under its own directory: two viewports run at once.
  assert.match(probeRun('https://x.vercel.app', []), /QA_OUT="\$JOB\/out"/);
});

test('warming hits the preview\'s API, not only its static pages', () => {
  const s = warmScript('https://x.vercel.app/');
  assert.match(s, /\/api\/bootstrap/);
  assert.match(s, /https:\/\/x\.vercel\.app\$p/);
});

test('the progress stream prices an agent from the catalog and says why its model was picked', () => {
  const model = 'anthropic/claude-haiku-5.5';
  const result = JSON.stringify({
    structured_output: { ok: true }, total_cost_usd: 0.4, num_turns: 9, duration_ms: 33_000, result: 'wrote it',
    modelUsage: { [model]: { inputTokens: 10_000, outputTokens: 1_000, cacheReadInputTokens: 100_000, cacheCreationInputTokens: 0, costUSD: 0.4 } },
  });
  const meta = JSON.stringify({ model, why: 'lite, Jev 90%', est: 0.011, price: { [model]: KNOWN_PRICES[model] } });
  const line = streamLine('007-write', { state: 'done', exit: 0, result, tail: '' }, meta);
  assert.match(line, /^write: done · haiku-5\.5 \(lite, Jev 90%\) · 9 turns · 33s · \$0\.003 \(est \$0\.011\)/);
  assert.equal(streamLine('008-run_desktop', { state: 'done', exit: 0, result: '{"results":[]}', tail: '', seconds: 41 }), 'run_desktop: exit 0 · 41s');
});

// ── #36: every probe failed, and none of it was the change ───────────────────

const ESC = '\u001b';
const coloured = `Error: ${ESC}[2mexpect(${ESC}[22m${ESC}[31mlocator${ESC}[39m${ESC}[2m).${ESC}[22mtoBeVisible${ESC}[2m()${ESC}[22m failed`;

test('colour codes never reach a comment: stripped from a message, and from the run\'s own report before it is cut', async () => {
  assert.equal(stripAnsi(coloured), 'Error: expect(locator).toBeVisible() failed');
  assert.equal(stripAnsi(undefined), '');
  const out = tally([planned('qa: a')], [{ title: 'qa: a', project: 'desktop', ok: false, error: coloured }]);
  assert.doesNotMatch(out[0].error, /\u001b/);

  // The job's own collector: a Playwright JSON report in, result.json out, as the sandbox runs it.
  const job = mkdtempSync(join(tmpdir(), 'qa-'));
  const long = `${ESC}[31m${'x'.repeat(5)}${ESC}[39m`.repeat(100);
  writeFileSync(`${job}/report.json`, JSON.stringify({ suites: [{ specs: [{ title: 'qa: a', tests: [{ projectName: 'mobile', status: 'unexpected', results: [{ error: { message: coloured + long } }] }] }] }] }));
  const collect = probeRun('https://x.vercel.app', []).split('\n').at(-1)!;
  execFileSync('bash', ['-c', collect], { env: { ...process.env, JOB: job } });
  const r = JSON.parse(readFileSync(`${job}/result.json`, 'utf8'));
  assert.doesNotMatch(r.results[0].error, /\u001b/);
  assert.match(r.results[0].error, /^Error: expect\(locator\)\.toBeVisible\(\) failedxxxxx/);
  assert.equal(r.results[0].error.length, 400, 'the 400 characters kept are text, not escape codes');
});

test('a probe that books, checks in or rates runs on the branch\'s own app; one that only looks stays on the preview', () => {
  assert.equal(isStateful({ stateful: true, steps: [] }), true);
  assert.equal(isStateful({ stateful: false, steps: ['open /my-agenda as kenji', "expect getByTestId('agenda-day') to show 3 headings"] }), false);
  // The planner forgot: the steps still say it writes.
  assert.equal(isStateful({ stateful: false, steps: ['book session A through the API with request.post', 'open /my-agenda'] }), true);
  assert.equal(isStateful({ steps: ["click getByTestId('agenda-day')"] }), false);
  assert.equal(isStateful({ steps: ['Check in to the 09:00 session'] }), true);
  assert.equal(isStateful({ steps: ['Remove session X from the agenda'] }), true);
  assert.equal(isStateful({ steps: ['read the rating shown on the card'] }), false, 'reading a rating is not rating');
});

test('the branch\'s own app runs on a claimed lane, one process, never the preview; the base gets a worktree of its own', () => {
  const s = localRun(REPO_DIR, ['qa: books then looks']);
  assert.match(s, /lane\.mjs claim qa/);
  assert.match(s, /unset QA_BASE_URL/);
  assert.match(s, /-g 'qa: books then looks'/);
  assert.doesNotMatch(s, /--project=/, 'both viewports in one run, one at a time (workers: 1 in its config)');
  assert.match(s, /workers: 1/);
  assert.match(s, /webServer: \{ \.\.\.base\.webServer, cwd: /);
  const b = localRun(BASE_DIR, ['qa: x']);
  assert.ok(b.includes(`cd ${BASE_DIR}`));
  assert.notEqual(s.split('\n')[0], b.split('\n')[0], 'the base writes its own config');
  assert.ok(baseCheckout('abc123').includes(`--detach ${BASE_DIR} abc123`));
});

test('a failure is a bug, the environment\'s, pre-existing or a question, and the environment is never a gap in the change', () => {
  assert.deepEqual(classify({ reproduced: false }), { kind: 'question', note: 'did not fail a second time' });
  // #36: the base fails because the feature is not there, and the preview failed because another instance served the page.
  assert.equal(classify({ reproduced: true, base: { preExisting: false, environment: true, why: 'booking on another instance' } })?.kind, 'environment');
  assert.equal(classify({ reproduced: true, base: { preExisting: true, environment: false, why: 'same' } })?.kind, 'preExisting');
  // The base says only "not there yet": no verdict on this change, so the skeptic decides.
  assert.equal(classify({ reproduced: true, base: { preExisting: false, environment: false, why: 'feature absent' } }), null);
  assert.equal(classify({ reproduced: true }), null);
  assert.deepEqual(classify({ reproduced: true, skeptic: { verdict: 'confirmed', environment: false, why: '' } }), { kind: 'bug', note: '' });
  assert.equal(classify({ reproduced: true, skeptic: null })?.kind, 'bug', 'a dead skeptic leaves a reproduced failure standing');
  assert.deepEqual(classify({ reproduced: true, skeptic: { verdict: 'refuted', environment: true, why: `${ESC}[31mnet::ERR_NAME_NOT_RESOLVED${ESC}[39m` } }),
    { kind: 'environment', note: 'net::ERR_NAME_NOT_RESOLVED' });
  assert.deepEqual(classify({ reproduced: true, skeptic: { verdict: 'contrived', environment: false, why: 'hand-edited URL' } }), { kind: 'question', note: 'contrived: hand-edited URL' });
  // A confirmed bug stays a bug even when the skeptic also blames the environment.
  assert.equal(classify({ reproduced: true, skeptic: { verdict: 'confirmed', environment: true, why: '' } })?.kind, 'bug');
});

test('confidence counts only probes that ran meaningfully, and the environment shows ⚪, never ❌', () => {
  const both = (title: string, ok: boolean) => ({ title, passedDesktop: ok, passedMobile: ok });
  const probes = [both('a', true), both('b', true), both('c', false), both('d', false), { title: 'e' }];
  assert.deepEqual(coverage(5, probes, new Map<string, Kind>([['c', 'environment'], ['d', 'question']]), false), { meaningful: 3, confidence: 'medium' });
  assert.deepEqual(coverage(5, probes, new Map<string, Kind>([['c', 'environment'], ['d', 'environment']]), false), { meaningful: 2, confidence: 'low' });
  assert.deepEqual(coverage(2, [both('a', true), both('b', false)], new Map<string, Kind>([['b', 'bug']]), false), { meaningful: 2, confidence: 'high' });
  assert.equal(coverage(2, [both('a', true), both('b', true)], new Map(), true).confidence, 'medium', 'a large change is never high');
  assert.equal(mark(both('a', true)), '✅');
  assert.equal(mark(both('c', false), 'environment'), '⚪');
  assert.equal(mark(both('c', false), 'bug'), '❌');
  assert.equal(mark(both('c', false), 'question'), '❔');
  assert.equal(mark({ passedDesktop: true }), '⚪', 'did not run on mobile');
});
