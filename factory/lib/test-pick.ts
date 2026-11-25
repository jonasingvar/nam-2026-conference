import { experimental_decide as decide } from 'ai';

/**
 * Which browser tests a change needs, decided by Jev (typesafe-ai/jev on AI
 * Gateway, well under a second) — not "everything it might reach".
 *
 * Each spec file in tests/ is one vertical of the app (home, seats, schedule,
 * …). Jev reads what was asked, the files changed and the diff, and answers
 * one yes/no per vertical — must these tests run again to trust this change —
 * and one for the whole: can a browser test see this change at all. The
 * factory then runs only the verticals Jev picked (`pickSpecs`), and no
 * browser test when Jev is sure none could tell. The unit and API tests
 * always run: they take seconds. Main runs everything after a merge.
 */
export type Vertical = { spec: string; titles: string[]; /** Coverage on main saw these tests execute a changed file. */ ranChanged?: boolean };
export type JevPick = {
  /** P(a browser test can observe this change); null when Jev did not answer. */
  browser: number | null;
  /** spec → P(it must run). */
  specs: Record<string, number>;
  ms: number; error?: string;
};

/** At or above this, a vertical runs. */
export const NEEDS = 0.5;
/** At or below this P(browser), with no vertical picked, no browser test runs at all. */
export const NO_BROWSER = 0.2;

const short = (spec: string) => spec.replace(/^tests\//, '');

export function pickPrompt(o: { about: string; files: string[]; diff: string }) {
  return (`A small, targeted change to a conference web app (React pages in src/, an Express API in server/, Playwright browser tests in tests/*.spec.js, ` +
    `unit and API tests in tests/unit and tests/api). The unit and API tests always run. Decide which browser tests must run again.\n\n` +
    `What was asked: ${o.about.slice(0, 1500)}\n\nFiles changed:\n${o.files.slice(0, 60).map((f) => `- ${f}`).join('\n')}\n\nDiff:\n${o.diff.slice(0, 9000)}`).slice(0, 12000);
}

/** Ask Jev. Never throws: no answer is `browser: null`, and the caller falls back. */
export async function jevPicksTests(o: { about: string; files: string[]; diff: string; verticals: Vertical[] }): Promise<JevPick> {
  const t0 = Date.now();
  if (!o.verticals.length) return { browser: null, specs: {}, ms: 0, error: 'no specs listed' };
  try {
    const questions: Record<string, unknown> = {
      browser: {
        type: 'boolean',
        instructions: 'Could this change alter anything a browser test of the app can observe?',
        criteria: {
          true: 'It changes a page, a component, styling, client state, or server behaviour or data that a page shows.',
          false: 'It changes only docs, comments, tests, tooling, or server internals whose behaviour the unit and API tests cover and no page shows differently.',
        },
      },
    };
    o.verticals.forEach((v, i) => {
      questions[`s${i}`] = {
        type: 'boolean',
        instructions: `Must the browser tests in ${short(v.spec)} run again to trust this change?`,
        criteria: {
          true: `The change touches the page, component, rule or data these tests exercise${v.ranChanged ? ' (coverage shows they execute a changed file)' : ''}: ${v.titles.slice(0, 12).join('; ').slice(0, 600)}`,
          false: 'These tests exercise parts of the app this change does not affect, or only pass through the changed code on the way to something else.',
        },
      };
    });
    const d = await decide({
      model: 'typesafe-ai/jev',
      ...(process.env.JEV_API_KEY && { providerOptions: { gateway: { byok: { 'typesafe-ai': [{ apiKey: process.env.JEV_API_KEY }] } } } }),
      state: pickPrompt(o),
      questions,
    } as any);
    const a = (d as any).answers;
    const p = (x: any): number => x?.probability ?? (x?.value ? 1 : 0);
    return { browser: p(a.browser), specs: Object.fromEntries(o.verticals.map((v, i) => [v.spec, p(a[`s${i}`])])), ms: Date.now() - t0 };
  } catch (e: any) {
    return { browser: null, specs: {}, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 160) };
  }
}

export type Picked = { mode: 'none' | 'picked' | 'fallback'; specs: string[]; why: string };

/**
 * Jev's answers → the verticals to run. `own`: the specs the change itself
 * edited, which always run. No answer, or a browser-visible change with no
 * vertical picked, is `fallback`: the caller runs its smoke set.
 */
export function pickSpecs(pick: JevPick | null, own: string[]): Picked {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  if (!pick || pick.browser === null) return { mode: 'fallback', specs: own, why: `Jev did not answer${pick?.error ? ` (${pick.error})` : ''} — the change's own specs and smoke` };
  const chosen = Object.entries(pick.specs).filter(([, p]) => p >= NEEDS).sort((a, b) => b[1] - a[1]);
  const specs = [...new Set([...own, ...chosen.map(([s]) => s)])];
  const named = chosen.slice(0, 4).map(([s, p]) => `${short(s)} ${pct(p)}`).join(', ');
  if (specs.length) return { mode: 'picked', specs, why: `Jev picked ${named || 'none beyond the change\'s own specs'}` };
  if (pick.browser <= NO_BROWSER) return { mode: 'none', specs: [], why: `Jev: no browser test can see this change (${pct(1 - pick.browser)} sure)` };
  return { mode: 'fallback', specs: [], why: `Jev picked no vertical but a browser may see the change (${pct(pick.browser)}) — smoke` };
}
