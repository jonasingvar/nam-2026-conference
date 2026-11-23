import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeRun, tally, warmScript } from '../workflows/qa.ts';
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
