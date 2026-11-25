import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageUrls, MAX_REFERENCES, referenceRule, visionFloors, VISION_TIER } from '../lib/visuals';

const A = 'https://github.com/user-attachments/assets/41355025-e8c5-4f95-8dcf-35d56fe964a2';

test('the images a person pasted are found in a ticket, a pull request or a comment — each once, GitHub\'s storage only', () => {
  const body = `Make it look like the image below.\n\n<img width="1329" height="933" alt="image" src="${A}" />\n\nand ![sketch](https://user-images.githubusercontent.com/1/abc-def.png) — see ${A}.`;
  assert.deepEqual(imageUrls(body, null, `again ![x](${A})`), [A, 'https://user-images.githubusercontent.com/1/abc-def.png']);
  // Not an attachment: never fetched, whatever it calls itself.
  assert.deepEqual(imageUrls('![x](https://evil.example/a.png) http://169.254.169.254/latest https://github.com/o/r/blob/main/a.png'), []);
  assert.equal(imageUrls(Array.from({ length: 9 }, (_, i) => `https://github.com/user-attachments/assets/0000000${i}-aaaa`).join(' ')).length, MAX_REFERENCES);
});

test('with an image, every agent is told to open it and build it exactly; without one, nothing is said', () => {
  assert.equal(referenceRule([]), '');
  const rule = referenceRule(['/vercel/.factory/reference/reference-1.png']);
  assert.match(rule, /hard rule/);
  assert.match(rule, /reference-1\.png/);
  assert.match(rule, /Read tool before you do anything else/);
  assert.match(rule, /Build it exactly as drawn/);
  assert.match(rule, /Only the words of the request override the image/);
  assert.match(rule, /is a blocker/);
});

test('the jobs that must look at an image start on a model that can see', () => {
  assert.deepEqual(visionFloors(false), {});
  const f = visionFloors(true);
  for (const j of ['spec', 'implement', 'fix', 'audit', 'browserAudit', 'respond'] as const) assert.equal(f[j], VISION_TIER);
  assert.equal(f.testSelect, undefined);
});
