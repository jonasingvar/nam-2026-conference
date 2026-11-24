import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * The README is the front door: someone browsing the repo on GitHub, or
 * deciding whether to fork it, should reach the engineering presentation
 * before anything else. Its links are absolute production URLs, because the
 * repo-relative `/engineering-presentation` 404s on GitHub.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');

const PRESENTATION = 'https://nam-2026-conference.vercel.app/engineering-presentation';
const APP = 'https://nam-2026-conference.vercel.app/';

// the hero is everything before the first `##`, links included
const hero = readme.split(/^## /m)[0];
const heroLinks = [...hero.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);

test('the first link in the hero is the deployed engineering presentation', () => {
  assert.equal(heroLinks[0], PRESENTATION);
});

test('the hero links the app and the presentation', () => {
  assert.ok(heroLinks.includes(PRESENTATION), `the hero does not link ${PRESENTATION}`);
  assert.ok(heroLinks.includes(APP), `the hero does not link ${APP}`);
  for (const url of heroLinks.filter((u) => u.includes('nam-2026-conference.vercel.app'))) {
    assert.equal(new URL(url).protocol, 'https:');
  }
});

test("the presentation URL's path is a `path=` in `src/App.jsx`", () => {
  assert.ok(heroLinks.includes(PRESENTATION), `the hero does not link ${PRESENTATION}`);
  const path = new URL(PRESENTATION).pathname.replace(/^\//, '');
  assert.match(app, new RegExp(`path="${path}"`));
});

test('the README is at most 35 lines, with at most 3 `##` sections', () => {
  const lines = readme.split('\n').length;
  const sections = [...readme.matchAll(/^## /gm)].length;
  assert.ok(lines <= 35, `README.md is ${lines} lines, over the budget of 35`);
  assert.ok(sections <= 3, `README.md has ${sections} ## sections, over the budget of 3`);
});
