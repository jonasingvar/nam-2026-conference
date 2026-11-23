import { sleep } from 'workflow';
import type { JobPoll } from './sandbox-steps';
import { phaseFor } from './phases';

/**
 * Workflow-level helpers (no directive: they run inside the workflow and call
 * steps). A job is started once and then polled across durable sleeps, so a
 * ten-minute agent costs the platform nothing while it thinks, and a crash —
 * of the function, the deployment or the sandbox — loses at most that job.
 */
export type Done = Extract<JobPoll, { state: 'done' }>;

export async function runJob(sandbox: string, id: string, files: Record<string, string>, script: string): Promise<Done | null> {
  // The step it runs under is named for its phase (the label's first word): the trace reads spec, implement, gate…
  const phase = phaseFor(id.replace(/^\d+-/, ''));
  // A job is `lost` when its sandbox stopped under it (timeout, restart): the
  // disk is back, the process is not. Start it again, twice at most.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const jid = attempt === 1 ? id : `${id}~${attempt}`;
    for (let waits = 0; waits < 60; waits++) {
      const r = await phase(sandbox, jid, files, script);
      if (r.state === 'done') return r;
      if (r.state === 'lost') break;
      await sleep('10s');
    }
  }
  return null;
}

/** An AI Gateway model id (`anthropic/claude-haiku-5.5`, `moonshotai/kimi-k2.7-code`…): Claude Code drives any of them through the gateway. */
export type Model = string;
export type Effort = 'low' | 'medium' | 'high';

export type AgentRun = {
  value: any | null; costUsd: number; byModel: Record<string, number>; turns: number; seconds: number; error?: string; said?: string;
  /** Claude Code's per-model token counts, for pricing from the gateway's catalog. */
  usage: Record<string, any>;
};

/** The bash that runs one headless Claude Code agent with a typed result. */
export function agentScript(model: Model, effort?: Effort) {
  if (!/^[a-z0-9][a-z0-9._/:-]*$/i.test(model)) throw new Error(`not a model id: ${model}`);
  return [
    'set -o pipefail',
    `timeout 2400 claude -p "$(cat "$JOB/prompt.md")" --model '${model}'${effort ? ` --effort ${effort}` : ''} \\`,
    '  --dangerously-skip-permissions --no-session-persistence \\',
    '  --output-format json --json-schema "$(cat "$JOB/schema.json")" > "$JOB/result.json"',
  ].join('\n');
}

/** The one failure no retry fixes: the AI Gateway has no credit left. Every run stops and says so. */
export const OUT_OF_CREDIT = 'AI Gateway is out of credit — top up in Vercel → AI Gateway → Credits, then try again';
export const outOfCredit = (text: string) => /\b402\b|insufficient (funds|credit)|out of credit|credit balance|payment required/i.test(text);

/** Read Claude Code's JSON result: the structured output, and what it cost. */
export function readAgent(done: Done | null, schema: any): AgentRun {
  if (!done) return { value: null, costUsd: 0, byModel: {}, turns: 0, seconds: 0, usage: {}, error: 'the job never finished' };
  let r: any;
  try { r = JSON.parse(done.result); } catch {
    if (outOfCredit(done.tail)) throw new Error(OUT_OF_CREDIT);
    return { value: null, costUsd: 0, byModel: {}, turns: 0, seconds: done.seconds ?? 0, usage: {}, error: `no result (exit ${done.exit}): ${done.tail.slice(-300)}` };
  }
  if (r.api_error_status === 402 || (r.is_error && outOfCredit(String(r.result ?? '')))) throw new Error(OUT_OF_CREDIT);
  const byModel: Record<string, number> = {};
  for (const [m, u] of Object.entries<any>(r.modelUsage || {})) byModel[m] = (byModel[m] || 0) + (u.costUSD || 0);
  const said = typeof r.result === 'string' ? r.result.replace(/\s+/g, ' ').trim().slice(0, 600) : undefined;
  const base = { costUsd: r.total_cost_usd || 0, byModel, turns: r.num_turns || 0, seconds: Math.round((r.duration_ms || 0) / 1000), said, usage: r.modelUsage || {} };
  const v = r.structured_output;
  const missing = (schema.required || []).filter((k: string) => v == null || !(k in v));
  if (r.is_error || v == null || missing.length) {
    return { ...base, value: null, error: r.is_error ? `agent error: ${String(r.result || r.subtype).slice(0, 300)}` : `result missing ${missing.join(', ') || 'everything'}` };
  }
  return { ...base, value: v };
}
