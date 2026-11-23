import { getWorkflowMetadata, setAttributes, sleep } from 'workflow';
import { kit, checkoutPr } from '../lib/kit';
import { allowPreviews, disposeSandbox, prepareSandbox } from '../lib/sandbox-steps';
import { findDeployment, previewForPr, readPullRequest, setStatus } from '../lib/github-steps';
import { FACTORY_DASHBOARD, PRODUCTION_URL } from '../lib/constants';
import { captureScript, choosePages, pagesScript, shotsComment, type Uploaded } from '../lib/shots';
import { pinPreview, postShots, uploadShots } from '../lib/shots-steps';

/**
 * shots — screenshots of what a pull request changes, on its real preview.
 *
 * A pull request that changes the UI gets one comment with each page it
 * touches, desktop and mobile, as this PR's preview shows it and as the base
 * does (production, for main), so a reviewer sees the change without opening
 * anything. Images go to the public Blob store `orbit-pr-media`. No model, no
 * credentials: the pages come from the diff and src/App.jsx, and a browser in
 * the sandbox takes the pictures. Ship runs it beside review and QA; it also
 * runs whenever review and QA do, and on `/screenshots`.
 */
export type ShotsInput = { pr: number };

export async function shots(input: ShotsInput) {
  'use workflow';
  const { workflowRunId } = getWorkflowMetadata();
  const box = `shots-${input.pr}-${workflowRunId.slice(-8).toLowerCase()}`;
  try {
    const r = await shotsRun(input, box, workflowRunId);
    await setAttributes({ outcome: r.outcome, ...(r.pages ? { pages: String(r.pages) } : {}) });
    return r;
  } catch (e: any) {
    const why = String(e?.message || e).slice(0, 140);
    await disposeSandbox(box).catch(() => null);
    const pr = await readPullRequest(input.pr).catch(() => null);
    if (pr) await setStatus(pr.headSha, 'factory/screenshots', 'error', why, `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`).catch(() => null);
    await setAttributes({ outcome: 'crashed' });
    return { outcome: 'crashed', reason: why };
  }
}

async function shotsRun(input: ShotsInput, box: string, workflowRunId: string): Promise<{ outcome: string; pages?: number; url?: string; reason?: string }> {
  const runUrl = `${FACTORY_DASHBOARD}/workflows/runs/${workflowRunId}`;
  const pr = await readPullRequest(input.pr);
  await setAttributes({ pr: String(pr.number), sha: pr.headSha.slice(0, 12), ...(pr.issue ? { issue: String(pr.issue) } : {}) });
  if (pr.state !== 'open') return { outcome: 'skipped', reason: 'not open' };

  let preview = await previewForPr(pr.number);
  for (let i = 0; i < 45 && (preview.state === 'pending' || preview.state === 'none'); i++) { await sleep('20s'); preview = await previewForPr(pr.number); }
  if (preview.state !== 'ready') {
    await setStatus(pr.headSha, 'factory/screenshots', 'error', `No preview to shoot (${preview.state})`, runUrl);
    return { outcome: 'no-preview', reason: preview.state };
  }
  const previewUrl = preview.url!;
  await pinPreview(pr.number, previewUrl, preview.sha ?? pr.headSha).catch(() => null);
  await setStatus(pr.headSha, 'factory/screenshots', 'pending', 'Taking screenshots…', runUrl);

  const k = kit(box, `Screenshots of pull request #${pr.number}`, 'read'); // the mode is only an agent preamble; shots runs no agent, in a 'none' sandbox
  await prepareSandbox(box, pr.headSha, 'none');
  const co = await k.command('checkout', checkoutPr(pr.number, pr.head, pr.base));
  if (!co) throw new Error('could not check out the pull request');

  const found = await k.command('pages', pagesScript(pr.base));
  const pages = found ? choosePages(found.changed ?? [], found.app ?? '', found.pageImports ?? {}) : [];
  if (!pages.length) {
    await disposeSandbox(box);
    await setStatus(pr.headSha, 'factory/screenshots', 'success', 'No UI change — nothing to show', runUrl);
    return { outcome: 'no-ui-change' };
  }
  k.log(`pages: ${pages.map((p) => `${p.path} (${p.label})`).join(', ')}`);

  const before = (await findDeployment(co.base, 'Preview')).url ?? (pr.base === 'main' ? PRODUCTION_URL : null);
  const beforeLabel = before ? (pr.base === 'main' ? 'production (main)' : pr.base) : null;
  await allowPreviews(box, [previewUrl, ...(before ? [before] : [])]);

  const shot = await k.command('shoot', captureScript(pages, previewUrl, before));
  const taken: any[] = shot?.shots ?? [];
  const urls = shot?.dir ? await uploadShots(box, shot.dir, pr.number, pr.headSha, taken) : {};
  await disposeSandbox(box);

  const uploaded: Uploaded[] = taken.map((s) => ({ path: s.path, viewport: s.viewport, which: s.which, url: s.file ? urls[s.file] : undefined, error: s.error }));
  const ok = uploaded.filter((s) => s.which === 'after' && s.url).length;
  if (!ok) {
    await setStatus(pr.headSha, 'factory/screenshots', 'error', shot?.error ? `Capture failed: ${shot.error}`.slice(0, 140) : 'No screenshot could be taken', runUrl);
    return { outcome: 'failed', pages: pages.length, reason: shot?.error };
  }
  const url = await postShots(pr.number, shotsComment(pr.number, pr.headSha, pages, uploaded, previewUrl, beforeLabel, `🏭 Factory screenshots · [run](${runUrl})`));
  await setStatus(pr.headSha, 'factory/screenshots', 'success', `${pages.length} page${pages.length === 1 ? '' : 's'}, desktop and mobile`, url);
  return { outcome: 'posted', pages: pages.length, url };
}
