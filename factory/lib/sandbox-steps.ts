import { Sandbox } from '@vercel/sandbox';
import { AGENT_ENV, lockedPolicy, type Mode } from './policy';
import { ALLOWED_REPO, REPO_DIR } from './constants';

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
      sb = await Sandbox.fork({ sourceSandbox: WARM, name, resources: { vcpus: 4 }, timeout: 45 * 60_000 });
      how = 'forked';
    } catch {
      sb = await Sandbox.create({
        name,
        source: { type: 'git', url: `https://github.com/${ALLOWED_REPO}.git`, revision: /^[0-9a-f]{40}$/.test(ref) ? undefined : ref },
        resources: { vcpus: 4 },
        timeout: 45 * 60_000,
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
 * Start one job, detached. Safe to repeat: a job that already started (this
 * step retried after starting it) is left alone.
 */
export async function startJob(name: string, id: string, files: Record<string, string>, script: string) {
  'use step';
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
    args: ['-c', `cd ${REPO_DIR} && echo $$ > ${dir}/pid && JOB=${dir} bash ${dir}/run.sh > ${dir}/out.log 2>&1; echo $? > ${dir}/exit`],
    env: { ...AGENT_ENV, JOB: dir },
    detached: true,
  });
  return { started: true, state: 'running' };
}
startJob.maxRetries = 3;

export type JobPoll =
  | { state: 'running' }
  | { state: 'lost' }
  | { state: 'done'; exit: number; result: string; tail: string };

/** Wait up to ~40 s for a job to end; say how it stands. */
export async function pollJob(name: string, id: string): Promise<JobPoll> {
  'use step';
  const sb = await Sandbox.get({ name });
  const dir = `${ROOT}/${id}`;
  const until = Date.now() + 40_000;
  for (;;) {
    const s = await sh(sb, `if [ -f ${dir}/exit ]; then echo "done $(cat ${dir}/exit)"; elif [ -f ${dir}/pid ] && kill -0 "$(cat ${dir}/pid)" 2>/dev/null; then echo running; else echo lost; fi`);
    if (s.out.startsWith('done')) {
      const result = await sh(sb, `cat ${dir}/result.json 2>/dev/null || true`);
      const tail = await sh(sb, `tail -c 3000 ${dir}/out.log 2>/dev/null || true`);
      return { state: 'done', exit: Number(s.out.split(' ')[1]), result: result.out, tail: tail.out };
    }
    if (s.out === 'lost') return { state: 'lost' };
    if (Date.now() > until) return { state: 'running' };
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
pollJob.maxRetries = 5;

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
