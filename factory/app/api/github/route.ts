import { createHmac, timingSafeEqual } from 'node:crypto';
import { resumeHook } from 'workflow/api';
import { HookNotFoundError } from 'workflow/errors';
import { ALLOWED_REPO } from '@/lib/constants';
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
 *   - `/dismiss <n>` on a pull request                  → nothing now: the next review reads it and drops that finding for good
 *   - a pull request closed (merged or not)            → wake the ship run waiting on it, tidy its issue
 *   - a push to a pull request                         → verify: the gate, as CI
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
    // `/dismiss n` marks a review finding wrong (read back by the next review), not an answer to a hand-back.
    if (!body.includes('<!-- factory') && !body.includes('<!-- ship-on-vercel') && !/(^|\s)\/dismiss\b/i.test(body)) {
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
  }

  if (event === 'push') {
    const branch = String(p.ref || '').replace(/^refs\/heads\//, '');
    if (branch !== 'main' || p.deleted) return Response.json({ ignored: `push to ${branch}` });
    const [v, w] = await Promise.all([startVerify({ sha: p.after, ref: 'main', base: 'main' }), startWarm('main', p.after)]);
    return Response.json({ verify: v, warm: w });
  }

  // CI on every push to a pull request. The push ship's gate already proved is not run twice.
  // verify holds no credential, so it runs for anyone's pull request; review and QA spend
  // money and read untrusted code, so they run by themselves only for a branch of this
  // repository opened by someone with write access — anyone else's need a maintainer's /review.
  if (event === 'pull_request' && ['synchronize', 'opened', 'reopened'].includes(p.action)) {
    const pr = p.pull_request;
    const trusted = pr.head?.repo?.full_name?.toLowerCase() === ALLOWED_REPO && WRITERS.has(pr.author_association);
    const shipOpened = p.action === 'opened' && /^issue-\d+-/.test(pr.head.ref);
    const fast = (pr.labels || []).some((l: any) => l.name === 'ship:fast');
    const v = shipOpened ? null : await startVerify({ sha: pr.head.sha, ref: pr.head.ref, base: pr.base.ref, fast, pr: pr.number });
    if (p.action === 'synchronize') return Response.json({ verify: v });
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
      const fast = (pr.labels || []).some((l: any) => l.name === 'ship:fast');
      const [v, checks] = await Promise.all([startVerify({ sha: pr.head.sha, ref: pr.head.ref, base: pr.base.ref, fast, pr: pr.number }), startChecks(p.issue.number, pr.head.sha)]);
      return Response.json({ verify: v, checks });
    }
    if (/(^|\s)(\/fix|@claude)\b/i.test(body)) {
      // respond pushes, so only to a branch of this repository.
      const pr = await fetch(`https://api.github.com/repos/${ALLOWED_REPO}/pulls/${p.issue.number}`, { headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'orbit-factory' } }).then((r) => r.json());
      if (pr.head?.repo?.full_name?.toLowerCase() !== ALLOWED_REPO) return Response.json({ ignored: 'a fork\'s branch: the factory pushes only to this repository' });
      return Response.json(await startRespond({ pr: p.issue.number, ask: body.replace(/(^|\s)(\/fix|@claude)\b/gi, ' ').trim(), author: p.comment.user.login }, p.comment.id));
    }
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
