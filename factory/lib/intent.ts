import { experimental_decide as decide } from 'ai';

/**
 * What a person's plain comment wants from the factory, read by Jev
 * (typesafe-ai/jev on AI Gateway, ~0.3 s) so nobody has to learn a command:
 * a comment on a ticket whose pull request is open, or on the pull request
 * itself, that asks for a change or asks a question goes to `respond`;
 * anything else is left for people. `/fix …` still works and skips the question.
 */
export type Intent = 'change' | 'question' | 'none';

export const INTENTS: Record<Intent, string> = {
  change: 'Wants the change in this pull request to be different: a complaint about how it looks or behaves, a bug in it, something to add, remove, rename, restyle or fix.',
  question: 'Asks something about this pull request that needs an answer and no code: why it was done this way, how it works, whether a case is covered.',
  none: 'Neither: thanks or approval, an acknowledgement, a note to another person, a decision to merge or close, a remark about something other than this pull request.',
};

/** Under this, the factory does not act on its own reading of a comment. */
export const SURE_ENOUGH = 0.6;

/** `/fix …` or `@claude …`: the request, without the command — or null when the comment has neither. */
export function explicitAsk(body: string): string | null {
  const re = /(^|\s)(\/fix|@claude)\b/gi;
  return re.test(body) ? body.replace(/(^|\s)(\/fix|@claude)\b/gi, ' ').replace(/[ \t]{2,}/g, ' ').trim() : null;
}

/** Whether the factory should pick a comment up, given how Jev read it. Unsure, or unavailable, is no. */
export const actsOn = (intent: Intent | null, sure: number | null) => (intent === 'change' || intent === 'question') && sure !== null && sure >= SURE_ENOUGH;

/** How many plain comments the factory will pick up on one pull request in an hour, counted by its own "On it" replies. */
export const MAX_PICKUPS_AN_HOUR = 5;
export const tooManyPickups = (recentComments: string[]) => recentComments.filter((b) => b.startsWith('👀 On it')).length >= MAX_PICKUPS_AN_HOUR;

export async function readIntent(comment: string, about: { pr: number; title: string; where: 'issue' | 'pull request' }): Promise<{ intent: Intent | null; sure: number | null; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const d = await decide({
      model: 'typesafe-ai/jev',
      ...(process.env.JEV_API_KEY && {
        providerOptions: { gateway: { byok: { 'typesafe-ai': [{ apiKey: process.env.JEV_API_KEY }] } } },
      }),
      state: `Pull request #${about.pr} "${about.title}" was built by an automated software factory and is open, waiting for a person to review and merge it. ` +
        `A person who can merge it wrote this comment on the ${about.where}:\n\n${comment}`.slice(0, 6000),
      questions: {
        intent: {
          type: 'choice',
          instructions: 'What does this comment ask of the software factory that built the pull request?',
          criteria: INTENTS,
        },
      },
    } as any);
    const answer = (d as any).answers.intent;
    const intent = answer.choice as Intent;
    return { intent, sure: answer.probabilities?.[intent] ?? null, ms: Date.now() - t0 };
  } catch (e: any) {
    return { intent: null, sure: null, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 160) };
  }
}
