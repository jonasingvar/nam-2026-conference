import { TEST_MAP_IN_SANDBOX } from './constants';
import type { Project, Selection } from './select';

/**
 * Workflow-level helpers (no directive) for running a selection: the script
 * that gathers a diff's facts, the script one shard runs, and the two shards
 * side by side — desktop in one sandbox (with npm test), mobile in another —
 * so a full run's wall clock is the slower half, not the sum. Verify and
 * ship's gate both use them.
 */

const sq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/**
 * `node scripts/test-map.mjs facts` → `facts` in $JOB/result.json, beside
 * whatever `extra` (JSON in the EXTRA env var) the caller adds. No facts (an
 * older commit without the script) is null, and null widens the run.
 */
export function factsScript(base: string) {
  return [
    `[ -f scripts/test-map.mjs ] && node scripts/test-map.mjs facts origin/${base} ${TEST_MAP_IN_SANDBOX} 2>"$JOB/facts.err" | tail -1 > "$JOB/facts.json"`,
    `node -e 'const fs=require("fs"),e=process.env;let f=null;try{f=JSON.parse(fs.readFileSync(e.JOB+"/facts.json","utf8"))}catch{}` +
      `fs.writeFileSync(e.JOB+"/result.json",JSON.stringify({...JSON.parse(e.EXTRA||"{}"),facts:f}))'`,
  ].join('\n');
}

/**
 * One shard: gate.mjs on one project with exactly these Playwright arguments
 * (null: its whole suite), npm test only where `unit`, then — when `red` is
 * set and the shard is green — `scripts/red-check.mjs` with that RED_SCOPE.
 * A commit whose gate.mjs predates shards runs its whole gate on desktop and
 * nothing on mobile.
 */
export function shardScript(o: { project: Project; args: string[] | null; unit: boolean; base: string; red?: 'unit' | 'all' | null }) {
  const env = [
    `GATE_BASE=origin/${o.base}`,
    `GATE_PROJECT=${o.project}`,
    o.unit ? '' : 'GATE_UNIT=skip',
    o.args ? `GATE_SPECS=${sq(o.args.join(' ') || 'none')}` : '',
  ].filter(Boolean).join(' ');
  return [
    `GATE=""; RED=""`,
    `if grep -q GATE_SPECS scripts/gate.mjs; then GATE=$(${env} node scripts/gate.mjs 2>"$JOB/gate.err" | tail -1)`,
    `elif [ ${o.project} = desktop ]; then GATE=$(GATE_BASE=origin/${o.base} node scripts/gate.mjs 2>"$JOB/gate.err" | tail -1)`,
    `else GATE='{"skippedOldGate":true}'; fi`,
    o.red ? `case "$GATE" in *'"ok":true'*) RED=$(${o.red === 'unit' ? 'RED_SCOPE=unit ' : ''}GATE_BASE=origin/${o.base} node scripts/red-check.mjs 2>"$JOB/red.err" | tail -1);; esac` : '',
    `GATE="$GATE" RED="$RED" node -e 'const e=process.env;require("fs").writeFileSync(e.JOB+"/result.json",JSON.stringify({gate:e.GATE,red:e.RED}))'`,
  ].filter(Boolean).join('\n');
}

export type ShardOut = { gate: any | null; red: string; skipped?: boolean };
/** A shard with nothing to run: green, and nothing counted. */
const SKIPPED = { ok: true, skipped: true, unit: { passed: 0, failed: 0 }, browser: { passed: 0, failed: [], flaky: 0, flakyTests: [], skipped: 0 }, tampered: [], unitSkipped: true };

/** gate.mjs's line → its JSON, or null when it is not one. */
export function parseGateLine(line: string | undefined): any | null {
  try {
    const g = JSON.parse(line || '');
    if (g?.skippedOldGate) return SKIPPED;
    return typeof g?.ok === 'boolean' && g.browser && g.unit ? g : null;
  } catch { return null; }
}

/**
 * Both shards at once. `run` starts a job in that project's sandbox (its own
 * label: `desktop…` / `mobile…`, the trace's runDesktop / runMobile) and
 * returns its result.json. A project with nothing to run is not started.
 */
export async function runShards(sel: Selection, o: {
  base: string; full: boolean; red?: 'unit' | 'all' | null; tag?: string;
  /** npm test on the desktop shard (default); false when an earlier gate at this code already ran it green. */
  unit?: boolean;
  run: (p: Project, label: string, script: string) => Promise<any | null>;
}): Promise<Record<Project, ShardOut>> {
  const one = async (p: Project): Promise<ShardOut> => {
    const args = o.full ? null : sel.args[p];
    const unit = p === 'desktop' && o.unit !== false;
    if (args && !args.length && !unit) return { gate: SKIPPED, red: '', skipped: true };
    const r = await o.run(p, `${p}${o.tag ?? ''}`, shardScript({ project: p, args, unit, base: o.base, red: unit ? o.red : null }));
    return { gate: parseGateLine(r?.gate), red: String(r?.red ?? '') };
  };
  const [desktop, mobile] = await Promise.all([one('desktop'), one('mobile')]);
  return { desktop, mobile };
}
