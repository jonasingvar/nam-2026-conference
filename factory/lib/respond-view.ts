import type { Intent } from './intent';

/**
 * respond's progress card: one comment on the pull request, rewritten as the
 * run moves, so the person who asked sees that it was heard, how it was read
 * (Jev's reading of a plain comment, and how sure), which model took it and
 * why, where it is, and what it has cost — instead of a bare "On it".
 */
export const RESPOND_PHASES = ['Read', 'Change', 'Gate', 'Push', 'Reply'] as const;
export type RespondPhase = (typeof RESPOND_PHASES)[number];
/** In every card: what the hourly cap on plain pickups counts (`tooManyPickups`). */
export const RESPOND_MARK = '<!-- factory-respond -->';

export type RespondView = {
  /** The phase running now; null once the run is over. */
  phase: RespondPhase | null;
  /** What the phase is doing, when its name does not say (a fix round inside Gate). */
  doing?: string;
  /** How it ended, once it has. */
  outcome?: 'changed' | 'answered' | 'failed';
  ask: string; author: string; issue?: number;
  /** Jev's reading of a plain comment; absent for `/fix` and `@claude`, which are not classified. */
  read?: { intent: Intent; sure: number | null };
  /** The model for the change, as `describe()` gives it. */
  model?: string;
  /** The models table, once a model has run. */
  table?: string;
  /** The pull request is a draft because of this run: it cannot be merged. */
  held?: boolean;
  gate?: string; spend?: string; time?: string; runUrl: string;
};

const READ_AS: Record<Intent, string> = { change: 'a change to make', question: 'a question to answer', none: 'not a request' };

export function readLine(read: RespondView['read']): string {
  if (!read) return 'an explicit request (`/fix` or `@claude`) — not classified';
  return `${READ_AS[read.intent]} — Jev${read.sure === null ? '' : `, ${Math.round(read.sure * 100)}% sure`}`;
}

/** The ask as a quote: its first lines, never long enough to bury the card. */
export function quoted(ask: string): string {
  const text = ask.trim().replace(/<!--[\s\S]*?-->/g, '');
  const cut = text.length > 400 ? `${text.slice(0, 400).trimEnd()}…` : text;
  return cut.split('\n').slice(0, 6).map((l) => `> ${l}`).join('\n');
}

export function respondCard(v: RespondView): string {
  const at = v.phase ? RESPOND_PHASES.indexOf(v.phase) : RESPOND_PHASES.length;
  // A question is answered without a gate; a run that failed stops where it was.
  const skipped = (p: RespondPhase) => (p === 'Gate' || p === 'Push') && v.outcome === 'answered';
  const path = RESPOND_PHASES.map((p, i) => skipped(p) ? `<s>${p}</s>` : i < at ? `✅ ${p}` : i === at ? `**⏳ ${p}**` : p).join(' → ');
  const headline = v.outcome === 'changed' ? 'Changed and pushed' : v.outcome === 'answered' ? 'Answered' : v.outcome === 'failed' ? 'Could not finish' : `Working on it · ${v.doing ?? v.phase}`;
  return [
    `### 🏭 Factory · ${headline}`,
    '',
    v.outcome === 'failed' ? '' : path,
    '',
    quoted(v.ask),
    '',
    `**Asked by:** ${v.author}${v.issue ? ` on #${v.issue}` : ''}`,
    `**Read as:** ${readLine(v.read)}`,
    v.held ? (v.outcome ? '**Pull request:** left as a draft — the gate is red on what was pushed, so it cannot be merged as it is' : '**Pull request:** a draft while this runs, so it cannot be merged under the change; ready again when it is done') : '',
    v.model ? `**Model:** ${v.model}` : '',
    v.gate ? `**Gate:** ${v.gate}` : '',
    v.spend ? `**AI spend:** ${v.spend}` : '',
    v.time ? `**Time:** ${v.time}` : '',
    v.table ? `\n<details><summary>Models — which job ran on what, and what it cost</summary>\n\n${v.table}\n\n<sub>Picked by Jev from AI Gateway's live catalog: the cheapest tier likely to be enough.</sub>\n</details>` : '',
    '',
    `<sub>[run](${v.runUrl})${v.outcome ? ' · the reply is the next comment' : ''}</sub>`,
    RESPOND_MARK,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
