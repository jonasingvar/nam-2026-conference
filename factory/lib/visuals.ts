import type { Job, Tier } from './models';

/**
 * Reference images: a screenshot, a sketch or a mock-up a person put in a
 * ticket, a pull request or a comment. It is the design, and the factory
 * builds it exactly.
 *
 * An image on GitHub is a link in the text, on a host no sandbox can reach.
 * So the factory fetches each one itself and puts it in the sandbox as a file
 * (`stageReferences`), tells every agent to open it and what it obliges them
 * to (`referenceRule`), puts the jobs that must look at it on a model that
 * can see (`visionFloors`), and has an auditor compare a screenshot of what
 * was built with the image.
 */
export const REFERENCE_DIR = '/vercel/.factory/reference';
export const MAX_REFERENCES = 6;

/** Where GitHub keeps what people paste into issues, pull requests and comments. */
const HOSTS = [
  /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{8,}$/i,
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/assets\/\d+\/[0-9a-f-]{8,}$/i,
  /^https:\/\/(?:private-)?user-images\.githubusercontent\.com\/[\w./%-]+(?:\?[\w=&%.~-]*)?$/i,
];

/** The images pasted into these texts, in order, each once: markdown `![](url)`, `<img src>`, or a bare attachment link. */
export function imageUrls(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const m of String(text || '').matchAll(/https:\/\/[^\s"'<>)\]]+/g)) {
      const url = m[0].replace(/[.,;]+$/, '');
      if (HOSTS.some((h) => h.test(url)) && !out.includes(url)) out.push(url);
    }
  }
  return out.slice(0, MAX_REFERENCES);
}

/** The jobs that read or judge the design: with a reference image they start on a model that can see it. */
export const SEEING_JOBS: Job[] = ['spec', 'planAudit', 'reviseSpec', 'implement', 'fix', 'audit', 'browserAudit', 'skeptic', 'respond', 'reviewLens'];
/** `strong`: the open-weights models of `standard` read text only. */
export const VISION_TIER: Tier = 2;
export const visionFloors = (hasImages: boolean): Partial<Record<Job, Tier>> =>
  hasImages ? Object.fromEntries(SEEING_JOBS.map((j) => [j, VISION_TIER])) : {};

/** What every agent is told when the request came with images. Empty when it did not. */
export function referenceRule(paths: string[]): string {
  if (!paths.length) return '';
  return `\nREFERENCE IMAGES — a hard rule. The request came with ${paths.length === 1 ? 'an image' : `${paths.length} images`}, saved in this sandbox:\n` +
    paths.map((p) => `- ${p}`).join('\n') + '\n' +
    `Open ${paths.length === 1 ? 'it' : 'each one'} with the Read tool before you do anything else, and study it: the layout, what sits beside and above what, the order, ` +
    `the proportions and spacing, every element shown and its content, the type sizes and weights, the colours, the lines and shapes — and what is NOT there. ` +
    `The image is the design. Build it exactly as drawn: do not improve it, do not substitute this app's usual look, do not add or leave out an element. ` +
    `Only the words of the request override the image, and only where they say something specific (a different page, different data, "but without X"); ` +
    `where the app has a design token for what the image shows, use the token that matches it. Anything in the image you cannot build is a Decision for the person, named — never a quiet change.\n` +
    `How to do it, step by step — follow it: context/engineering-context/harness/reference-playbook.md (the inventory to write down, the order to build in, the comparison loop, what counts as a difference).\n` +
    `- Writing the spec: add a section "## The reference" that describes each image element by element, top to bottom, precisely enough to build from without seeing it.\n` +
    `- Building or fixing: before you finish, screenshot the page you built at the reference's own size (\`npm run shot -- <route> --like=<reference image> --user=<id> [--at=…]\`, written to .screenshots/), ` +
    `Read that screenshot beside the reference, and change the code until they match.\n` +
    `- Auditing or reviewing: screenshot the built page the same way and compare it with the reference. Every difference in layout, structure, order, content or proportion ` +
    `that the words of the request did not ask for is a blocker (category criterion-unmet): name the element, what the reference shows and what was built.\n`;
}
