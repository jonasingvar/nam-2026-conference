import { put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';
import { ALLOWED_REPO } from './constants';
import { experimental_decide as decide } from 'ai';
import { atPath, landingPath, plainRoutes, showsInApp, withPreview } from './shots';

/**
 * Copy the screenshots (each viewport shot and its full-page one) out of the sandbox into the public Blob store
 * (orbit-pr-media) — the sandbox holds no Blob token — under
 * `pr-<n>/<sha>/`, so each push keeps its own set and a comment never shows
 * images from a later commit.
 */
export async function uploadShots(sandbox: string, dir: string, pr: number, sha: string, shots: { file?: string; full?: string }[]) {
  'use step';
  const sb = await Sandbox.get({ name: sandbox });
  const urls: Record<string, string> = {};
  for (const file of shots.flatMap((s) => [s.file, s.full])) {
    if (!file) continue;
    const buf = await sb.readFileToBuffer({ path: `${dir}/${file}` });
    if (!buf) continue;
    const blob = await put(`pr-${pr}/${sha.slice(0, 12)}/${file}`, buf, {
      access: 'public', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: true,
    });
    urls[file] = blob.url;
  }
  return urls;
}
uploadShots.maxRetries = 3;

const gh = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`https://api.github.com/repos/${ALLOWED_REPO}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'orbit-factory' },
  });
  if (!r.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${r.status}`);
  return r.json();
};

/** One screenshots comment per pull request, replaced on every push. Its `<!-- factory-shots` marker also tells the webhook the comment is the factory's own. */
export async function postShots(pr: number, body: string) {
  'use step';
  const comments: any[] = await gh(`/issues/${pr}/comments?per_page=100`);
  const mine = comments.find((c) => (c.body || '').includes('<!-- factory-shots '));
  if (mine) {
    await gh(`/issues/comments/${mine.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    return mine.html_url as string;
  }
  return (await gh(`/issues/${pr}/comments`, { method: 'POST', body: JSON.stringify({ body }) })).html_url as string;
}
postShots.maxRetries = 3;

/**
 * The page a preview link for this pull request should open on — where the change is, not the home page.
 * One changed page with a plain route decides it. Otherwise Jev picks among the app's plain routes from the
 * title and the files changed, and under 60% sure it stays home. Never throws: no answer is home.
 */
export async function landingFor(pr: number, sha = ''): Promise<{ path: string; why: string }> {
  'use step';
  try {
    const p = await gh(`/pulls/${pr}`);
    const files: string[] = (await gh(`/pulls/${pr}/files?per_page=100`)).map((f: any) => String(f.filename));
    const ref = sha || p.head.sha;
    const app = Buffer.from(String((await gh(`/contents/src/App.jsx?ref=${ref}`)).content || ''), 'base64').toString('utf8');
    const one = landingPath(files, app);
    if (one) return { path: one, why: 'the one page it changes' };
    const routes = plainRoutes(app);
    if (!files.some((f) => f.startsWith('src/')) || Object.keys(routes).length < 2) return { path: '/', why: 'no page of its own' };
    const d: any = await decide({
      model: 'typesafe-ai/jev',
      ...(process.env.JEV_API_KEY && { providerOptions: { gateway: { byok: { 'typesafe-ai': [{ apiKey: process.env.JEV_API_KEY }] } } } }),
      state: `Pull request "${p.title}" to a conference web app.\n\n${String(p.body || '').replace(/<!--[\s\S]*?-->/g, '').slice(0, 2000)}\n\nFiles changed:\n${files.slice(0, 60).map((f) => `- ${f}`).join('\n')}`.slice(0, 6000),
      questions: { page: {
        type: 'choice',
        instructions: 'A person will click one link to see this change in the running app. Which page should it open on?',
        criteria: Object.fromEntries(Object.entries(routes).map(([component, path]) => [path, `The ${component.replace(/Page$/, '')} page, at ${path}`])),
      } },
    } as any);
    const a = d.answers.page;
    const sure = a.probabilities?.[a.choice] ?? 0;
    return sure >= 0.6 && typeof a.choice === 'string' && Object.values(routes).includes(a.choice)
      ? { path: a.choice, why: `Jev, ${Math.round(sure * 100)}% sure` }
      : { path: '/', why: 'Jev could not say which page' };
  } catch (e: any) {
    return { path: '/', why: `not worked out (${String(e?.message || e).slice(0, 80)})` };
  }
}
landingFor.maxRetries = 1;

/** A pull request's preview, at the page it changes. */
export async function previewLink(pr: number, url: string, sha = '') {
  const where = await landingFor(pr, sha);
  return atPath(url, where.path);
}

/** Pin "try it" to the pull request's description (`withPreview`); no url takes it off. */
export async function pinPreview(pr: number, url: string | null, sha = '') {
  'use step';
  const p = await gh(`/pulls/${pr}`);
  const before = String(p.body ?? '');
  // Only for a change the deployed app would show: a pull request to the factory, a script or the tests
  // gets no link (and loses one pinned earlier). The link opens on the page the change is about.
  const files: string[] | null = url ? await gh(`/pulls/${pr}/files?per_page=100`).then((l: any[]) => l.map((f) => String(f.filename))).catch(() => null) : null;
  const offer = url && (!files || files.length >= 100 || showsInApp(files)) ? url : null;
  const body = withPreview(before, offer ? atPath(offer, (await landingFor(pr, sha).catch(() => ({ path: '/' }))).path) : null, sha);
  if (body !== before) await gh(`/pulls/${pr}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  return true;
}
pinPreview.maxRetries = 3;
