import { getWritable } from 'workflow';
import { ALLOWED_REPO, APP_PROJECT } from './constants';
import { dismissNumbers, type Dismissed } from './review-policy';

/**
 * The factory's own GitHub calls — the progress comment and the spend line —
 * made from the function with its token, never from the sandbox. Only ever
 * against the allowed repository.
 */
async function gh(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com/repos/${ALLOWED_REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'orbit-factory',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method || 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

async function graphql(query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'content-type': 'application/json', 'user-agent': 'orbit-factory' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (!res.ok || j.errors) throw new Error(`GitHub GraphQL: ${JSON.stringify(j.errors || j).slice(0, 300)}`);
  return j.data;
}

/** An open pull request an earlier ship run of this issue left — usually a draft it handed back. */
export async function findEarlierAttempt(issue: number) {
  'use step';
  const open = await gh(`/pulls?state=open&per_page=50`);
  const pr = open.find((p: any) => p.head?.repo?.full_name?.toLowerCase() === ALLOWED_REPO && new RegExp(`^issue-${issue}-`).test(p.head.ref));
  return pr ? { number: pr.number as number, head: pr.head.ref as string, draft: Boolean(pr.draft), url: pr.html_url as string } : null;
}

/**
 * What people have said about the ticket since it was written: every comment on
 * the issue and on an earlier attempt's pull request that is not the factory's
 * own or a bot's. A person answering a hand-back does it in either place.
 */
export async function peopleSaid(issue: number, pr: number | null) {
  'use step';
  const out: { at: string; who: string; where: string; text: string }[] = [];
  for (const [n, where] of [[issue, `issue #${issue}`], ...(pr ? [[pr, `pull request #${pr}`]] : [])] as [number, string][]) {
    const comments = await gh(`/issues/${n}/comments?per_page=100`);
    for (const c of comments) {
      const text = String(c.body || '');
      if (c.user?.type === 'Bot' || text.includes('<!-- factory') || text.includes('<!-- ship-on-vercel')) continue;
      out.push({ at: c.created_at, who: c.user?.login ?? '?', where, text: text.slice(0, 1500) });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(-12);
}

export type Issue = { number: number; title: string; body: string; labels: string[]; state: string; isPullRequest: boolean };

export async function readIssue(n: number): Promise<Issue> {
  'use step';
  const i = await gh(`/issues/${n}`);
  return {
    number: i.number,
    title: i.title,
    body: i.body || '',
    labels: (i.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
    state: i.state,
    isPullRequest: Boolean(i.pull_request),
  };
}

/**
 * Every comment the factory writes carries this marker. They are posted with a
 * person's token, so to the webhook they look like that person's — the marker
 * is how it knows never to act on one (an agent's reply that mentions @claude
 * must not start another run).
 */
const MARK = '\n<!-- factory -->';
const marked = (body: string) => (body.includes('<!-- factory') ? body : body + MARK);

/** Create the issue's progress comment, or edit it in place. Returns its id. */
export async function upsertComment(issue: number, id: number | null, body: string): Promise<number> {
  'use step';
  return editOrPost(issue, id, body);
}

/**
 * Edit the comment in place — or, when a person has deleted it, post a fresh
 * one and hand back its id. A deleted progress comment used to fail the edit
 * three times and crash the run (#16, in the middle of its review round).
 */
export async function editOrPost(issue: number, id: number | null, body: string): Promise<number> {
  if (id) {
    try {
      await gh(`/issues/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body: marked(body) }) });
      return id;
    } catch (e: any) {
      if (!/→ 404/.test(String(e?.message))) throw e;
    }
  }
  const c = await gh(`/issues/${issue}/comments`, { method: 'POST', body: JSON.stringify({ body: marked(body) }) });
  return c.id as number;
}
upsertComment.maxRetries = 3;

/** A one-off comment (the spend line on the pull request). */
export async function comment(issueOrPr: number, body: string) {
  'use step';
  await gh(`/issues/${issueOrPr}/comments`, { method: 'POST', body: JSON.stringify({ body: marked(body) }) });
  return true;
}

/** Open the pull request — or, if one is already open for this branch, update it. */
export async function openPullRequest(p: { head: string; base: string; title: string; body: string; draft: boolean; labels: string[] }) {
  'use step';
  const [owner] = ALLOWED_REPO.split('/');
  const existing = await gh(`/pulls?state=open&head=${owner}:${encodeURIComponent(p.head)}`);
  let pr = existing[0];
  if (pr) {
    pr = await gh(`/pulls/${pr.number}`, { method: 'PATCH', body: JSON.stringify({ title: p.title, body: p.body, base: p.base }) });
    // REST cannot take a pull request out of draft; GraphQL can.
    if (pr.draft && !p.draft) {
      await graphql(`mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`, { id: pr.node_id });
      pr = { ...pr, draft: false };
    }
  } else {
    pr = await gh('/pulls', { method: 'POST', body: JSON.stringify({ head: p.head, base: p.base, title: p.title, body: p.body, draft: p.draft }) });
  }
  if (p.labels.length) await gh(`/issues/${pr.number}/labels`, { method: 'POST', body: JSON.stringify({ labels: p.labels }) });
  return { number: pr.number as number, url: pr.html_url as string, head: pr.head.sha as string };
}
openPullRequest.maxRetries = 2;

/**
 * The Vercel deployment GitHub knows about for a commit — Vercel's Git
 * integration reports each one as a GitHub Deployment whose environment is
 * "Preview – <project>" or "Production – <project>" (the factory's own are skipped).
 */
async function deploymentFor(sha: string, kind: 'Preview' | 'Production') {
  const deployments = await gh(`/deployments?sha=${sha}&per_page=20`);
  for (const d of deployments) {
    if (!String(d.environment).startsWith(kind) || /factory/i.test(d.environment)) continue;
    const statuses = await gh(`/deployments/${d.id}/statuses?per_page=5`);
    const latest = statuses[0];
    if (!latest) return { state: 'pending' as const, url: null, sha };
    if (latest.state === 'success') return { state: 'ready' as const, url: (latest.environment_url || latest.target_url) as string, sha };
    if (['failure', 'error'].includes(latest.state)) return { state: 'failed' as const, url: latest.target_url as string, sha };
    return { state: 'pending' as const, url: null, sha };
  }
  return { state: 'none' as const, url: null, sha };
}

export async function findDeployment(sha: string, kind: 'Preview' | 'Production') {
  'use step';
  return deploymentFor(sha, kind);
}

/**
 * The preview that shows a pull request's head. Vercel reports every commit as
 * a status, "Vercel – <project>": a commit that changes nothing in the app
 * (only factory/, say) reads "Canceled by Ignored Build Step", and the newest
 * earlier commit's preview is the same app — the one to test. A commit with no
 * status yet — if it is the head — has not been seen by Vercel: pending, never
 * an older preview. An earlier one without a status was in the middle of a push.
 */
export async function previewForPr(n: number) {
  'use step';
  const commits = await gh(`/pulls/${n}/commits?per_page=100`);
  const newestFirst = [...commits].reverse();
  let ignored = false;
  for (const [i, c] of newestFirst.entries()) {
    const combined = await gh(`/commits/${c.sha}/status`);
    const vercel = (combined.statuses || []).find((x: any) => x.context === `Vercel – ${APP_PROJECT}`);
    // Vercel reports only the last commit of each push: a head without a status is
    // not seen yet; an earlier commit without one was mid-push, and never will be.
    if (!vercel) { if (i === 0) return { state: 'pending' as const, url: null, sha: c.sha }; continue; }
    if (/ignored build step/i.test(vercel.description || '')) { ignored = true; continue; }
    const d = await deploymentFor(c.sha, 'Preview');
    return d.state === 'none' ? { state: 'pending' as const, url: null, sha: c.sha } : d;
  }
  // Every push skipped the app's build (it changed only factory/, docs…): there is no preview, and there
  // will not be one — `skipped`, so QA and screenshots stop at once instead of waiting fifteen minutes.
  return { state: ignored ? ('skipped' as const) : ('none' as const), url: null, sha: null };
}

/** The production app, asked directly: is it up, and how many sessions does it serve? */
export async function productionHealth(url: string) {
  'use step';
  try {
    const r = await fetch(`${url}/api/health`, { headers: { 'user-agent': 'orbit-factory' } });
    const body = await r.json().catch(() => null);
    return { ok: r.ok && Boolean(body?.ok), status: r.status, sessions: body?.sessions ?? null };
  } catch (e: any) {
    return { ok: false, status: 0, sessions: null };
  }
}

export type PullRequest = {
  number: number; title: string; body: string; draft: boolean; state: string; merged: boolean;
  head: string; headSha: string; base: string; labels: string[]; issue: number | null; author: string;
  /** The branch lives in this repository (not a fork), so the factory may push to it. */
  sameRepo: boolean;
};

/** A pull request, and the issue it closes (`Closes #n` / `Refs #n`, else an `issue-<n>-` branch). */
export async function readPullRequest(n: number): Promise<PullRequest> {
  'use step';
  const p = await gh(`/pulls/${n}`);
  const linked = /(?:closes|fixes|resolves|refs)\s+#(\d+)/i.exec(p.body || '')?.[1] ?? /^issue-(\d+)-/.exec(p.head.ref)?.[1];
  return {
    number: p.number, title: p.title, body: p.body || '', draft: p.draft, state: p.state, merged: Boolean(p.merged),
    head: p.head.ref, headSha: p.head.sha, base: p.base.ref,
    labels: (p.labels || []).map((l: any) => l.name), issue: linked ? Number(linked) : null, author: p.user?.login ?? '',
    sameRepo: p.head?.repo?.full_name?.toLowerCase() === ALLOWED_REPO,
  };
}

/** The paths a pull request changes (the first 300 — past that, callers treat it as touching everything). */
export async function pullRequestFiles(n: number): Promise<string[]> {
  'use step';
  const out: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const files: any[] = await gh(`/pulls/${n}/files?per_page=100&page=${page}`);
    out.push(...files.map((f) => String(f.filename)));
    if (files.length < 100) break;
  }
  return out;
}

/**
 * What a commit changes, and its patch: against the base it branched from
 * (`base...sha`, a pull request), or against its parent (a push to main).
 * Not a step — the `classify` step in phases.ts calls it.
 */
export async function changesOf(sha: string, base: string | null) {
  const j = base ? await gh(`/compare/${encodeURIComponent(base)}...${sha}`) : await gh(`/commits/${sha}`);
  const files: any[] = j.files || [];
  return {
    files: files.filter((f) => f.status !== 'removed').map((f) => String(f.filename)),
    removed: files.filter((f) => f.status === 'removed').map((f) => String(f.filename)),
    diff: files.map((f) => `--- ${f.filename} (${f.status})\n${f.patch ?? '(no patch shown)'}`).join('\n').slice(0, 40_000),
    // The compare API lists at most 300 files: past that, "what changed" is not known.
    complete: files.length < 300,
  };
}

/** The pull request a commit on main came from, and its head when merged. Not a step. */
export async function pullOfCommit(sha: string): Promise<{ number: number; headSha: string } | null> {
  const prs: any[] = await gh(`/commits/${sha}/pulls`, { headers: { accept: 'application/vnd.github+json' } });
  const p = prs.find((x) => x.merged_at) ?? prs[0];
  return p ? { number: p.number, headSha: p.head?.sha } : null;
}

/** The JSON in the newest `<!-- <marker> {…} -->` comment on an issue or PR, if any. */
export async function readMarker(n: number, marker: string): Promise<any | null> {
  'use step';
  const comments = await gh(`/issues/${n}/comments?per_page=100`);
  return markerIn(comments, marker);
}

/** Who may write to the repository: the only people whose comments the factory takes as its own or as an instruction. */
export const WRITERS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/**
 * The newest marker among comments by people who can write to the repository — the factory posts
 * with such a person's token. Anyone can comment on a public repository, so a marker in anyone
 * else's comment is not the factory's and is not read. A commit it names must be a sha.
 */
export function markerIn(comments: any[], marker: string): any | null {
  for (const c of [...comments].reverse()) {
    if (!WRITERS.has(c.author_association)) continue;
    const m = new RegExp(`<!-- ${marker} (\\{.*?\\}) -->`, 's').exec(c.body || '');
    if (!m) continue;
    try {
      const v = JSON.parse(m[1]);
      if (v && 'commit' in v && !/^[0-9a-f]{7,40}$/.test(String(v.commit))) return null;
      return v;
    } catch { return null; }
  }
  return null;
}

/**
 * What people have told review it got wrong, across the repository: a 👎 on a
 * review comment dismisses its blockers (or, with none, everything it listed);
 * `/dismiss 2` under a review dismisses its finding 2. The comments are the
 * record — nothing else to keep in sync — and every review reads them back
 * so the same false positive is not raised twice.
 */
export async function pastDismissals(days = 90) {
  'use step';
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const all: any[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/issues/comments?since=${since}&per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return dismissalsFrom(all);
}
pastDismissals.maxRetries = 2;

/** Pure: the comments → what was dismissed (exported for its test). */
export function dismissalsFrom(comments: any[]): Dismissed[] {
  const prOf = (c: any) => Number(String(c.issue_url || '').split('/').pop());
  const reviews = comments.map((c) => {
    const m = /<!-- factory-verdict:review (\{.*?\}) -->/s.exec(c.body || '');
    if (!m) return null;
    try { return { c, marker: JSON.parse(m[1]) }; } catch { return null; }
  }).filter(Boolean) as { c: any; marker: any }[];
  const out: Dismissed[] = [];
  const add = (pr: number, f: any) => f && out.push({ pr, file: f.file, line: f.line, category: f.category, claim: f.claim });
  for (const { c, marker } of reviews) {
    if ((c.reactions?.['-1'] ?? 0) > 0) {
      const listed: any[] = marker.listed ?? [];
      const blocking = listed.filter((x) => x.blocker);
      for (const f of (blocking.length ? blocking : listed.length ? listed : marker.blockers ?? [])) add(prOf(c), f);
    }
  }
  for (const c of comments) {
    const ns = dismissNumbers(c.body || '');
    if (!ns.length || (c.body || '').includes('<!-- factory')) continue;
    // The review it answers: the latest one on the same pull request before it.
    const r = reviews.filter((x) => x.c.issue_url === c.issue_url && x.c.created_at <= c.created_at).pop();
    for (const n of ns) add(prOf(c), (r?.marker.listed ?? []).find((x: any) => x.n === n));
  }
  return out;
}

/** A commit status — the verdict's colour on the pull request, beside Vercel's own. */
export async function setStatus(sha: string, context: string, state: 'pending' | 'success' | 'failure' | 'error', description: string, targetUrl?: string) {
  'use step';
  await gh(`/statuses/${sha}`, { method: 'POST', body: JSON.stringify({ context, state, description: description.slice(0, 140), ...(targetUrl ? { target_url: targetUrl } : {}) }) });
  return true;
}

export async function setLabels(issue: number, add: string[], remove: string[]) {
  'use step';
  if (add.length) await gh(`/issues/${issue}/labels`, { method: 'POST', body: JSON.stringify({ labels: add }) });
  for (const l of remove) {
    try { await gh(`/issues/${issue}/labels/${encodeURIComponent(l)}`, { method: 'DELETE' }); } catch { /* not there */ }
  }
  return true;
}

/**
 * The run's progress: edit the issue comment, and append what happened since
 * the last call to the run's `progress` stream — the Streams tab of the run in
 * Vercel, a live log of every phase and agent (its model, turns, cost, and its
 * own final answer).
 */
export async function progress(issue: number, commentId: number | null, body: string, lines: string[]) {
  'use step';
  if (lines.length) {
    const w = getWritable<string>({ namespace: 'progress' }).getWriter();
    try { for (const l of lines) await w.write(l + '\n'); } finally { w.releaseLock(); }
  }
  return editOrPost(issue, commentId, body);
}
progress.maxRetries = 3;

/** Append lines to the run's `progress` stream (the run's Streams tab in Vercel). */
export async function streamLog(lines: string[]) {
  'use step';
  const w = getWritable<string>({ namespace: 'progress' }).getWriter();
  try { for (const l of lines) await w.write(l + '\n'); } finally { w.releaseLock(); }
  return lines.length;
}
streamLog.maxRetries = 3;
