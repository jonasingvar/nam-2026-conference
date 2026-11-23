import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogFrom, cheapestExpected, climb, estimate, fallbackPick, JOBS, KNOWN_PRICES, LADDER, modelBook, modelFor, pickFrom, priceUsage, TIERS, usableTiers,
  type Catalog,
} from '../lib/models.ts';

const lite = LADDER.lite[0];
const strong = LADDER.strong[0];
const frontier = LADDER.frontier[0];

const raw = (id: string, input: string, output: string, extra: Record<string, unknown> = {}, tags = ['tool-use', 'structured-output']) =>
  ({ id, type: 'language', tags, pricing: { input, output, ...extra } });

test('the catalog keeps only vetted, priced, tool-using language models — and a model without a cache price pays full input for re-reads', () => {
  const c = catalogFrom([
    raw(lite, '0.0000001', '0.0000005', { input_cache_read: '0.00000001' }),
    raw(strong, '0.000002', '0.00001'),
    raw('someone/unvetted', '0', '0'),
    raw(frontier, '0.000004', '0.00002', {}, ['structured-output']),
    { id: LADDER.standard[0], type: 'language', tags: ['tool-use'], pricing: null },
  ]);
  assert.deepEqual(Object.keys(c).sort(), [lite, strong].sort());
  assert.equal(c[lite].cacheRead, 1e-8);
  assert.equal(c[strong].cacheRead, 2e-6, 'no cache price: cache reads cost full input');
});

test('within a tier the cheapest offered model wins; a tier the catalog no longer offers is skipped', () => {
  const cheap: Catalog = { [LADDER.standard[0]]: { input: 1e-6, output: 1e-6, cacheRead: 1e-6, cacheWrite: 1e-6 }, [LADDER.standard[1]]: { input: 1e-8, output: 1e-8, cacheRead: 1e-8, cacheWrite: 1e-8 } };
  assert.equal(modelFor(1, 'qaWrite', cheap)?.model, LADDER.standard[1], 'the cheaper for this job, not the first listed');
  assert.ok(Math.abs(modelFor(1, 'qaWrite', cheap)!.est - estimate(cheap[LADDER.standard[1]], JOBS.qaWrite.tokens)) < 1e-12);
  const noStrong: Catalog = Object.fromEntries(Object.entries(KNOWN_PRICES).filter(([m]) => !LADDER.strong.includes(m)));
  assert.deepEqual(usableTiers('implement', noStrong), [0, 1, 3]);
  assert.deepEqual(usableTiers('qaWrite', KNOWN_PRICES), [0, 1, 2], 'within the job\'s own range');
});

test('cost first: when Jev is sure a cheap tier is enough, the cheap tier starts', () => {
  const p = pickFrom('qaWrite', [0.9, 0.08, 0.02, 0], 'small', KNOWN_PRICES)!;
  assert.equal(p.tier, 0);
  assert.equal(p.how, 'jev');
  assert.ok(p.sure! >= 0.9);
});

test('a visible failure is cheap to try: a job that fails loudly starts low even when Jev is unsure', () => {
  // implement fails at the gate, so trying the cheap tier first costs only the climb…
  const dist = [0.9, 0.08, 0.02, 0];
  assert.equal(pickFrom('implement', dist, 'small', KNOWN_PRICES)!.tier, 0);
  // …while a skeptic with worse odds would miss silently, so it starts higher.
  assert.ok(pickFrom('skeptic', [0.6, 0.3, 0.1, 0], 'small', KNOWN_PRICES)!.tier > 0);
});

test('a silent failure is expensive: judgement starts where Jev thinks a miss is unlikely', () => {
  const p = pickFrom('audit', [0, 0.5, 0.5, 0], 'small', KNOWN_PRICES)!;
  assert.equal(p.tier, 2, 'a missed blocker costs more than the stronger auditor');
});

test('the expected cost counts every climb a visible failure needs', () => {
  const sure = cheapestExpected('implement', [0, 0, 1, 0], KNOWN_PRICES)!;
  assert.equal(sure.tier, 2, 'certain it needs strong: starting lower only adds a wasted run');
});

test('Jev unavailable, or an answer that is not a distribution: the size\'s fallback tier', () => {
  for (const bad of [null, [1, 0], [0.5, 0.5, 0.5, 0.5], [NaN, 0, 1, 0]]) {
    const p = pickFrom('implement', bad as any, 'full', KNOWN_PRICES)!;
    assert.equal(p.how, 'fallback');
    assert.equal(p.tier, JOBS.implement.fallback.full);
  }
  assert.equal(fallbackPick('qaWrite', 'full', KNOWN_PRICES)!.tier, 0);
});

test('a floor holds whatever Jev says, and climbing stops at the job\'s ceiling', () => {
  assert.equal(pickFrom('qaWrite', [1, 0, 0, 0], 'small', KNOWN_PRICES, 2)!.tier, 2);
  let p = fallbackPick('qaWrite', 'small', KNOWN_PRICES)!;
  const seen = [p.tier];
  for (let up = climb(p, KNOWN_PRICES); up; up = climb(p, KNOWN_PRICES)) { p = up; seen.push(p.tier); }
  assert.deepEqual(seen, [0, 1, 2], `qaWrite tops out at ${TIERS[JOBS.qaWrite.max]}`);
});

test('a run is priced from the catalog, not from Claude Code\'s guess for a model it does not know', () => {
  const usage = { [lite]: { inputTokens: 10_000, outputTokens: 1_000, cacheReadInputTokens: 100_000, cacheCreationInputTokens: 0, costUSD: 0.5 } };
  const p = KNOWN_PRICES[lite];
  const want = 10_000 * p.input + 1_000 * p.output + 100_000 * p.cacheRead;
  assert.ok(Math.abs(priceUsage(usage, KNOWN_PRICES).total - want) < 1e-12);
  assert.equal(priceUsage({ 'claude-sonnet-5-5': { inputTokens: 1_000_000, costUSD: 9 } }, KNOWN_PRICES).total, KNOWN_PRICES['anthropic/claude-sonnet-5.5'].input * 1e6, 'an alias id maps to its catalog entry');
  assert.equal(priceUsage({ 'unknown/model': { inputTokens: 5, costUSD: 0.25 } }, KNOWN_PRICES).total, 0.25, 'no price: Claude Code\'s own figure');
});

test('the book records every attempt and climb, and says it per job for the run\'s attributes', () => {
  const book = modelBook({ picks: { qaWrite: fallbackPick('qaWrite', 'small', KNOWN_PRICES)! }, catalog: KNOWN_PRICES }, 'small');
  const first = book.pick('qaWrite');
  book.record({ job: 'qaWrite', label: 'write', model: first.model, tier: first.tier, est: first.est, cost: 0.01, ok: false, seconds: 30 });
  const up = book.climb('qaWrite', 'its probes did not compile or run')!;
  assert.ok(up.tier > first.tier);
  book.record({ job: 'qaWrite', label: 'write#again', model: up.model, tier: up.tier, est: up.est, cost: 0.05, ok: true, seconds: 40 });
  assert.match(book.summary(), /^qaWrite=[^ ]+↑[^ ]+$/);
  assert.equal(book.totals().climbs, 1);
  assert.ok(Math.abs(book.totals().cost - 0.06) < 1e-9);
  assert.equal(book.attempts[1].climbedBecause, 'its probes did not compile or run');
  assert.match(book.table(), /climbed: its probes did not compile or run/);
  assert.equal(book.raise('qaWrite', 1, 'x'), null, 'already above: nothing changes');
  // A job the choice did not name still gets a model: its fallback.
  assert.equal(book.pick('implement').how, 'fallback');
});
