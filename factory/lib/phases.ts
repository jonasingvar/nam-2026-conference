import { advance, type JobPoll } from './sandbox-steps';

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
export async function probePreview(s: string, id: string, f: Record<string, string>, c: string) {
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
probePreview.maxRetries = 5;
reproduce.maxRetries = 5;
reproduceOnBase.maxRetries = 5;
cleanUp.maxRetries = 5;
makeChange.maxRetries = 5;
job.maxRetries = 5;

/** Which named step a job runs under, from its label's first word. */
export function phaseFor(label: string): Phase {
  // Labels arrive as job ids, their separators made safe: audit:combined#3 → audit_combined_3.
  const head = label.split(/[_:#~]/)[0];
  const table: Record<string, Phase> = {
    branch: makeBranch, plan: spec, 'plan-audit': planAudit, 'revise-spec': reviseSpec, build: implement,
    gate, audit: codeAudit, skeptic, fix, learn, push: pushBranch,
    checkout, facts: measureDiff, recheck: recheckBlocker, lens: reviewLens,
    triage: qaTriage, probe: probePreview, again: reproduce, base: reproduceOnBase, clean: cleanUp, change: makeChange,
  };
  return table[head] ?? job;
}
