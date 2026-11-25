import { experimental_decide as decide } from 'ai';

/**
 * Which model runs each job — chosen per job by Jev, priced from AI Gateway's
 * live catalog, cheapest-first, and climbed one tier when the cheap one fails.
 *
 * Every agent is Claude Code in the sandbox, and Claude Code reaches models
 * through AI Gateway's /claude-code surface, which routes any gateway model
 * that does tool calls — not only Anthropic's (checked: Haiku 5.5, GPT-6
 * Luna, DeepSeek V4 Flash, GLM 5.3 Flash, Kimi K2.7 Code, Qwen 3.8 Flash,
 * MiniMax M3.1 Flash and GPT-5.4 Nano each ran a tool-using, schema-bound job
 * there). So a job's model is a gateway id, and its cost is ours to compute:
 * Claude Code prices a model it does not know with a guess (`costBasis:
 * unknown`), so the factory prices every run from its token counts and the
 * catalog instead.
 *
 * The choice, per job:
 *   1. Jev reads the ticket (or pull request) and, for each job, estimates the
 *      least capable tier that does it right first time — a distribution over
 *      four tiers, not a single guess.
 *   2. The script picks the starting tier that minimises *expected* cost:
 *      the price of trying it, plus — weighted by Jev's odds that it is not
 *      enough — the price of what failing costs. For a job whose failure
 *      shows (a schema miss, a red gate, a probe that does not compile) that
 *      is the climb to the next tier; for one whose failure is silent (an
 *      auditor that misses a blocker, a skeptic that waves one through) it is
 *      what a miss costs downstream, which is why judgement starts higher.
 *   3. Within the tier, the cheapest vetted model the live catalog still
 *      offers, priced on the job's typical token profile (cache reads
 *      included — a model without prompt caching pays full price for every
 *      turn's re-read).
 * Jev unavailable: each job's default tier for the ticket's size. A failure
 * (no result, red gate, probes that do not run) climbs one tier and is
 * recorded, so the run says which jobs needed which tier.
 */

export const TIERS = ['lite', 'standard', 'strong', 'frontier'] as const;
export type TierName = (typeof TIERS)[number];
export type Tier = 0 | 1 | 2 | 3;
export type Size = 'fast' | 'small' | 'full';
export type Effort = 'low' | 'medium' | 'high';

/** What each tier can be trusted with — Jev's rubric, lowest first. */
export const TIER_RUBRIC: string[] = [
  'lite — a small, fast model: does a job that is fully spelled out — a well-specified change with its unit tests in one or two files, an exact plan turned into Playwright tests, a narrow question about cited lines — but misses what nobody wrote down',
  'standard — a fast, cheap open-weights coding model (DeepSeek V4.1 Flash, GLM 5.3 Flash class): reads a diff and the code around it, finds logic errors against stated criteria, writes a straightforward change or test in one area of the app',
  'strong — a strong coding model: judgement across several files, finds subtle bugs, designs the tests for a business rule',
  'frontier — the strongest model: an ambiguous ticket, business rules with many interacting states, changes to the harness itself, a review that must not miss anything',
];

/**
 * The models each tier may use, vetted to drive Claude Code through AI Gateway
 * (tool calls and the --json-schema result). The live catalog decides which are
 * still offered and what they cost; the cheapest for the job wins its tier.
 *
 * Measured through Claude Code on this repository (2026-11-23; factory/.scratch
 * evals, not committed), three jobs: implement a specified function test-first,
 * write two planned Playwright probes, audit a diff with two planted bugs.
 *   Haiku 5.5            66 s $0.013 ✓ · 33 s $0.009 4/4 · 29 s $0.006 1 of 2 bugs
 *   DeepSeek V4.1 Flash  39 s $0.035 ✓ · 58 s $0.028 4/4 · 30 s $0.014 2 of 2
 *   GLM 5.3 Flash        42 s $0.013 ✓ · 57 s $0.022 4/4 · 28 s $0.009 2 of 2
 *   Sonnet 5.5           32 s $0.126 ✓ · 28 s $0.123 4/4 · 13 s $0.050 2 of 2
 * So lite is Haiku (fastest at mechanical work), and standard is the open-weights
 * flash models, which audited as well as Sonnet at a fifth of the price.
 * Left out: DeepSeek V4 Pro (63 s $0.10, 1 of 2 bugs), GLM 5.3 (121 s $0.15),
 * GPT-6.1 Terra (222 s $0.12), Kimi K2.7 Code (250 s $0.18) — mid-priced models
 * re-read Claude Code's context at cache prices no lower than Sonnet's, so they
 * were slower and barely cheaper; GPT-6 Luna misreported its probe titles;
 * Gemini 3.6 Flash did not finish the audit in 70 s.
 */
export const LADDER: Record<TierName, string[]> = {
  lite: ['anthropic/claude-haiku-5.5'],
  standard: ['deepseek/deepseek-v4.1-flash', 'zai/glm-5.3-flash'],
  strong: ['anthropic/claude-sonnet-5.5'],
  frontier: ['anthropic/claude-opus-5.5'],
};

/** Tokens a typical run of a job reads and writes: uncached input, cache reads, output. */
type Profile = { input: number; cached: number; output: number };
const LIGHT: Profile = { input: 20_000, cached: 150_000, output: 3_000 };
const READ: Profile = { input: 40_000, cached: 600_000, output: 10_000 };
const EDIT: Profile = { input: 60_000, cached: 1_200_000, output: 20_000 };

export type Job =
  | 'spec' | 'planAudit' | 'reviseSpec' | 'implement' | 'fix' | 'audit' | 'browserAudit' | 'skeptic' | 'learn'
  | 'reviewLens' | 'recheck' | 'qaTriage' | 'qaPlan' | 'qaWrite' | 'qaSkeptic' | 'baseSame' | 'respond' | 'testSelect';

export type JobSpec = {
  /** What the job does, for Jev. */
  does: string;
  tokens: Profile;
  /** The tier range the job may use. */
  min: Tier; max: Tier;
  /** Without Jev: the starting tier for a fast, small and full ticket. */
  fallback: Record<Size, Tier>;
  /** A wrong answer passes unnoticed (judgement): what a miss costs downstream, in dollars, instead of a climb. */
  miss?: number;
  effort?: Effort;
  /** What was measured on this repository (factory/.scratch evals, 2026-11-23) — evidence Jev weighs. */
  seen?: string;
  /** What a climb costs beyond the next run, in dollars (time, a sandbox): default CLIMB_USD; a red gate round costs more. */
  climb?: number;  /**
   * A person is waiting on this job, and a weak result is not a visible failure: start at the least tier Jev is
   * at least this sure is enough, when that is above the cheapest-expected one. (respond ran a 13-minute,
   * 105-turn change on a tier Jev gave 30–36%, because starting cheap and climbing was fewer expected dollars.)
   */
  minSure?: number;
};

export const JOBS: Record<Job, JobSpec> = {
  spec: { does: 'reads the ticket and the code it touches, writes a half-page spec: where to change, how each criterion is proved, decisions the ticket left open', tokens: READ, min: 1, max: 3, fallback: { fast: 2, small: 2, full: 3 }, miss: 1, effort: 'medium' },
  planAudit: { does: 'audits a spec it did not write: does every criterion map to a check that fails today, does it contradict a recorded rule', tokens: READ, min: 1, max: 3, fallback: { fast: 2, small: 2, full: 3 }, miss: 0.8, effort: 'medium' },
  reviseSpec: { does: 'revises a spec to resolve confirmed problems', tokens: LIGHT, min: 0, max: 3, fallback: { fast: 1, small: 1, full: 2 } },
  implement: { does: 'implements the spec: a failing test first, then the change, docs kept true — the main coding job', tokens: EDIT, min: 0, max: 3, fallback: { fast: 1, small: 2, full: 3 }, climb: 0.15, seen: 'a lite (Haiku 5.5) and two standard models (DeepSeek V4.1 Flash, GLM 5.3 Flash) each implemented a fully specified function with its unit tests, test first, all hidden checks passing, for $0.01–0.04; a strong one for $0.13; what is not specified they guess' },
  fix: { does: 'fixes confirmed findings or a red gate at their cause, without weakening tests', tokens: EDIT, min: 0, max: 3, fallback: { fast: 1, small: 2, full: 3 }, climb: 0.15 },
  audit: { does: 'an independent auditor reading the diff against the ticket, the spec and the recorded rules for blockers', tokens: READ, min: 1, max: 3, fallback: { fast: 2, small: 2, full: 3 }, miss: 1.5, seen: 'auditing a diff with two planted logic bugs, standard models (DeepSeek V4.1 Flash, GLM 5.3 Flash) found both for about $0.01, as did a strong one for $0.05; a lite one (Haiku 5.5) found one' },
  browserAudit: { does: 'drives the change in a real browser and tries to break it, both viewports', tokens: READ, min: 0, max: 2, fallback: { fast: 1, small: 1, full: 2 }, miss: 0.5 },
  skeptic: { does: 'tries to refute one claimed blocker by opening the cited file and line', tokens: LIGHT, min: 0, max: 2, fallback: { fast: 1, small: 1, full: 2 }, miss: 0.4, effort: 'medium' },
  learn: { does: 'turns what the audits caught into at most two lines of context docs', tokens: LIGHT, min: 0, max: 2, fallback: { fast: 1, small: 1, full: 1 } },
  reviewLens: { does: 'a code reviewer with one lens (criteria, rules, logic, tests, docs) reading the diff of a pull request', tokens: READ, min: 1, max: 3, fallback: { fast: 2, small: 2, full: 3 }, miss: 1, seen: 'auditing a diff with two planted logic bugs, standard models found both for about $0.01, as did a strong one for $0.05; a lite one found one' },
  recheck: { does: 'checks whether one earlier blocker is resolved at the new head by reading the cited lines', tokens: LIGHT, min: 0, max: 2, fallback: { fast: 0, small: 0, full: 1 }, effort: 'low' },
  qaTriage: { does: 'decides whether the tests a pull request adds pin every criterion, or which gaps a browser probe should cover', tokens: LIGHT, min: 0, max: 2, fallback: { fast: 1, small: 1, full: 1 }, effort: 'low' },
  qaPlan: { does: 'plans browser probes of a deployed preview: for each gap, the route, the attendee, the pinned clock, the actions and the expected result', tokens: READ, min: 1, max: 3, fallback: { fast: 2, small: 2, full: 2 }, miss: 0.5, effort: 'medium' },
  qaWrite: { does: 'turns an exact probe plan into Playwright tests, finding selectors in the source — mechanical', tokens: { input: 30_000, cached: 400_000, output: 8_000 }, min: 0, max: 2, fallback: { fast: 0, small: 0, full: 0 }, effort: 'low', seen: 'a lite model (Haiku 5.5) wrote two planned probes that passed on desktop and mobile in 33 s for $0.01; a strong one took 28 s for $0.12' },
  qaSkeptic: { does: 'tries to refute a probe failure as a bug in the change: a wrong selector, a wrong expectation, an unpinned clock', tokens: LIGHT, min: 0, max: 2, fallback: { fast: 1, small: 1, full: 2 }, miss: 0.3, effort: 'medium' },
  baseSame: { does: 'reads a probe and the diff: does the base branch fail it for the same reason, or only because the feature is new', tokens: LIGHT, min: 0, max: 2, fallback: { fast: 0, small: 0, full: 1 }, miss: 0.2, effort: 'low' },
  respond: { does: "makes the change a person asked for on a pull request, and nothing else", tokens: EDIT, min: 1, max: 3, fallback: { fast: 2, small: 2, full: 2 }, minSure: 0.6 },
  // One structured call, no tools: CI's test selector (lib/select.ts). A miss is cheap — the smoke spec always runs,
  // an unsure answer widens the run, and main runs everything — so it starts at the cheapest tier.
  testSelect: { does: "reads a pull request's diff, the coverage map's candidate tests and the list of browser specs, and adds or removes specs with a reason for each — one structured answer, no tools", tokens: { input: 15_000, cached: 0, output: 1_500 }, min: 0, max: 2, fallback: { fast: 0, small: 0, full: 0 }, miss: 0.05, effort: 'low' },
};

/** A climb's delay (another agent run before the job is done), in dollars. */
export const CLIMB_USD = 0.05;

// ── The catalog ──────────────────────────────────────────────────────────────
export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type Catalog = Record<string, Price>;

/**
 * The vetted models' prices per token as last read (2026-11-23), used only
 * when the live catalog cannot be read — a choice is never blocked on it.
 */
export const KNOWN_PRICES: Catalog = {
  'anthropic/claude-haiku-5.5': { input: 1e-7, output: 5e-7, cacheRead: 1e-8, cacheWrite: 1.25e-7 },
  'deepseek/deepseek-v4.1-flash': { input: 3e-7, output: 1.2e-6, cacheRead: 6e-9, cacheWrite: 3e-7 },
  'zai/glm-5.3-flash': { input: 1.5e-7, output: 5e-7, cacheRead: 3e-8, cacheWrite: 1.5e-7 },
  'anthropic/claude-sonnet-5.5': { input: 2e-6, output: 1e-5, cacheRead: 1e-7, cacheWrite: 2.5e-6 },
  'anthropic/claude-opus-5.5': { input: 4e-6, output: 2e-5, cacheRead: 2e-7, cacheWrite: 5e-6 },
};

export function catalogFrom(models: any[]): Catalog {
  const vetted = new Set(Object.values(LADDER).flat());
  const out: Catalog = {};
  for (const m of models || []) {
    if (!vetted.has(m.id) || m.type !== 'language' || !m.pricing || !(m.tags || []).includes('tool-use')) continue;
    const n = (x: any) => (x == null || x === '' ? NaN : Number(x));
    const input = n(m.pricing.input);
    const output = n(m.pricing.output);
    if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
    // No cache price means no caching: every turn re-reads at full price.
    const cacheRead = Number.isFinite(n(m.pricing.input_cache_read)) ? n(m.pricing.input_cache_read) : input;
    const cacheWrite = Number.isFinite(n(m.pricing.input_cache_write)) ? n(m.pricing.input_cache_write) : input;
    out[m.id] = { input, output, cacheRead, cacheWrite };
  }
  return out;
}

export const estimate = (p: Price, t: Profile) => t.input * p.input + t.cached * p.cacheRead + t.output * p.output;

/** The cheapest vetted model of a tier the catalog offers for this job, or null. */
export function modelFor(tier: Tier, job: Job, catalog: Catalog): { model: string; est: number } | null {
  const offered = LADDER[TIERS[tier]].filter((m) => catalog[m]).map((m) => ({ model: m, est: estimate(catalog[m], JOBS[job].tokens) }));
  offered.sort((a, b) => a.est - b.est);
  return offered[0] ?? null;
}

/** The tiers a job may use that the catalog can serve, lowest first. */
export function usableTiers(job: Job, catalog: Catalog): Tier[] {
  const s = JOBS[job];
  const offered: { tier: Tier; est: number }[] = [];
  for (let t = s.min; t <= s.max; t++) {
    const m = modelFor(t as Tier, job, catalog);
    if (m) offered.push({ tier: t as Tier, est: m.est });
  }
  // A tier that costs at least as much as a more capable one is never worth starting at or climbing through
  // (measured: mid-priced models re-read Claude Code's context at higher cache prices than Sonnet's).
  return offered.filter((o, i) => !offered.slice(i + 1).some((h) => h.est <= o.est)).map((o) => o.tier);
}

/**
 * The starting tier with the least expected cost, given p[n] = P(the least
 * tier that does the job right is n). Pure, so it is tested and replayed.
 */
export function cheapestExpected(job: Job, p: number[], catalog: Catalog, floor: Tier = 0): { tier: Tier; expected: number } | null {
  const tiers = usableTiers(job, catalog).filter((t) => t >= floor);
  if (!tiers.length) return null;
  const cost = (t: Tier) => modelFor(t, job, catalog)!.est;
  const miss = JOBS[job].miss;
  let best: { tier: Tier; expected: number } | null = null;
  for (const start of tiers) {
    let e = 0;
    for (let need = 0; need < p.length; need++) {
      if (!p[need]) continue;
      if (need <= start) { e += p[need] * cost(start); continue; }
      if (miss) { e += p[need] * (cost(start) + miss); continue; }
      // Visible failure: climb tier by tier until one is enough (or the top).
      // Up to the first usable tier that is enough (an empty tier is skipped; past the ceiling, the top is the last try).
      const target = tiers.find((t) => t >= need) ?? tiers[tiers.length - 1];
      let c = 0;
      for (const t of tiers.filter((x) => x >= start && x <= target)) c += cost(t) + (t > start ? JOBS[job].climb ?? CLIMB_USD : 0);
      e += p[need] * c;
    }
    if (!best || e < best.expected - 1e-9) best = { tier: start, expected: e };
  }
  return best;
}

// ── The choice ───────────────────────────────────────────────────────────────
export type Pick = {
  job: Job; tier: Tier; model: string; effort?: Effort;
  /** Expected cost of this job at its starting model, from the live price. */
  est: number;
  /** How it was chosen: Jev's odds that this tier is enough, or the fallback. */
  how: 'jev' | 'fallback';
  sure: number | null;
};
export type Picks = Partial<Record<Job, Pick>>;

/** Fallback for one job: its default tier for the size, or the nearest the catalog serves. */
export function fallbackPick(job: Job, size: Size, catalog: Catalog, floor: Tier = 0): Pick | null {
  const tiers = usableTiers(job, catalog).filter((t) => t >= floor);
  if (!tiers.length) return null;
  const want = Math.max(JOBS[job].fallback[size], floor);
  const tier = tiers.find((t) => t >= want) ?? tiers[tiers.length - 1];
  const m = modelFor(tier, job, catalog)!;
  return { job, tier, model: m.model, effort: JOBS[job].effort, est: m.est, how: 'fallback', sure: null };
}

/** From Jev's distribution: the expected-cost minimum; a degenerate answer falls back. */
export function pickFrom(job: Job, p: number[] | null, size: Size, catalog: Catalog, floor: Tier = 0): Pick | null {
  const valid = p && p.length === TIERS.length && p.every((x) => Number.isFinite(x) && x >= 0) && Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 0.02;
  if (!valid) return fallbackPick(job, size, catalog, floor);
  const cheapest = cheapestExpected(job, p!, catalog, floor);
  if (!cheapest) return fallbackPick(job, size, catalog, floor);
  const upTo = (t: Tier) => p!.slice(0, t + 1).reduce((a, b) => a + b, 0);
  const best = { tier: cheapest.tier };
  const need = JOBS[job].minSure;
  if (need !== undefined && upTo(best.tier) < need) {
    const tiers = usableTiers(job, catalog).filter((t) => t >= best.tier);
    best.tier = tiers.find((t) => upTo(t) >= need) ?? tiers[tiers.length - 1];
  }
  const m = modelFor(best.tier, job, catalog)!;
  const sure = upTo(best.tier);
  return { job, tier: best.tier, model: m.model, effort: best.tier === 0 ? 'low' : JOBS[job].effort, est: m.est, how: 'jev', sure };
}

/** One tier up, if the job and the catalog allow it. */
export function climb(pick: Pick, catalog: Catalog): Pick | null {
  const next = usableTiers(pick.job, catalog).find((t) => t > pick.tier);
  if (next === undefined) return null;
  const m = modelFor(next, pick.job, catalog)!;
  return { ...pick, tier: next, model: m.model, effort: JOBS[pick.job].effort, est: m.est };
}

/**
 * Ask Jev, in one call, how capable a model each job needs, given what the run
 * knows (the ticket, its size, the diff's facts). Never throws: unavailable or
 * a malformed answer, each job takes its fallback.
 */
export async function chooseModels(context: string, size: Size, jobs: Job[], floors: Partial<Record<Job, Tier>> = {}) {
  'use step';
  const t0 = Date.now();
  let catalog = await readCatalog().catch(() => null);
  const live = !!catalog && Object.keys(catalog).length > 0;
  if (!live) catalog = KNOWN_PRICES;
  let dist: Record<string, number[] | null> = {};
  let why = '';
  try {
    const d: any = await decide({
      model: 'typesafe-ai/jev',
      ...(process.env.JEV_API_KEY && {
        providerOptions: { gateway: { byok: { 'typesafe-ai': [{ apiKey: process.env.JEV_API_KEY }] } } },
      }),
      state: `${context}`.slice(0, 20_000) + `\n\nThe run's size: ${size}.`,
      questions: Object.fromEntries(jobs.map((j) => [j, {
        type: 'score',
        instructions: `AI agents are building and checking this change in a conference app (React + Express + SQLite), each job run by a model driving Claude Code with a shell. ` +
          `The job: ${JOBS[j].does}.${JOBS[j].seen ? ` Measured on this repository: ${JOBS[j].seen}.` : ''} ` +
          `What is the least capable model that does this job right, first time, for this ticket? Do not pay for capability the job does not use.`,
        criteria: TIER_RUBRIC,
      }])),
    } as any);
    for (const j of jobs) {
      const a = d.answers?.[j];
      const probs = a?.probabilities;
      if (probs && typeof probs === 'object') dist[j] = TIERS.map((_, i) => Number(probs[String(i)] ?? 0));
      else if (typeof a?.score === 'number') dist[j] = TIERS.map((_, i) => (i === Math.round(a.score) ? 1 : 0));
      else dist[j] = null;
    }
  } catch (e: any) {
    why = `Jev was unavailable (${String(e?.message || e).slice(0, 120)})`;
    dist = {};
  }
  const picks: Picks = {};
  for (const j of jobs) {
    const p = pickFrom(j, dist[j] ?? null, size, catalog!, floors[j] ?? 0);
    if (p) picks[j] = p;
  }
  return { picks, catalog: catalog!, live, why, ms: Date.now() - t0, dist };
}
chooseModels.maxRetries = 1;

/** The live catalog, trimmed to the vetted models: what each still costs per token. Public, no key needed. */
async function readCatalog(): Promise<Catalog> {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/models');
  if (!res.ok) throw new Error(`AI Gateway models → ${res.status}`);
  return catalogFrom((await res.json()).data);
}

// ── What a run actually cost ────────────────────────────────────────────────
/** Price Claude Code's per-model token counts from the catalog; Claude Code's own figure where the catalog has no price. */
export function priceUsage(modelUsage: Record<string, any>, catalog: Catalog | null): { total: number; byModel: Record<string, number> } {
  const byModel: Record<string, number> = {};
  let total = 0;
  for (const [m, u] of Object.entries(modelUsage || {})) {
    const id = m.replace(/^claude-code\//, '').replace(/\[1m\]$/, '');
    // Claude Code names an Anthropic model by its alias's id (claude-sonnet-5-5); the catalog, anthropic/claude-sonnet-5.5.
    const p = catalog?.[id] ?? catalog?.[`anthropic/${id.replace(/-(\d+)-(\d+)$/, '-$1.$2')}`];
    const c = p
      ? (u.inputTokens || 0) * p.input + (u.outputTokens || 0) * p.output + (u.cacheReadInputTokens || 0) * p.cacheRead + (u.cacheCreationInputTokens || 0) * p.cacheWrite
      : (u.costUSD || 0);
    byModel[short(id)] = (byModel[short(id)] || 0) + c;
    total += c;
  }
  return { total, byModel };
}

/** A model's name for a log line: `anthropic/claude-sonnet-5.5` → `sonnet-5.5`. */
export const short = (m: string) => m.replace(/^[^/]+\//, '').replace(/^claude-/, '');

const whyOf = (p: Pick) => `${TIERS[p.tier]}${p.how === 'jev' && p.sure !== null ? `, Jev ${Math.round(p.sure * 100)}%` : p.how === 'fallback' ? ', fallback' : ''}`;

/** One line for the log: what a pick is and why. */
export const describe = (p: Pick) => `${short(p.model)} (${whyOf(p)}, est $${p.est.toFixed(3)})`;

// ── A run's models: what each job runs on, what it cost, and every climb ────
export type Attempt = { job: Job; label: string; model: string; tier: Tier; est: number; cost: number; ok: boolean; seconds: number; climbedBecause?: string };
export type Choice = { picks: Picks; catalog: Catalog; live?: boolean; why?: string; ms?: number };

/**
 * Held by a workflow (no Node API, no clock: it is replayed): the current pick
 * per job, the climbs, and what each attempt cost against what was expected.
 */
/** What a person reads for each job in the progress comment. */
export const JOB_LABEL: Partial<Record<Job, string>> = {
  spec: 'Spec', planAudit: 'Plan audit', reviseSpec: 'Revise spec', implement: 'Implement', fix: 'Fix', audit: 'Audit',
  browserAudit: 'Browser audit', skeptic: 'Skeptic', learn: 'Learn', reviewLens: 'Review lens', recheck: 'Recheck',
  qaTriage: 'QA triage', qaPlan: 'QA plan', qaWrite: 'QA probe writer', qaSkeptic: 'QA skeptic', baseSame: 'Base comparison', respond: 'Respond',
};

export function modelBook(choice: Choice, size: Size) {
  let catalog = choice.catalog;
  const picks: Picks = { ...choice.picks };
  const attempts: Attempt[] = [];
  const climbs: { job: Job; from: string; to: string; why: string }[] = [];
  const pending = new Map<Job, string>();

  const pick = (job: Job): Pick => {
    if (!picks[job]) picks[job] = fallbackPick(job, size, catalog) ?? fallbackPick(job, size, KNOWN_PRICES)!;
    return picks[job]!;
  };
  const move = (job: Job, to: Pick | null, why: string) => {
    const from = pick(job);
    if (!to || to.tier <= from.tier) return null;
    picks[job] = to;
    climbs.push({ job, from: from.model, to: to.model, why });
    pending.set(job, why);
    return to;
  };
  return {
    pick,
    get catalog() { return catalog; },
    /** Take a fresh choice (the run was sized after its plan) for the jobs it names; climbs already made stand. */
    adopt(next: Choice) {
      catalog = next.catalog;
      for (const [j, p] of Object.entries(next.picks) as [Job, Pick][]) if (!picks[j] || p.tier >= picks[j]!.tier) picks[j] = p;
    },
    /** One tier up, after a failure the run could see. Null at the job's ceiling. */
    climb: (job: Job, why: string) => move(job, climb(pick(job), catalog), why),
    /** At least this tier (a risky diff, a red gate after a cheaper builder). */
    raise(job: Job, tier: number, why: string) {
      let p: Pick | null = pick(job);
      while (p && p.tier < tier) { const up = climb(p, catalog); if (!up) break; p = up; }
      return p && p.tier > pick(job).tier ? move(job, p, why) : null;
    },
    /** What the phase step needs to price and explain an agent's run in the progress stream. */
    meta: (p: Pick) => JSON.stringify({ model: p.model, why: whyOf(p), est: p.est, price: catalog[p.model] ? { [p.model]: catalog[p.model] } : {} }),
    record(a: Omit<Attempt, 'climbedBecause'>) {
      const why = pending.get(a.job);
      attempts.push({ ...a, ...(why ? { climbedBecause: why } : {}) });
      pending.set(a.job, '');
    },
    attempts,
    climbs,
    /** For the run's attributes: job=model per job, ↑ marking a climb — searchable across runs. */
    summary() {
      const byJob = new Map<string, string[]>();
      for (const a of attempts) {
        const seen = byJob.get(a.job) ?? [];
        if (seen[seen.length - 1] !== short(a.model)) seen.push(short(a.model));
        byJob.set(a.job, seen);
      }
      return [...byJob.entries()].map(([j, ms]) => `${j}=${ms.join('↑')}`).join(' ');
    },
    totals: () => ({ est: attempts.reduce((s, a) => s + a.est, 0), cost: attempts.reduce((s, a) => s + a.cost, 0), climbs: climbs.length }),
    /**
     * A markdown table for a comment: every job the run planned, from the moment
     * the models are chosen — the model, its tier and how sure Jev was, the
     * expected cost, and once it has run what it cost and how often.
     */
    table() {
      const ran = new Map<Job, Attempt[]>();
      for (const a of attempts) ran.set(a.job, [...(ran.get(a.job) ?? []), a]);
      const jobs = [...new Set<Job>([...(Object.keys(picks) as Job[]), ...ran.keys()])];
      if (!jobs.length) return '';
      const usd = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
      // Time: how long the job's agents have run so far — filled in as each one finishes.
      const took = (sec: number) => (sec < 60 ? `${Math.round(sec)} s` : `${Math.floor(sec / 60)} min ${String(Math.round(sec % 60)).padStart(2, '0')} s`);
      return `| Job | Model | Tier | Jev | Est. | Actual | Time |\n| --- | --- | --- | ---: | ---: | ---: | ---: |\n` +
        jobs.map((j) => {
          const as = ran.get(j) ?? [];
          const p = picks[j];
          const models = as.length ? as.map((a) => short(a.model)).filter((m, i, x) => x.indexOf(m) === i).join(' → ') : p ? short(p.model) : '';
          const climbed = as.find((a) => a.climbedBecause)?.climbedBecause;
          const failed = as.filter((a) => !a.ok).length;
          const tier = p ? TIERS[p.tier] : '';
          const jev = p?.how === 'jev' && p.sure !== null ? `${Math.round(p.sure * 100)}%` : p?.how === 'fallback' ? 'default' : '';
          const est = as.length ? as.reduce((s, a) => s + a.est, 0) : p?.est ?? 0;
          const actual = as.length ? `${usd(as.reduce((s, a) => s + a.cost, 0))}${as.length > 1 ? ` · ${as.length} runs` : ''}${failed ? ` · ${failed} failed` : ''}` : '—';
          return `| ${JOB_LABEL[j] ?? j} | \`${models}\`${climbed ? ` ↑ <sub>${climbed}</sub>` : ''} | ${tier} | ${jev} | ${usd(est)} | ${actual} | ${as.length ? took(as.reduce((t, a) => t + (a.seconds || 0), 0)) : '—'} |`;
        }).join('\n');
    },
  };
}
export type ModelBook = ReturnType<typeof modelBook>;
