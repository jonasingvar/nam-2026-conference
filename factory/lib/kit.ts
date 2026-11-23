import { agentScript, readAgent, runJob, type Effort, type Model } from './jobs';
import { ALLOWED_REPO, REPO_DIR } from './constants';

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

export function kit(box: string, task: string) {
  let seq = 0;
  const lines: string[] = [];
  const spend = { total: 0, agents: 0, byModel: {} as Record<string, number>, byPhase: {} as Record<string, number> };
  let phase = 'start';

  const preamble =
    `You are one step of the ORBIT factory: ${task} in ${ALLOWED_REPO}. You run headless in a Vercel Sandbox, in ${REPO_DIR}. ` +
    `git and gh are authenticated by the network itself — never look for, print or set a token. The network reaches GitHub, npm, ` +
    `AI Gateway and the app's fonts only. Chromium is installed; never run \`npx playwright install\`. CLAUDE.md is the specification for ` +
    `this repo and its rules hold. Each turn re-reads your whole context, so batch reads into one Bash command (\`; echo ---;\`). ` +
    `Start from \`node scripts/context.mjs index\`: pick the one or two docs in context/engineering-context/ for the area, read them by the ` +
    `piece (\`node scripts/context.mjs show <doc> Gotchas <part>\`), and take their word for how the app fits together — open source only for ` +
    `the lines you will change or must verify. When you are done, your final answer is the structured result; nothing else you write is read.\n\n`;

  const id = (label: string) => `${String(++seq).padStart(3, '0')}-${label.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
  const log = (s: string) => { lines.push(s); console.log(`${box} ${s}`); };
  const dollars = (x: number) => `$${x.toFixed(2)}`;

  async function agent(label: string, prompt: string, schema: any, model: Model, effort?: Effort): Promise<any | null> {
    const done = await runJob(box, id(label), { 'prompt.md': preamble + prompt, 'schema.json': JSON.stringify(schema) }, agentScript(model, effort));
    const r = readAgent(done, schema);
    spend.total += r.costUsd;
    spend.agents += 1;
    spend.byPhase[phase] = (spend.byPhase[phase] || 0) + r.costUsd;
    for (const [m, c] of Object.entries(r.byModel)) spend.byModel[m] = (spend.byModel[m] || 0) + c;
    log(`${label}: ${r.value ? 'done' : `no result — ${r.error}`} (${model}, ${r.turns} turns, ${r.seconds}s, ${dollars(r.costUsd)})`);
    return r.value;
  }

  /** A shell job whose script writes $JOB/result.json; that JSON, or null. */
  async function command(label: string, script: string): Promise<any | null> {
    const done = await runJob(box, id(label), {}, script);
    if (!done) { log(`${label}: the job never finished`); return null; }
    try { return JSON.parse(done.result); } catch { log(`${label}: unreadable result (exit ${done.exit}) ${done.tail.slice(-200)}`); return null; }
  }

  const spendLine = () =>
    `${dollars(spend.total)} over ${spend.agents} agent run${spend.agents === 1 ? '' : 's'}` +
    (Object.keys(spend.byModel).length ? ` (${Object.entries(spend.byModel).map(([m, c]) => `${m.replace(/^claude-/, '')} ${dollars(c)}`).join(', ')})` : '');

  return { agent, command, log, lines, spend, spendLine, dollars, setPhase: (p: string) => { phase = p; } };
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
  return [
    `git fetch -q --prune origin`,
    `git checkout -q -B "${head}" "origin/${head}"`,
    `{ [ "$(sha256sum package-lock.json | cut -c1-16)" = "$(cat /vercel/.factory/prepared)" ] || { npm ci --no-audit --no-fund >/dev/null 2>&1 && sha256sum package-lock.json | cut -c1-16 > /vercel/.factory/prepared; }; }`,
    `echo "{\\"head\\":\\"$(git rev-parse HEAD)\\",\\"base\\":\\"$(git rev-parse origin/${base})\\"}" > "$JOB/result.json"`,
  ].join(' && ');
}
