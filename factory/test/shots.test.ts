import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureScript, choosePages, routesFrom, shotsComment, withPreview } from '../lib/shots';
import { classify } from '../lib/select';

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
  assert.match(body, /<details><summary><a href="[^"]*\/schedule"><code>\/schedule<\/code><\/a>[\s\S]*<\/details>/);
  assert.doesNotMatch(body, /#### \[`\/schedule`\]/); // the summary is its title: no second heading
});

test('"try it" is pinned once at the top, and replaced on the next push', () => {
  const first = withPreview('What this does.', 'https://a.vercel.app', 'abcdef1234567');
  assert.match(first, /^<!-- factory-preview -->\n> \[!TIP\]\n> \*\*🔎 Try it:\*\* https:\/\/a\.vercel\.app — this pull request's Vercel preview, at abcdef1\./);
  assert.ok(first.endsWith('What this does.'));
  const second = withPreview(first, 'https://b.vercel.app', '1234567abcdef');
  assert.equal(second.match(/factory-preview -->/g)!.length, 2); // one block: its opening and closing marks
  assert.ok(!second.includes('a.vercel.app'));
});

test('with nothing to try, the tip comes off and the description is left as it was', () => {
  const pinned = withPreview('What this does.', 'https://a.vercel.app', 'abcdef1');
  assert.equal(withPreview(pinned, null), 'What this does.');
  assert.equal(withPreview('Never pinned.', null), 'Never pinned.');
});

test('a factory-and-docs pull request is not an app change; one app file makes it one', () => {
  assert.equal(classify(['factory/workflows/ship.ts', 'context/engineering-context/harness.md']).app, false);
  assert.equal(classify(['factory/workflows/ship.ts', 'src/App.jsx']).app, true);
});

import { atPath, landingPath, plainRoutes } from '../lib/shots';

test('a preview link lands on the one page a change is about; several pages, a shared file or a page needing an id is not decided here', () => {
  const app = `<Route index element={<HomePage />} /><Route path="my-agenda" element={<MyAgendaPage />} /><Route path="sessions/:id" element={<SessionPage />} /><Route path="schedule" element={<SchedulePage />} />`;
  assert.equal(landingPath(['src/pages/MyAgendaPage.jsx', 'src/components/AgendaSessionPanel.jsx', 'tests/agenda.spec.js'], app), '/my-agenda');
  assert.equal(landingPath(['src/pages/MyAgendaPage.jsx', 'src/pages/SchedulePage.jsx'], app), null);
  assert.equal(landingPath(['src/components/ui.jsx'], app), null);
  assert.equal(landingPath(['src/pages/SessionPage.jsx'], app), null);
  assert.deepEqual(plainRoutes(app), { HomePage: '/', MyAgendaPage: '/my-agenda', SchedulePage: '/schedule' });
  assert.equal(atPath('https://p.vercel.app', '/my-agenda'), 'https://p.vercel.app/my-agenda');
  assert.equal(atPath('https://p.vercel.app/', '/'), 'https://p.vercel.app/');
  assert.equal(atPath('https://p.vercel.app', null), 'https://p.vercel.app');
});

test('a pinned link that opens on a page says so; one that opens on the home page does not', () => {
  assert.match(withPreview('x', 'https://a.vercel.app/my-agenda', 'abcdef1234567'), /Try it:\*\* https:\/\/a\.vercel\.app\/my-agenda — the page this pull request changes, on its Vercel preview, at abcdef1\./);
  assert.match(withPreview('x', 'https://a.vercel.app/', 'abcdef1234567'), /— this pull request's Vercel preview/);
});
