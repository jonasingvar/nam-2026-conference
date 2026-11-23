import { Sandbox, Snapshot } from '@vercel/sandbox';
import { getWritable } from 'workflow';
import { AGENT_ENV, lockedPolicy, type Mode } from './policy';
import { ALLOWED_REPO, REPO_DIR } from './constants';
import { priceUsage, short, type Catalog } from './models';

/**
 * The durable steps that touch a ticket's sandbox.
 *
 * Every long piece of work — an agent, the gate — runs *detached* inside the
 * sandbox and leaves its result in a job directory: `pid` while it runs,
 * `exit` when it ends, plus whatever files it writes. No step ever waits on
 * one for long, so no function runs anywhere near its time limit; the
 * workflow polls between durable `sleep()`s instead.
 *
 * The sandbox is persistent: when it times out (45 minutes on Hobby) or
 * dies, its disk is kept, and the next step that touches it resumes it. A job
 * that was running then is gone — `pollJob` says `lost`, and the workflow
 * starts that one job again. Everything before it comes from the workflow's
 * event log, never re-run.
 */
const ROOT = '/vercel/.factory';

const secrets = () => {
  const githubToken = process.env.GITHUB_TOKEN;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (!githubToken || !gatewayKey) throw new Error('GITHUB_TOKEN and AI_GATEWAY_API_KEY must be set on the factory');
  return { githubToken, gatewayKey, previewBypass: process.env.PREVIEW_BYPASS_SECRET };
};

/** The preview hosts a sandbox may reach, remembered on its disk so every job start re-applies them. */
const HOSTS = `/vercel/.factory/preview-hosts`;
/** The sandbox's mode, kept on its disk so a resumed sandbox can never come back with more than it had. */
const MODE = `/vercel/.factory/mode`;
async function policyFor(sb: Sandbox) {
  const r = await sh(sb, `cat ${HOSTS} 2>/dev/null || true; echo "::mode=$(cat ${MODE} 2>/dev/null || echo none)"`);
  const mode = (/::mode=(none|read|push)/.exec(r.out)?.[1] ?? 'none') as Mode;
  return lockedPolicy(secrets(), r.out.split('\n').map((h) => h.trim()).filter((h) => h && !h.startsWith('::mode')), mode);
}

/** Let a sandbox reach these preview deployments (and only these), with the protection bypass injected. */
export async function allowPreviews(name: string, urls: string[]) {
  'use step';
  const sb = await Sandbox.get({ name });
  const hosts = urls.map((u) => new URL(u).host).filter((h) => /\.vercel\.app$/.test(h));
  await sh(sb, `mkdir -p /vercel/.factory && printf '%s\\n' ${hosts.map((h) => `'${h}'`).join(' ')} >> ${HOSTS}`);
  await sb.updateNetworkPolicy(await policyFor(sb));
  return hosts;
}

async function sh(sb: Sandbox, cmd: string, env: Record<string, string> = {}) {
  const r = await sb.runCommand({ cmd: 'bash', args: ['-lc', cmd], env });
  return { code: r.exitCode, out: (await r.stdout()).trim(), err: (await r.stderr()).trim() };
}

const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/**
 * Snapshot storage is limited (Hobby: it ran out after one afternoon of runs that
 * crashed before cleaning up). A run's sandbox keeps one snapshot — enough to
 * resume — and it expires in a day, so a forgotten sandbox stops costing storage.
 * The warm one keeps one, with no expiry: every run forks it.
 */
const RUN_SNAPSHOTS = { snapshotExpiration: 24 * 60 * 60_000, keepLastSnapshots: { count: 1, expiration: 24 * 60 * 60_000 } };
const WARM_SNAPSHOTS = { keepLastSnapshots: { count: 1, expiration: 0 } };

/** The warm sandbox every run forks: the repository checked out, installed, with Chromium. */
export const WARM = 'orbit-warm';

/** Everything a fresh machine needs before an agent can work in it. Runs with the open internet. */
const INSTALL = [
  'set -e',
  `mkdir -p ${ROOT}`,
  `cd ${REPO_DIR}`,
  'git config user.name "orbit-factory"',
  'git config user.email "jonasingvar@users.noreply.github.com"',
  // The sandbox's clone tracks no branches: without this, origin/main does not exist.
  'git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"',
  'git fetch --unshallow --quiet origin 2>/dev/null || true',
  'git fetch --prune --quiet origin',
  'npm ci --no-audit --no-fund',
  'npx playwright install --with-deps chromium',
  // Claude Code reads .claude/settings.json only in a trusted workspace.
  `node -e 'const f=process.env.HOME+"/.claude.json";const fs=require("fs");const j=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};j.projects??={};j.projects["${REPO_DIR}"]={...(j.projects["${REPO_DIR}"]||{}),hasTrustDialogAccepted:true};fs.writeFileSync(f,JSON.stringify(j))'`,
  `sha256sum package-lock.json | cut -c1-16 > ${ROOT}/prepared`,
].join(' && ');

/**
 * (Re)build the warm sandbox from origin/<ref>: install everything, lock the
 * network, stop it — stopping a persistent sandbox snapshots its disk, which
 * is what every run forks. Refreshed on each push to main and daily.
 */
export async function refreshWarm(ref = 'main') {
  'use step';
  const t0 = Date.now();
  const sb = await Sandbox.getOrCreate({
    name: WARM,
    source: { type: 'git', url: `https://github.com/${ALLOWED_REPO}.git`, revision: ref },
    resources: { vcpus: 4 },
    timeout: 20 * 60_000,
    ...WARM_SNAPSHOTS,
  });
  await sb.updateNetworkPolicy('allow-all');
  const ready = await sh(sb, `test -f ${ROOT}/prepared && echo yes || echo no`);
  const r = ready.out === 'yes'
    ? await sh(sb, `set -e; cd ${REPO_DIR}; git fetch --prune --quiet origin; git checkout -q -B warm origin/${ref}; ` +
        `if [ "$(sha256sum package-lock.json | cut -c1-16)" != "$(cat ${ROOT}/prepared)" ]; then npm ci --no-audit --no-fund; npx playwright install --with-deps chromium; sha256sum package-lock.json | cut -c1-16 > ${ROOT}/prepared; fi; ` +
        `rm -rf ${ROOT}/[0-9]* ${HOSTS} ${MODE}`)
    : await sh(sb, `${INSTALL} && cd ${REPO_DIR} && git checkout -q -B warm origin/${ref}`);
  if (r.code !== 0) throw new Error(`warming failed (${r.code}): ${(r.err || r.out).slice(-800)}`);
  await sb.updateNetworkPolicy(lockedPolicy(secrets(), [], 'none'));
  await sb.stop();
  return { ref, seconds: Math.round((Date.now() - t0) / 1000) };
}
refreshWarm.maxRetries = 1;

/**
 * The run's own sandbox: a fork of the warm one (its disk, installed and
 * ready, in seconds), brought to `ref` — the branch a ship run starts from, or
 * the exact commit a review, QA or verify run checks (a branch name or a sha).
 * It installs what *that* commit locks, and only if it differs from what is
 * installed. Falls back to a fresh install when there is no warm sandbox yet,
 * and resumes the sandbox if it already exists (a retried step, a replay).
 */
export async function prepareSandbox(name: string, ref: string, mode: Mode) {
  'use step';
  const t0 = Date.now();
  let sb: Sandbox;
  let how = 'resumed';
  try {
    sb = await Sandbox.get({ name });
  } catch {
    try {
      sb = await Sandbox.fork({ sourceSandbox: WARM, name, resources: { vcpus: 4 }, timeout: 45 * 60_000, ...RUN_SNAPSHOTS });
      how = 'forked';
    } catch {
      sb = await Sandbox.create({
        name,
        source: { type: 'git', url: `https://github.com/${ALLOWED_REPO}.git`, revision: /^[0-9a-f]{40}$/.test(ref) ? undefined : ref },
        resources: { vcpus: 4 },
        timeout: 45 * 60_000,
        ...RUN_SNAPSHOTS,
      });
      how = 'created';
    }
  }
  const prepared = await sh(sb, `test -f ${ROOT}/prepared && echo yes || echo no`);
  await sb.updateNetworkPolicy('allow-all');
  const target = /^[0-9a-f]{40}$/.test(ref) ? ref : `origin/${ref}`;
  const r = prepared.out === 'yes'
    // Warm: only what changed since the warm sandbox was made.
    ? await sh(sb, `set -e; cd ${REPO_DIR}; git fetch --prune --quiet origin; git fetch --quiet origin ${ref} 2>/dev/null || true; git checkout -q --detach ${target}; ` +
        `if [ "$(sha256sum package-lock.json | cut -c1-16)" != "$(cat ${ROOT}/prepared)" ]; then npm ci --no-audit --no-fund; sha256sum package-lock.json | cut -c1-16 > ${ROOT}/prepared; fi`)
    : await sh(sb, `${INSTALL} && cd ${REPO_DIR} && git checkout -q --detach ${target} && ` +
        `{ [ "$(sha256sum package-lock.json | cut -c1-16)" = "$(cat ${ROOT}/prepared)" ] || { npm ci --no-audit --no-fund && sha256sum package-lock.json | cut -c1-16 > ${ROOT}/prepared; }; }`);
  if (r.code !== 0) throw new Error(`preparing the sandbox failed (${r.code}): ${(r.err || r.out).slice(-800)}`);
  // Written once, before any agent runs; a fork of the warm sandbox starts at none.
  await sh(sb, `mkdir -p /vercel/.factory && echo ${mode} > ${MODE}`);
  await sb.updateNetworkPolicy(await policyFor(sb));
  return { name: sb.name, how, mode, seconds: Math.round((Date.now() - t0) / 1000) };
}
prepareSandbox.maxRetries = 2;

/**
 * Start a job if it is not running yet, then wait up to two minutes for it.
 * Not a step itself: the named steps in phases.ts call it, so the trace shows
 * which phase was waiting. Safe to repeat — a started job is never restarted.
 */
export async function advance(name: string, id: string, files: Record<string, string>, script: string): Promise<JobPoll> {
  await startJobImpl(name, id, files, script);
  const r = await pollJobImpl(name, id, 120_000);
  // The run's Streams tab, written by the phase step itself (no extra span): what this job did and how
  // long it took, and — for an agent — its model, why that model, turns, and its cost priced from the
  // gateway's catalog (Claude Code only guesses the price of a model that is not Anthropic's).
  if (r.state === 'done') {
    try {
      const w = getWritable<string>({ namespace: 'progress' }).getWriter();
      try { await w.write(streamLine(id, r, files['meta.json']) + '\n'); } finally { w.releaseLock(); }
    } catch { /* the log never fails the work */ }
  }
  return r;
}

/** One line for the progress stream: a command's exit and seconds, or an agent's model, pick, turns, seconds and priced cost. */
export function streamLine(id: string, r: Extract<JobPoll, { state: 'done' }>, metaJson?: string) {
  const label = id.replace(/^\d+-/, '');
  let line = `${label}: exit ${r.exit}${r.seconds !== undefined ? ` · ${r.seconds}s` : ''}`;
  try {
    const j = JSON.parse(r.result);
    if (j && typeof j.total_cost_usd === 'number') {
      const meta: { model?: string; why?: string; est?: number; price?: Catalog } = metaJson ? JSON.parse(metaJson) : {};
      const cost = priceUsage(j.modelUsage || {}, meta.price ?? null);
      const models = Object.keys(cost.byModel).join('+') || (meta.model ? short(meta.model) : '?');
      line = `${label}: ${j.is_error || !j.structured_output ? 'no result' : 'done'} · ${models}${meta.why ? ` (${meta.why})` : ''} · ${j.num_turns} turns · ` +
        `${Math.round((j.duration_ms || 0) / 1000)}s · $${cost.total.toFixed(3)}${typeof meta.est === 'number' ? ` (est $${meta.est.toFixed(3)})` : ''}` +
        (typeof j.result === 'string' && j.result.trim() ? `\n    ↳ ${j.result.replace(/\s+/g, ' ').trim().slice(0, 600)}` : '');
    }
  } catch { /* a command's result, not an agent's */ }
  return line;
}

/**
 * Start one job, detached. Safe to repeat: a job that already started (this
 * step retried after starting it) is left alone.
 */
export async function startJob(name: string, id: string, files: Record<string, string>, script: string) {
  'use step';
  return startJobImpl(name, id, files, script);
}

async function startJobImpl(name: string, id: string, files: Record<string, string>, script: string) {
  const sb = await Sandbox.get({ name });
  // Re-applied on every start: a resumed sandbox must never come back open.
  await sb.updateNetworkPolicy(await policyFor(sb));
  try { await sb.extendTimeout(15 * 60_000); } catch { /* at the plan's ceiling: the sandbox will stop, and resume */ }
  const dir = `${ROOT}/${id}`;
  const state = await sh(sb, `if [ -f ${dir}/exit ]; then echo done; elif [ -f ${dir}/pid ] && kill -0 "$(cat ${dir}/pid)" 2>/dev/null; then echo running; else echo none; fi`);
  if (state.out !== 'none') return { started: false, state: state.out };
  await sh(sb, `rm -rf ${dir} && mkdir -p ${dir}`);
  await sb.writeFiles([
    ...Object.entries(files).map(([file, content]) => ({ path: `${dir}/${file}`, content: Buffer.from(content) })),
    { path: `${dir}/run.sh`, content: Buffer.from(script) },
  ]);
  await sb.runCommand({
    cmd: 'bash',
    // started/ended bracket the job, so a command's seconds are known too (an agent reports its own).
    args: ['-c', `cd ${REPO_DIR} && echo $$ > ${dir}/pid && date +%s > ${dir}/started && JOB=${dir} bash ${dir}/run.sh > ${dir}/out.log 2>&1; rc=$?; date +%s > ${dir}/ended; echo $rc > ${dir}/exit`],
    env: { ...AGENT_ENV, JOB: dir },
    detached: true,
  });
  return { started: true, state: 'running' };
}
startJob.maxRetries = 3;

export type JobPoll =
  | { state: 'running' }
  | { state: 'lost' }
  | { state: 'done'; exit: number; result: string; tail: string; seconds?: number };

/** Wait up to ~40 s for a job to end; say how it stands. */
export async function pollJob(name: string, id: string): Promise<JobPoll> {
  'use step';
  return pollJobImpl(name, id, 40_000);
}

async function pollJobImpl(name: string, id: string, waitMs: number): Promise<JobPoll> {
  const sb = await Sandbox.get({ name });
  const dir = `${ROOT}/${id}`;
  const until = Date.now() + waitMs;
  for (;;) {
    const s = await sh(sb, `if [ -f ${dir}/exit ]; then echo "done $(cat ${dir}/exit) $(( $(cat ${dir}/ended 2>/dev/null || echo 0) - $(cat ${dir}/started 2>/dev/null || echo 0) ))"; elif [ -f ${dir}/pid ] && kill -0 "$(cat ${dir}/pid)" 2>/dev/null; then echo running; else echo lost; fi`);
    if (s.out.startsWith('done')) {
      const result = await sh(sb, `cat ${dir}/result.json 2>/dev/null || true`);
      const tail = await sh(sb, `tail -c 3000 ${dir}/out.log 2>/dev/null || true`);
      const [, exit, secs] = s.out.split(' ');
      // A job started before this deployment has no `started` file: no seconds, rather than a wrong one.
      const seconds = Number(secs);
      return { state: 'done', exit: Number(exit), result: result.out, tail: tail.out, ...(Number.isFinite(seconds) && seconds >= 0 && seconds < 86_400 ? { seconds } : {}) };
    }
    if (s.out === 'lost') return { state: 'lost' };
    if (Date.now() > until) return { state: 'running' };
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
pollJob.maxRetries = 5;

/**
 * The safety net under every run's own cleanup: delete any run sandbox idle for
 * longer than `maxIdleHours` (never the warm one). No live run keeps a sandbox
 * that long — ship drops its own when the pull request opens, the others finish
 * in minutes — so whatever is left is from a run that died without cleaning up.
 */
export async function sweepSandboxes(maxIdleHours = 3) {
  'use step';
  const cutoff = Date.now() - maxIdleHours * 60 * 60_000;
  const all = await (await (Sandbox as any).list({})).toArray();
  const swept: string[] = [];
  for (const s of all) {
    const name = String(s.name ?? '');
    const last = Number(s.updatedAt ?? s.createdAt ?? 0);
    if (!name || name === WARM || last > cutoff) continue;
    try { await (await Sandbox.get({ name })).delete(); swept.push(name); } catch { /* gone, or busy: next sweep */ }
  }
  // Deleting a sandbox leaves its snapshots behind (each kept for 30 days),
  // and they are what fills the storage quota. A snapshot no live sandbox
  // resumes from is an orphan; the hour's grace spares one being taken now.
  const live = new Set((await (await (Sandbox as any).list({})).toArray()).map((s: any) => s.currentSnapshotId).filter(Boolean));
  const snaps = await (await (Snapshot as any).list({})).toArray();
  let orphans = 0;
  for (const x of snaps) {
    if (x.status === 'deleted' || live.has(x.id) || Number(x.createdAt) > Date.now() - 60 * 60_000) continue;
    try { await (await (Snapshot as any).get({ snapshotId: x.id })).delete(); orphans += 1; } catch { /* next sweep */ }
  }
  return { swept, kept: all.length - swept.length, orphans };
}
sweepSandboxes.maxRetries = 1;

/** The end of a run: the branch is pushed, so the machine can go. */
export async function disposeSandbox(name: string) {
  'use step';
  try {
    const sb = await Sandbox.get({ name });
    await sb.delete();
  } catch { /* already gone */ }
  return true;
}

export const shellQuote = q;
