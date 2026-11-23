import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAgent } from '../lib/jobs.ts';

const schema = { type: 'object', required: ['ok', 'summary'] };
const done = (result: any, exit = 0) => ({ state: 'done' as const, exit, result: typeof result === 'string' ? result : JSON.stringify(result), tail: 'tail' });

test('a typed result and its real cost, by model', () => {
  const r = readAgent(done({ structured_output: { ok: true, summary: 's' }, total_cost_usd: 0.12, num_turns: 4, duration_ms: 9000,
    modelUsage: { 'claude-sonnet-5-5': { costUSD: 0.1 }, 'claude-haiku-5-5': { costUSD: 0.02 } } }), schema);
  assert.deepEqual(r.value, { ok: true, summary: 's' });
  assert.equal(r.costUsd, 0.12);
  assert.deepEqual(r.byModel, { 'claude-sonnet-5-5': 0.1, 'claude-haiku-5-5': 0.02 });
});

test('a dead agent never reads as a result: no job, no JSON, an error, or a missing field', () => {
  assert.equal(readAgent(null, schema).value, null);
  assert.equal(readAgent(done('not json', 1), schema).value, null);
  assert.equal(readAgent(done({ is_error: true, result: 'boom', structured_output: { ok: true, summary: 's' } }), schema).value, null);
  const partial = readAgent(done({ structured_output: { ok: true }, total_cost_usd: 0.05 }), schema);
  assert.equal(partial.value, null);
  assert.equal(partial.costUsd, 0.05, 'what it cost still counts');
  assert.match(partial.error!, /summary/);
});

test('an empty AI Gateway stops the run with a plain message, instead of reading as a dead agent', async () => {
  const { OUT_OF_CREDIT } = await import('../lib/jobs.ts');
  assert.throws(() => readAgent(done({ is_error: true, api_error_status: 402, result: 'API Error: 402' }), schema), new RegExp(OUT_OF_CREDIT.slice(0, 20)));
  assert.throws(() => readAgent(done('', 1), schema) && readAgent({ ...done('', 1), tail: 'API Error: 402 Payment Required — insufficient funds' }, schema), /out of credit/);
  assert.equal(readAgent(done({ is_error: true, result: 'tool failed' }), schema).value, null, 'other errors are still a dead agent');
});
