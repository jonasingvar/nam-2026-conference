import { start } from 'workflow/api';
import { HookConflictError } from 'workflow/errors';
import { ship, type ShipInput } from '@/workflows/ship';
import { review } from '@/workflows/review';
import { qa } from '@/workflows/qa';
import { shots } from '@/workflows/shots';
import { respond, type RespondInput } from '@/workflows/respond';
import { verify, type VerifyInput } from '@/workflows/verify';
import { warm } from '@/workflows/warm';
import { ALLOWED_REPO } from './constants';

/**
 * Start a run — once. Each run holds a token for as long as it lives, so a
 * second label, a double-click or a redelivered webhook is told which run
 * already has it instead of starting another.
 */
async function once<A extends unknown[]>(wf: (...a: A) => Promise<unknown>, args: A, token: string) {
  try {
    const run = await start(wf as any, args as any, { experimental_hook: { token } } as any);
    return { started: true, runId: run.runId as string };
  } catch (e) {
    if (!HookConflictError.is(e)) throw e;
    return { started: false, runId: (e as any).conflictingRunId as string, reason: 'already running' };
  }
}

export const startShip = (input: ShipInput) => once(ship, [input], `ship:${ALLOWED_REPO}#${input.issue}`);

/** Review, QA and screenshots together — what a pull request gets when it opens, or on `/review`. */
export async function startChecks(pr: number, sha: string) {
  const [r, q, s] = await Promise.all([
    once(review, [{ pr }], `review:${ALLOWED_REPO}#${pr}@${sha}`),
    once(qa, [{ pr }], `qa:${ALLOWED_REPO}#${pr}@${sha}`),
    startShots(pr, sha),
  ]);
  return { review: r, qa: q, shots: s };
}

export const startShots = (pr: number, sha: string) => once(shots, [{ pr }], `shots:${ALLOWED_REPO}#${pr}@${sha}`);

export const startRespond = (input: RespondInput, commentId: number) =>
  once(respond, [input], `respond:${ALLOWED_REPO}#${input.pr}:${commentId}`);

export const startVerify = (input: VerifyInput) => once(verify, [input], `verify:${ALLOWED_REPO}@${input.sha}`);
export const startWarm = (ref: string, sha: string) => once(warm, [{ ref }], `warm:${ALLOWED_REPO}@${sha}`);
