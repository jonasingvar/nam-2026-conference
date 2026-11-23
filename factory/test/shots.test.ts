import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureScript, choosePages, routesFrom, shotsComment } from '../lib/shots';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

test('routes come from src/App.jsx, redirects and the catch-all left out', () => {
  const r = routesFrom(app);
  assert.equal(r.HomePage, '/');
  assert.equal(r.MyAgendaPage, '/my-agenda');
  assert.equal(r.SessionPage, '/sessions/1');
  assert.equal(r.NotFoundPage, undefined);
  assert.equal(Object.values(r).includes('/my-plan'), false);
});

test('a changed page is shot on its own route', () => {
  const p = choosePages(['src/pages/MyAgendaPage.jsx', 'src/lib/agenda.js', 'tests/agenda.spec.js'], app, {
    'src/pages/MyAgendaPage.jsx': ['../lib/agenda.js', '../components/ui.jsx'],
    'src/pages/HomePage.jsx': ['../components/ui.jsx'],
  });
  assert.deepEqual(p.map((x) => x.path), ['/my-agenda']);
});

test('a changed component is shot on the pages that import it', () => {
  const p = choosePages(['src/components/SessionCard.jsx'], app, {
    'src/pages/SchedulePage.jsx': ['../components/SessionCard.jsx'],
    'src/pages/SpeakerPage.jsx': ['../components/SessionCard'],
    'src/pages/FoodPage.jsx': ['../components/ui.jsx'],
  });
  assert.deepEqual(p.map((x) => x.path).sort(), ['/schedule', '/speakers/1']);
});

test('no UI change, no pages; an unmapped UI change falls back to home; four at most', () => {
  assert.deepEqual(choosePages(['server/routes/sessions.js', 'factory/lib/x.ts', 'README.md'], app, {}), []);
  assert.deepEqual(choosePages(['src/index.css'], app, {}).map((x) => x.path), ['/']);
  const all = ['HomePage', 'SchedulePage', 'SpeakersPage', 'VenuesPage', 'FoodPage', 'ExpoPage'].map((n) => `src/pages/${n}.jsx`);
  assert.equal(choosePages(all, app, {}).length, 4);
});

test('the capture script embeds its config and takes a viewport shot and a full-page one', () => {
  const s = captureScript([{ path: '/my-agenda', label: 'MyAgendaPage.jsx' }], 'https://pr.vercel.app', 'https://prod.vercel.app');
  assert.match(s, /"after":"https:\/\/pr\.vercel\.app"/);
  assert.match(s, /orbit:currentUserId/);
  assert.match(s, /screenshot\(\{ path: process\.env\.JOB \+ '\/shots\/' \+ name \}\)/);
  assert.match(s, /screenshot\(\{ path: process\.env\.JOB \+ '\/shots\/' \+ full, fullPage: true \}\)/);
});

const agenda = [{ path: '/my-agenda', label: 'MyAgendaPage.jsx' }];

test('the comment has a before and a this-PR column, a desktop and a mobile row, each shot linking to its full page', () => {
  const body = shotsComment(27, 'abcdef1234567', agenda, [
    { path: '/my-agenda', viewport: 'desktop', which: 'before', url: 'https://b/d-before.png', full: 'https://b/d-before-full.png' },
    { path: '/my-agenda', viewport: 'desktop', which: 'after', url: 'https://b/d-after.png', full: 'https://b/d-after-full.png' },
    { path: '/my-agenda', viewport: 'mobile', which: 'after', error: 'timeout' },
  ], 'https://pr.vercel.app', 'production', 'footer');
  assert.match(body, /^\| \| Before \(production\) \| This PR \|$/m);
  assert.match(body, /^\| \*\*Desktop\*\* \| <a href="https:\/\/b\/d-before-full\.png"><img src="https:\/\/b\/d-before\.png" width="420"><\/a> \| <a href="https:\/\/b\/d-after-full\.png"><img src="https:\/\/b\/d-after\.png" width="420"><\/a> \|$/m);
  assert.match(body, /^\| \*\*Mobile\*\* \| — \| ⚠️ timeout \|$/m);
  assert.match(body, /^#### \[`\/my-agenda`\]\(https:\/\/pr\.vercel\.app\/my-agenda\)/m);
  assert.match(body, /full page/);
  assert.doesNotMatch(body, /<details>/);
  assert.match(body, /<!-- factory-shots \{"pr":27,"sha":"abcdef1234567"\} -->/);
});

test('with no base deployment, one larger this-PR column; later pages fold away', () => {
  const pages = [...agenda, { path: '/schedule', label: 'uses components/SessionCard.jsx' }];
  const body = shotsComment(27, 'abcdef1234567', pages, [
    { path: '/my-agenda', viewport: 'mobile', which: 'after', url: 'https://b/m.png' },
  ], 'https://pr.vercel.app', null, 'footer');
  assert.match(body, /^\| \| This PR \|$/m);
  assert.doesNotMatch(body, /Before/);
  assert.match(body, /<a href="https:\/\/b\/m\.png"><img src="https:\/\/b\/m\.png" width="300"><\/a>/);
  assert.equal(body.match(/<details>/g)?.length, 1);
  assert.match(body, /<details><summary><code>\/schedule<\/code>[\s\S]*#### \[`\/schedule`\][\s\S]*<\/details>/);
});
