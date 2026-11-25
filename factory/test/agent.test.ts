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

import { agentScript, eventLines } from '../lib/jobs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EVENTS = [
  { type: 'system', subtype: 'init' },
  { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hm' }, { type: 'text', text: 'I will read\nthe page first.' }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/pages/HomePage.jsx' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: '1\timport React\n2\t…' }] }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'exit 1' }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'StructuredOutput', input: { changed: true } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: 'Structured output provided successfully' }] } },
  { type: 'result', subtype: 'success', is_error: false, structured_output: { changed: true }, total_cost_usd: 0.01, num_turns: 4, modelUsage: {} },
].map((e) => JSON.stringify(e)).join('\n');

test('an agent\'s events read like a terminal: what it said, each tool, what came back — no thinking, no bookkeeping', () => {
  assert.deepEqual(eventLines(EVENTS, 'change'), [
    '[change] 💬 I will read the page first.',
    '[change] Read src/pages/HomePage.jsx',
    '[change]   ↳ 1 import React 2 …',
    '[change] $ npm test',
    '[change]   ↳ ✖ exit 1',
  ]);
  // A line cut short on the way out of the sandbox still names its tool.
  assert.deepEqual(eventLines('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"src/a.js","content":"aaaa'), ['Write src/a.js …']);
  // A long shell command cut short reads as a command, with the JSON's own escapes undone.
  assert.deepEqual(eventLines('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"cd /repo; cat > a.md <<\'EOF\'\\n# Title\\nsays \\"hi\\"'), ["$ cd /repo; cat > a.md <<'EOF' # Title says \"hi\" …"]);
  assert.deepEqual(eventLines('not json\n\n'), []);
});

test('the agent script leaves the final result event in result.json, as --output-format json did, and keeps the agent\'s exit code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'job-'));
  writeFileSync(join(dir, 'prompt.md'), 'p'); writeFileSync(join(dir, 'schema.json'), '{}');
  // A stand-in for the CLI: prints the events, exits 3.
  writeFileSync(join(dir, 'claude'), `#!/bin/sh\ncat "$JOB/fake.jsonl"\nexit 3\n`, { mode: 0o755 });
  writeFileSync(join(dir, 'timeout'), `#!/bin/sh\nshift\nexec "$@"\n`, { mode: 0o755 });
  writeFileSync(join(dir, 'fake.jsonl'), EVENTS + '\n');
  let code = 0;
  try { execFileSync('bash', ['-c', agentScript('anthropic/claude-haiku-5.5')], { env: { ...process.env, JOB: dir, PATH: `${dir}:${process.env.PATH}` }, stdio: 'ignore' }); } catch (e: any) { code = e.status; }
  assert.equal(code, 3);
  const r = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
  assert.equal(r.type, 'result');
  assert.deepEqual(r.structured_output, { changed: true });
  assert.ok(readFileSync(join(dir, 'events.jsonl'), 'utf8').includes('"tool_use"'));
});
