import { put } from '@vercel/blob';
import { Sandbox } from '@vercel/sandbox';
import { ALLOWED_REPO } from './constants';
import { withPreview } from './shots';

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

/** Pin "try it" to the pull request's description (`withPreview`); no url takes it off. */
export async function pinPreview(pr: number, url: string | null, sha = '') {
  'use step';
  const p = await gh(`/pulls/${pr}`);
  const before = String(p.body ?? '');
  const body = withPreview(before, url, sha);
  if (body !== before) await gh(`/pulls/${pr}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  return true;
}
pinPreview.maxRetries = 3;
