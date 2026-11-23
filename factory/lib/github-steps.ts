import { ALLOWED_REPO } from './constants';

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
  if (id) {
    await gh(`/issues/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body: marked(body) }) });
    return id;
  }
  const c = await gh(`/issues/${issue}/comments`, { method: 'POST', body: JSON.stringify({ body: marked(body) }) });
  return c.id;
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
 * The preview that shows a pull request's head. A commit that changes nothing
 * in the app (only factory/, say) is not built — the app project's ignore
 * step skips it — so the newest earlier commit's preview is the same app, and
 * the one to test. Pending while the newest buildable commit is still building.
 */
export async function previewForPr(n: number) {
  'use step';
  const commits = await gh(`/pulls/${n}/commits?per_page=100`);
  for (const c of [...commits].reverse()) {
    const d = await deploymentFor(c.sha, 'Preview');
    if (d.state !== 'none') return d;
  }
  return { state: 'none' as const, url: null, sha: null };
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
  };
}

/** The JSON in the newest `<!-- <marker> {…} -->` comment on an issue or PR, if any. */
export async function readMarker(n: number, marker: string): Promise<any | null> {
  'use step';
  const comments = await gh(`/issues/${n}/comments?per_page=100`);
  for (const c of [...comments].reverse()) {
    const m = new RegExp(`<!-- ${marker} (\\{.*?\\}) -->`, 's').exec(c.body || '');
    if (m) { try { return JSON.parse(m[1]); } catch { return null; } }
  }
  return null;
}

/** A commit status — the verdict's colour on the pull request, beside Vercel's own. */
export async function setStatus(sha: string, context: string, state: 'pending' | 'success' | 'failure' | 'error', description: string, targetUrl?: string) {
  'use step';
  await gh(`/statuses/${sha}`, { method: 'POST', body: JSON.stringify({ context, state, description: description.slice(0, 140), ...(targetUrl ? { target_url: targetUrl } : {}) }) });
  return true;
}

/** File a follow-up: real, but not bad enough to stop a merge. */
export async function fileIssue(title: string, body: string, labels: string[]) {
  'use step';
  const i = await gh('/issues', { method: 'POST', body: JSON.stringify({ title: title.slice(0, 200), body, labels }) });
  return { number: i.number as number, url: i.html_url as string };
}

export async function setLabels(issue: number, add: string[], remove: string[]) {
  'use step';
  if (add.length) await gh(`/issues/${issue}/labels`, { method: 'POST', body: JSON.stringify({ labels: add }) });
  for (const l of remove) {
    try { await gh(`/issues/${issue}/labels/${encodeURIComponent(l)}`, { method: 'DELETE' }); } catch { /* not there */ }
  }
  return true;
}
