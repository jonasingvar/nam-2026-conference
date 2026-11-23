import { experimental_decide as decide } from 'ai';
import type { Issue } from './github-steps';

export type Size = 'fast' | 'small' | 'full';
export type Triage = { size: Size | 'sized'; picked: Size | null; sure: number | null; why: string; ms: number };

/**
 * How much loop a ticket gets, decided by Jev (typesafe-ai/jev, a decision
 * model on AI Gateway, ~0.3 s) before any agent starts. A label still wins:
 * `ship:full` or `ship:fast` on the issue is a person's call. When Jev is
 * under 60% sure, the run is `sized`: ship's own setup reports facts about
 * the change and the script sizes it from them, as on GitHub Actions.
 */
export const SIZES: Record<Size, string> = {
  fast: 'A small, well-understood change where a person is waiting: copy or wording, a label, styling, one component, a page that only shows data the API already returns.',
  small: 'A contained fix or feature in one area of the app that touches no business rule and no stored data: a new filter, a new page section, an empty state, a validation message.',
  full: 'Changes a business rule (seats, the waitlist, clashes, check-in, ratings, the conference clock), the database schema or seed, an API contract several pages use, or the harness itself (.claude/, .github/, scripts/).',
};

export async function triageIssue(issue: Issue): Promise<Triage> {
  'use step';
  if (issue.labels.includes('ship:full')) return { size: 'full', picked: 'full', sure: 1, why: 'labelled ship:full', ms: 0 };
  if (issue.labels.includes('ship:fast')) return { size: 'fast', picked: 'fast', sure: 1, why: 'labelled ship:fast', ms: 0 };
  const t0 = Date.now();
  try {
    const d = await decide({
      model: 'typesafe-ai/jev',
      ...(process.env.JEV_API_KEY && {
        providerOptions: { gateway: { byok: { 'typesafe-ai': [{ apiKey: process.env.JEV_API_KEY }] } } },
      }),
      state: `GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body}`.slice(0, 8000),
      questions: {
        size: {
          type: 'choice',
          instructions: 'This ticket is about to be built by AI agents in a conference app (React + Express + SQLite). How much verification does it need?',
          criteria: SIZES,
        },
      },
    } as any);
    const answer = (d as any).answers.size;
    const picked = answer.choice as Size;
    const sure: number | null = answer.probabilities?.[picked] ?? null;
    const ms = Date.now() - t0;
    if (sure !== null && sure < 0.6) {
      return { size: 'sized', picked, sure, why: `Jev leaned ${picked} but was only ${Math.round(sure * 100)}% sure, so setup sizes it from the code`, ms };
    }
    return { size: picked, picked, sure, why: `Jev: ${picked}${sure !== null ? ` (${Math.round(sure * 100)}% sure)` : ''}`, ms };
  } catch (e: any) {
    return { size: 'sized', picked: null, sure: null, why: `Jev was unavailable (${String(e?.message || e).slice(0, 120)}), so setup sizes it`, ms: Date.now() - t0 };
  }
}
triageIssue.maxRetries = 1;

/**
 * Has a person answered what a hand-back left open? Jev reads the open
 * questions and everything people have said since, and estimates P(yes) that
 * the replies settle every one of them — so "thanks, looking" or an answer to
 * one of two questions does not restart a run. Unavailable: assume answered
 * (a person did reply, and the run can hand back again).
 */
export async function judgeAnswers(open: string, said: { who: string; where: string; text: string }[]) {
  'use step';
  const t0 = Date.now();
  try {
    const d = await decide({
      model: 'typesafe-ai/jev',
      ...(process.env.JEV_API_KEY && {
        providerOptions: { gateway: { byok: { 'typesafe-ai': [{ apiKey: process.env.JEV_API_KEY }] } } },
      }),
      state: `What the automated build stopped on and asked a person:\n${open}\n\nWhat people have replied since, newest last:\n` +
        said.map((c) => `- ${c.who} on ${c.where}: ${c.text}`).join('\n'),
      questions: {
        answered: {
          type: 'boolean',
          instructions: 'Do the replies settle every open question, so the build can continue without asking again?',
          criteria: { true: 'Every open question has a decision or the information it needed.', false: 'At least one open question has no answer yet, or the replies only acknowledge it.' },
        },
      },
    } as any);
    const p: number = (d as any).answers.answered.probability ?? ((d as any).answers.answered.value ? 1 : 0);
    return { answered: p >= 0.6, probability: p, ms: Date.now() - t0 };
  } catch (e: any) {
    return { answered: true, probability: null as number | null, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 160) };
  }
}
judgeAnswers.maxRetries = 1;
