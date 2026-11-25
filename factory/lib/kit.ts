import { agentScript, readAgent, runJob, type AgentRun } from './jobs';
import { ALLOWED_REPO, REPO_DIR } from './constants';
import { describe, priceUsage, short, TIERS, type Job, type ModelBook, type Pick } from './models';

/**
 * Run one agent on the model its job is booked to, priced from the gateway's
 * catalog. No result (a schema miss, a dead agent) climbs one tier and runs it
 * again — once — and the book records both, so the run shows which jobs needed
 * which tier. Shared by ship and the workflows that use `kit`.
 */
export async function routedAgent(o: {
  box: string; jobId: (label: string) => string; book: ModelBook; job: Job; label: string; prompt: string; schema: any;
  log: (s: string) => void; onRun: (r: AgentRun, cost: { total: number; byModel: Record<string, number> }, p: Pick) => void;
}): Promise<{ value: any | null; pick: Pick }> {
  let p = o.book.pick(o.job);
  for (let attempt = 0; ; attempt++) {
    const label = attempt ? `${o.label}#up` : o.label;
    const done = await runJob(o.box, o.jobId(label),
      { 'prompt.md': o.prompt, 'schema.json': JSON.stringify(o.schema), 'meta.json': o.book.meta(p) }, agentScript(p.model, p.effort));
    const r = readAgent(done, o.schema);
    // Claude Code prices a model it does not know with a guess; the catalog's price is the real one.
    const priced = Object.keys(r.usage).length ? priceUsage(r.usage, o.book.catalog) : { total: r.costUsd, byModel: r.byModel };
    o.book.record({ job: o.job, label, model: p.model, tier: p.tier, est: p.est, cost: priced.total, ok: !!r.value, seconds: r.seconds });
    o.onRun(r, priced, p);
    o.log(`${label}: ${r.value ? 'done' : `no result — ${r.error}`} — ${short(p.model)} (${TIERS[p.tier]}), ${r.turns} turns, ${r.seconds}s, ` +
      `$${priced.total.toFixed(3)} (est $${p.est.toFixed(3)})`);
    if (r.value || attempt >= 1) return { value: r.value, pick: p };
    // Parallel agents of one job (review lenses, reader audits) share the book: if a sibling's failure already
    // moved the job up, follow it instead of climbing again — one round of failures is one tier.
    const current = o.book.pick(o.job);
    const up = current.tier > p.tier ? current : o.book.climb(o.job, `${o.label} returned no result`);
    if (!up) return { value: null, pick: p };
    o.log(`${o.label}: climbing to ${describe(up)}`);
    p = up;
  }
}

/**
 * What every factory workflow does the same way: run an agent or a command in
 * its sandbox, count what it cost, and keep a log. Created inside a workflow
 * (it calls steps, so it is not a step itself). Job ids come from a counter,
 * so a replay asks for the same jobs in the same order.
 */
export type Finding = {
  severity: 'blocker' | 'minor'; category: string; file: string; line?: number;
  claim: string; evidence: string; fix: string; also?: { category: string; claim: string; evidence: string }[];
};

export function kit(box: string, task: string, mode: 'read' | 'push' = 'push') {
  let seq = 0;
  const lines: string[] = [];
  // `seconds`: every agent's own running time, added up (agents side by side each count).
  const spend = { total: 0, agents: 0, seconds: 0, byModel: {} as Record<string, number>, byPhase: {} as Record<string, number> };
  let phase = 'start';

  const preamble =
    `You are one step of the ORBIT factory: ${task} in ${ALLOWED_REPO}. You run headless in a Vercel Sandbox, in ${REPO_DIR}. ` +
    (mode === 'push'
      ? `git and gh are authenticated by the network itself — never look for, print or set a token. `
      : `You hold no GitHub credential: read with git (the repository is public), not gh — everything you need from the ticket and the pull request is in this prompt. `) +
    `The network reaches GitHub, npm, ` +
    `AI Gateway and the app's fonts only. Chromium is installed; never run \`npx playwright install\`. CLAUDE.md is the specification for ` +
    `this repo and its rules hold. Each turn re-reads your whole context, so batch reads into one Bash command (\`; echo ---;\`). ` +
    `Start from \`node scripts/context.mjs index\`: pick the one or two docs in context/engineering-context/ for the area, read them by the ` +
    `piece (\`node scripts/context.mjs show <doc> Gotchas <part>\`), and take their word for how the app fits together — open source only for ` +
    `the lines you will change or must verify. When you are done, your final answer is the structured result; nothing else you write is read.\n\n`;

  const id = (label: string) => `${String(++seq).padStart(3, '0')}-${label.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
  const log = (s: string) => { lines.push(s); console.log(`${box} ${s}`); };
  const dollars = (x: number) => `$${x.toFixed(2)}`;

  let book: ModelBook | null = null;
  /** An agent for a job, on the model the book gives it (its result was streamed by the phase step that ran it). */
  async function agent(label: string, prompt: string, schema: any, job: Job): Promise<any | null> {
    if (!book) throw new Error('kit: no models chosen yet (useModels)');
    const { value } = await routedAgent({
      box, jobId: id, book, job, label, prompt: preamble + prompt, schema, log,
      onRun: (r, cost) => {
        spend.total += cost.total;
        spend.agents += 1;
        spend.seconds += r.seconds || 0;
        spend.byPhase[phase] = (spend.byPhase[phase] || 0) + cost.total;
        for (const [m, c] of Object.entries(cost.byModel)) spend.byModel[m] = (spend.byModel[m] || 0) + c;
      },
    });
    return value;
  }

  /** A shell job whose script writes $JOB/result.json; that JSON, or null. */
  async function command(label: string, script: string): Promise<any | null> {
    const done = await runJob(box, id(label), {}, script);
    if (!done) { log(`${label}: the job never finished`); return null; }
    if (done.seconds !== undefined) log(`${label}: ${done.seconds}s`);
    try { return JSON.parse(done.result); } catch { log(`${label}: unreadable result (exit ${done.exit}) ${done.tail.slice(-200)}`); return null; }
  }

  const spendLine = () =>
    `${dollars(spend.total)} over ${spend.agents} agent run${spend.agents === 1 ? '' : 's'}` +
    (Object.keys(spend.byModel).length ? ` (${Object.entries(spend.byModel).map(([m, c]) => `${m.replace(/^claude-/, '')} ${dollars(c)}`).join(', ')})` : '');

  return {
    agent, command, log, lines, spend, spendLine, dollars, setPhase: (p: string) => { phase = p; },
    /** The models this run's agents use (chooseModels, then modelBook). */
    useModels: (b: ModelBook) => { book = b; },
    get models() { return book; },
  };
}

// ── Findings, shared by ship and review ────────────────────────────────────
export const findingKey = (f: Finding) => `${f.category}|${f.file}|${f.line ? Math.floor(f.line / 10) : f.claim.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60)}`;
const where = (f: Finding) => `${f.file}|${f.line ? f.line : f.claim.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
export const sameWhere = (a: Finding, b: Finding) => where(a) === where(b);

/** One problem, one finding: readings of the same line are grouped, never dropped. */
export function dedupe(fs: Finding[]): Finding[] {
  const m = new Map<string, Finding>();
  for (const f of fs) {
    const k = where(f);
    const g = m.get(k);
    if (!g) { m.set(k, { ...f, also: [...(f.also || [])] }); continue; }
    for (const r of [f, ...(f.also || [])]) if (g.claim !== r.claim && !g.also!.some((a) => a.claim === r.claim)) g.also!.push({ category: r.category, claim: r.claim, evidence: r.evidence });
  }
  return [...m.values()];
}

export const listFindings = (fs: Finding[]) => fs.map((f, i) =>
  `${i + 1}. [${f.category}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.claim}\n   evidence: ${f.evidence}\n   fix: ${f.fix}` +
  (f.also?.length ? f.also.map((a) => `\n   also, [${a.category}]: ${a.claim} — ${a.evidence}`).join('') : '')).join('\n');

/** The checkout a review, QA or respond run works on: the pull request's head, with its base fetched. */
export function checkoutPr(pr: number, head: string, base: string) {
  // A fork's branch name is its author's to choose, and a git ref may hold `$(…)`: single-quoted, the shell never reads it.
  const sq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
  const n = Number(pr);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`not a pull request number: ${pr}`);
  return [
    // pull/<n>/head is the pull request's head on GitHub, whether its branch lives here or in a fork.
    `git fetch -q --prune origin && git fetch -q origin "+refs/pull/${n}/head:refs/remotes/origin/pr-${n}"`,
    `git checkout -q -B ${sq(head)} "origin/pr-${n}"`,
    // A branch of this repository pushes back to itself (respond); a fork's has no upstream here.
    `{ ! git rev-parse -q --verify ${sq(`refs/remotes/origin/${head}`)} >/dev/null || git branch -q --set-upstream-to=${sq(`origin/${head}`)}; }`,
    `{ [ "$(sha256sum package-lock.json | cut -c1-16)" = "$(cat /vercel/.factory/prepared)" ] || { npm ci --no-audit --no-fund >/dev/null 2>&1 && sha256sum package-lock.json | cut -c1-16 > /vercel/.factory/prepared; }; }`,
    `echo "{\\"head\\":\\"$(git rev-parse HEAD)\\",\\"base\\":\\"$(git rev-parse ${sq(`origin/${base}`)})\\"}" > "$JOB/result.json"`,
  ].join(' && ');
}
