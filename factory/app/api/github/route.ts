import { createHmac, timingSafeEqual } from 'node:crypto';
import { resumeHook } from 'workflow/api';
import { HookNotFoundError } from 'workflow/errors';
import { ALLOWED_REPO, FULL_SUITE_LABEL } from '@/lib/constants';
import { dismissNumbers } from '@/lib/review-policy';
import { actsOn, explicitAsk, MAX_PICKUPS_AN_HOUR, readIntent, tooManyPickups } from '@/lib/intent';
import { startChecks, startRespond, startShip, startShots, startVerify, startWarm } from '@/lib/start';

/**
 * GitHub's webhook for the repository:
 *   - an issue labelled `ready-for-ai`, or `@claude …` / `/ship …` on an issue → ship it
 *   - `ready-for-ai` or `/ship` on a pull request ship opened → ship its issue again, continuing that branch
 *   - any comment on a ticket in needs-human, or on its draft → the answer: ship resumes with it
 *   - a pull request opened, reopened or marked ready  → review and QA it
 *     (not one ship opened: ship runs its own, and waits for them)
 *   - `/review` on a pull request                      → verify, review and QA it again
 *   - `/screenshots` on a pull request                 → screenshot what it changes, on its preview
 *   - `/fix …` or `@claude …` on a pull request        → respond: make the change asked for
 *   - a plain comment on a pull request, or on a ticket whose pull request is open → Jev reads it:
 *     a change wanted or a question asked goes to respond; anything else is left alone
 *   - "finding <n> is wrong" on a pull request         → nothing now: the next review reads it and drops that finding for good
 *   - a pull request closed (merged or not)            → wake the ship run waiting on it, tidy its issue
 *   - a push to a pull request (or one ship opened)    → verify: the tests the change needs, as CI
 *   - `full-suite` put on a pull request               → verify it again, running everything
 *   - a push to main                                   → verify it, and re-warm the sandbox runs fork
 * Comments count only from someone with write access.
 * Anything from another repository is refused, before anything is parsed.
 */
function verified(raw: string, signature: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const WRITERS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const github = (path: string) => fetch(`https://api.github.com/repos/${ALLOWED_REPO}${path}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'orbit-factory' } }).then((r) => r.json());

/**
 * A comment with no command, on an open pull request of this repository: Jev says whether it asks the
 * factory for a change or an answer, and only then does respond start. `issue` is set when the comment
 * was made on the ticket rather than the pull request, so respond can say there that it was picked up.
 */
async function plainComment(pr: any, body: string, comment: any, issue?: number) {
  if (pr?.state !== 'open') return { ignored: 'no open pull request for this comment' };
  // respond pushes, so only to a branch of this repository.
  if (pr.head?.repo?.full_name?.toLowerCase() !== ALLOWED_REPO) return { ignored: 'a fork\'s branch: the factory pushes only to this repository' };
  const asked = explicitAsk(body);
  if (asked !== null) return startRespond({ pr: pr.number, ask: asked, author: comment.user.login, ...(issue ? { issue } : {}) }, comment.id);
  // The factory comments as the person whose token it holds, and an agent could comment with it too. Its own
  // comments are marked and never get here; this is the backstop against anything unmarked answering itself.
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const recent: any[] = await github(`/issues/${pr.number}/comments?per_page=100&since=${since}`);
  if (tooManyPickups(Array.isArray(recent) ? recent.map((c) => String(c.body || '')) : [])) return { ignored: `${MAX_PICKUPS_AN_HOUR} requests picked up on this pull request in the last hour: write /fix … to ask for another` };
  const read = await readIntent(body, { pr: pr.number, title: String(pr.title || ''), where: issue ? 'issue' : 'pull request' });
  if (!actsOn(read.intent, read.sure)) return { ignored: read.error ? `Jev was unavailable: ${read.error}` : `Jev read it as ${read.intent} (${Math.round((read.sure ?? 0) * 100)}% sure): not a request to the factory` };
  return { intent: read.intent, sure: read.sure, ...(await startRespond({ pr: pr.number, ask: body.trim(), author: comment.user.login, ...(issue ? { issue } : {}) }, comment.id)) };
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verified(raw, req.headers.get('x-hub-signature-256'))) return Response.json({ error: 'bad signature' }, { status: 401 });
  const event = req.headers.get('x-github-event');
  const p = JSON.parse(raw);
  if (event === 'ping') return Response.json({ ok: true, zen: p.zen });
  if (p.repository?.full_name?.toLowerCase() !== ALLOWED_REPO) return Response.json({ ignored: 'not the factory repository' }, { status: 403 });

  // A ticket waiting on a person (needs-human): their comment is the answer. Any comment from someone with
  // write access, on the issue or on the draft ship handed back, resumes it — no label needed.
  if (event === 'issue_comment' && p.action === 'created' && WRITERS.has(p.comment?.author_association)) {
    const body: string = p.comment?.body || '';
    // "finding 2 is wrong" marks a review finding wrong (read back by the next review), not an answer to a hand-back.
    if (!body.includes('<!-- factory') && !body.includes('<!-- ship-on-vercel') && !dismissNumbers(body).length) {
      let n: number | null = null;
      if (!p.issue?.pull_request) {
        if ((p.issue.labels || []).some((l: any) => l.name === 'needs-human')) n = p.issue.number;
      } else {
        const pr = await fetch(`https://api.github.com/repos/${ALLOWED_REPO}/pulls/${p.issue.number}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'orbit-factory' } }).then((r) => r.json());
        const linked = pr.head?.repo?.full_name?.toLowerCase() === ALLOWED_REPO ? /^issue-(\d+)-/.exec(pr.head.ref)?.[1] : undefined;
        if (linked) {
          const issue = await fetch(`https://api.github.com/repos/${ALLOWED_REPO}/issues/${linked}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'orbit-factory' } }).then((r) => r.json());
          if ((issue.labels || []).some((l: any) => l.name === 'needs-human')) n = Number(linked);
        }
      }
      if (n) return Response.json({ answered: n, ...(await startShip({ issue: n, answer: true })) });
    }
  }

  if (event === 'issues' && p.action === 'labeled' && p.label?.name === 'ready-for-ai' && !p.issue?.pull_request) {
    return Response.json(await startShip({ issue: p.issue.number }));
  }

  if (event === 'issue_comment' && p.action === 'created' && !p.issue?.pull_request) {
    const body: string = p.comment?.body || '';
    const asked = /(^|\s)(@claude|\/ship)\b/i.test(body) && !body.includes('<!-- factory') && !body.includes('<!-- ship-on-vercel') && WRITERS.has(p.comment?.author_association);
    if (asked) {
      const size = (/--(fast|small|full)\b/.exec(body) || [])[1] as any;
      const notes = body.replace(/(^|\s)(@claude|\/ship)\b/gi, ' ').replace(/--(fast|small|full|sized)\b/g, '').trim();
      return Response.json(await startShip({ issue: p.issue.number, notes: notes || undefined, size }));
    }
    // A comment on a ticket whose pull request is open is about that pull request: people answer where they are.
    if (WRITERS.has(p.comment?.author_association) && body.trim() && !body.includes('<!-- factory') && !body.includes('<!-- ship-on-vercel') && !dismissNumbers(body).length) {
      const open: any[] = await github('/pulls?state=open&per_page=100');
      const pr = (Array.isArray(open) ? open : []).find((x) => new RegExp(`^issue-${p.issue.number}-`).test(x.head?.ref ?? ''));
      if (pr) return Response.json(await plainComment(pr, body, p.comment, p.issue.number));
    }
  }

  if (event === 'push') {
    const branch = String(p.ref || '').replace(/^refs\/heads\//, '');
    if (branch !== 'main' || p.deleted) return Response.json({ ignored: `push to ${branch}` });
    const [v, w] = await Promise.all([startVerify({ sha: p.after, ref: 'main', base: 'main' }), startWarm('main', p.after)]);
    return Response.json({ verify: v, warm: w });
  }

  // `full-suite` put on a pull request: verify its head again, running everything.
  if (event === 'pull_request' && p.action === 'labeled' && p.label?.name === FULL_SUITE_LABEL) {
    const pr = p.pull_request;
    return Response.json({ verify: await startVerify({ sha: pr.head.sha, ref: pr.head.ref, base: pr.base.ref, pr: pr.number, full: true }) });
  }

  // CI on every push to a pull request — one ship opened too: verify finds what ship's gate ran
  // green at that commit and runs only the rest, so the pull request still gets its status.
  // verify holds no credential, so it runs for anyone's pull request; review and QA spend
  // money and read untrusted code, so they run by themselves only for a branch of this
  // repository opened by someone with write access — anyone else's need a maintainer's /review.
  if (event === 'pull_request' && ['synchronize', 'opened', 'reopened'].includes(p.action)) {
    const pr = p.pull_request;
    const trusted = pr.head?.repo?.full_name?.toLowerCase() === ALLOWED_REPO && WRITERS.has(pr.author_association);
    const shipOpened = p.action === 'opened' && /^issue-\d+-/.test(pr.head.ref);
    const full = (pr.labels || []).some((l: any) => l.name === FULL_SUITE_LABEL);
    const v = await startVerify({ sha: pr.head.sha, ref: pr.head.ref, base: pr.base.ref, full, pr: pr.number });
    // A push moves the preview: the "Try it" link and the screenshots follow the branch, or they
    // show the commit before the one just asked for. No model and no credential, so every push gets it.
    // The token is per commit, so a redelivered push reuses this run; ship's own start of `shots` for
    // a fix round carries no token, so that push runs it twice.
    if (p.action === 'synchronize') {
      const follows = trusted && pr.user?.type !== 'Bot';
      return Response.json({ verify: v, ...(follows ? { shots: await startShots(pr.number, pr.head.sha) } : {}) });
    }
    if (pr.draft) return Response.json({ verify: v, ignored: 'draft' });
    // A bot's pull request (Dependabot) gets CI, not a paid review and QA.
    if (pr.user?.type === 'Bot' || !trusted) return Response.json({ verify: v, ignored: 'not a trusted branch: verify only, until a maintainer comments /review' });
    if (shipOpened) return Response.json({ ignored: 'ship opened it, and runs its own gate, review and QA' });
    return Response.json({ verify: v, checks: await startChecks(pr.number, pr.head.sha) });
  }

  if (event === 'pull_request' && p.action === 'ready_for_review' && p.pull_request.head?.repo?.full_name?.toLowerCase() === ALLOWED_REPO && WRITERS.has(p.pull_request.author_association)) {
    return Response.json(await startChecks(p.pull_request.number, p.pull_request.head.sha));
  }

  // ready-for-ai on a pull request ship opened (issue-<n>-…) means "ship #n again": put the label on the
  // issue, which is what starts a run — so the issue and the PR say the same thing.
  if (event === 'pull_request' && p.action === 'labeled' && p.label?.name === 'ready-for-ai') {
    const n = /^issue-(\d+)-/.exec(p.pull_request.head.ref)?.[1];
    if (!n || p.pull_request.head?.repo?.full_name?.toLowerCase() !== ALLOWED_REPO) return Response.json({ ignored: 'not a pull request ship opened' });
    await fetch(`https://api.github.com/repos/${ALLOWED_REPO}/issues/${n}/labels`, {
      method: 'POST', headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'content-type': 'application/json', 'user-agent': 'orbit-factory' },
      body: JSON.stringify({ labels: ['ready-for-ai'] }),
    });
    return Response.json({ relayed: `ready-for-ai → issue #${n}` });
  }

  if (event === 'issue_comment' && p.action === 'created' && p.issue?.pull_request && WRITERS.has(p.comment?.author_association)) {
    const body: string = p.comment?.body || '';
    if (body.includes('<!-- factory') || body.includes('<!-- ship-on-vercel')) return Response.json({ ignored: 'the factory\'s own comment' });
    const shipOf = /(^|\s)\/ship\b/i.test(body) ? await fetch(`https://api.github.com/repos/${ALLOWED_REPO}/pulls/${p.issue.number}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'orbit-factory' } }).then((r) => r.json()).then((pr) => /^issue-(\d+)-/.exec(pr.head?.ref ?? '')?.[1]) : null;
    if (shipOf) return Response.json(await startShip({ issue: Number(shipOf), notes: body.replace(/(^|\s)\/ship\b/gi, ' ').trim() || undefined }));
    if (/(^|\s)\/screenshots?\b/i.test(body)) {
      const pr = await fetch(`https://api.github.com/repos/${ALLOWED_REPO}/pulls/${p.issue.number}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'orbit-factory' } }).then((r) => r.json());
      return Response.json({ shots: await startShots(p.issue.number, pr.head.sha) });
    }
    if (/(^|\s)(\/review|@claude\s+review)\b/i.test(body)) {
      const pr = await fetch(`https://api.github.com/repos/${ALLOWED_REPO}/pulls/${p.issue.number}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'orbit-factory' } }).then((r) => r.json());
      const full = (pr.labels || []).some((l: any) => l.name === FULL_SUITE_LABEL);
      const [v, checks] = await Promise.all([startVerify({ sha: pr.head.sha, ref: pr.head.ref, base: pr.base.ref, full, pr: pr.number }), startChecks(p.issue.number, pr.head.sha)]);
      return Response.json({ verify: v, checks });
    }
    // `/fix …`, `@claude …`, or no command at all: Jev reads a plain comment and respond takes a change or a question.
    if (body.trim() && !dismissNumbers(body).length) return Response.json(await plainComment(await github(`/pulls/${p.issue.number}`), body, p.comment));
  }

  if (event === 'pull_request' && p.action === 'closed') {
    // Merged: the issue it closes is done — clear the factory's labels (what on-merge.yml did).
    const linked = /(?:closes|fixes|resolves|refs)\s+#(\d+)/i.exec(p.pull_request.body || '')?.[1] ?? /^issue-(\d+)-/.exec(p.pull_request.head.ref)?.[1];
    if (p.pull_request.merged && linked) {
      for (const l of ['ai-working', 'needs-human', 'ready-for-human']) {
        await fetch(`https://api.github.com/repos/${ALLOWED_REPO}/issues/${linked}/labels/${encodeURIComponent(l)}`, { method: 'DELETE', headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'orbit-factory' } }).catch(() => null);
      }
    }
    try {
      await resumeHook(`pr:${ALLOWED_REPO}#${p.pull_request.number}`, { merged: Boolean(p.pull_request.merged), sha: p.pull_request.merge_commit_sha });
      return Response.json({ resumed: true });
    } catch (e) {
      if (HookNotFoundError.is(e)) return Response.json({ resumed: false, reason: 'no run is waiting on this pull request' });
      throw e;
    }
  }

  return Response.json({ ignored: `${event}${p.action ? `.${p.action}` : ''}` });
}
