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

test('the capture script embeds its config and the comment shows before and after', () => {
  const s = captureScript([{ path: '/my-agenda', label: 'MyAgendaPage.jsx' }], 'https://pr.vercel.app', 'https://prod.vercel.app');
  assert.match(s, /"after":"https:\/\/pr\.vercel\.app"/);
  assert.match(s, /orbit:currentUserId/);
  const body = shotsComment(27, 'abcdef1234567', [{ path: '/my-agenda', label: 'MyAgendaPage.jsx' }], [
    { path: '/my-agenda', viewport: 'desktop', which: 'after', url: 'https://b/a.png' },
    { path: '/my-agenda', viewport: 'mobile', which: 'after', error: 'timeout' },
  ], 'https://pr.vercel.app', 'production (main)', 'footer');
  assert.match(body, /<img src="https:\/\/b\/a\.png" width="480">/);
  assert.match(body, /⚠️ timeout/);
  assert.match(body, /\*\*production \(main\)\*\* \| —/);
  assert.match(body, /<!-- factory-shots /);
});
