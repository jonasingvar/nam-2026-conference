import { sleep } from 'workflow';
import { pollJob, startJob, type JobPoll } from './sandbox-steps';

/**
 * Workflow-level helpers (no directive: they run inside the workflow and call
 * steps). A job is started once and then polled across durable sleeps, so a
 * ten-minute agent costs the platform nothing while it thinks, and a crash —
 * of the function, the deployment or the sandbox — loses at most that job.
 */
export type Done = Extract<JobPoll, { state: 'done' }>;

export async function runJob(sandbox: string, id: string, files: Record<string, string>, script: string): Promise<Done | null> {
  // A job is `lost` when its sandbox stopped under it (timeout, restart): the
  // disk is back, the process is not. Start it again, twice at most.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const jid = attempt === 1 ? id : `${id}~${attempt}`;
    await startJob(sandbox, jid, files, script);
    for (let polls = 0; polls < 200; polls++) {
      const r = await pollJob(sandbox, jid);
      if (r.state === 'done') return r;
      if (r.state === 'lost') break;
      await sleep('20s');
    }
  }
  return null;
}

export type Model = 'opus' | 'sonnet' | 'haiku';
export type Effort = 'low' | 'medium' | 'high';

export type AgentCall = { label: string; model: Model; effort?: Effort; schema: object };
export type AgentRun = { value: any | null; costUsd: number; byModel: Record<string, number>; turns: number; seconds: number; error?: string };

/** The bash that runs one headless Claude Code agent with a typed result. */
export function agentScript(model: Model, effort?: Effort) {
  return [
    'set -o pipefail',
    `timeout 2400 claude -p "$(cat "$JOB/prompt.md")" --model ${model}${effort ? ` --effort ${effort}` : ''} \\`,
    '  --dangerously-skip-permissions --no-session-persistence \\',
    '  --output-format json --json-schema "$(cat "$JOB/schema.json")" > "$JOB/result.json"',
  ].join('\n');
}

/** Read Claude Code's JSON result: the structured output, and what it cost. */
export function readAgent(done: Done | null, schema: any): AgentRun {
  if (!done) return { value: null, costUsd: 0, byModel: {}, turns: 0, seconds: 0, error: 'the job never finished' };
  let r: any;
  try { r = JSON.parse(done.result); } catch {
    return { value: null, costUsd: 0, byModel: {}, turns: 0, seconds: 0, error: `no result (exit ${done.exit}): ${done.tail.slice(-300)}` };
  }
  const byModel: Record<string, number> = {};
  for (const [m, u] of Object.entries<any>(r.modelUsage || {})) byModel[m] = (byModel[m] || 0) + (u.costUSD || 0);
  const base = { costUsd: r.total_cost_usd || 0, byModel, turns: r.num_turns || 0, seconds: Math.round((r.duration_ms || 0) / 1000) };
  const v = r.structured_output;
  const missing = (schema.required || []).filter((k: string) => v == null || !(k in v));
  if (r.is_error || v == null || missing.length) {
    return { ...base, value: null, error: r.is_error ? `agent error: ${String(r.result || r.subtype).slice(0, 300)}` : `result missing ${missing.join(', ') || 'everything'}` };
  }
  return { ...base, value: v };
}
