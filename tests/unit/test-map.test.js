import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildMap, candidatesFor, executedFiles, fileOfUrl, listedTests } from '../../scripts/test-map.mjs';

/**
 * The test map decides which browser tests a pull request skips, so its
 * readers are tested on the shapes they get: V8 coverage from Chromium (Vite
 * URLs, the dev server's own code appended) and from Node, and Playwright's
 * --list report.
 */
const ROOT = '/repo';

test('a coverage URL → its repo path: Vite\'s and Node\'s, never a dependency or a test', () => {
  assert.equal(fileOfUrl('http://localhost:5173/src/pages/HomePage.jsx?t=123', ROOT), 'src/pages/HomePage.jsx');
  assert.equal(fileOfUrl('file:///repo/server/lib/seats.js', ROOT), 'server/lib/seats.js');
  assert.equal(fileOfUrl('http://localhost:5173/node_modules/.vite/deps/react.js', ROOT), null);
  assert.equal(fileOfUrl('file:///elsewhere/server/x.js', ROOT), null);
  assert.equal(fileOfUrl('file:///repo/tests/helpers.js', ROOT), null);
  assert.equal(fileOfUrl('node:internal/x', ROOT), null);
});

test('a file counts when one of its functions ran — not when it was only loaded, nor for the dev server\'s Fast Refresh code', () => {
  const src = 'export function Page() {}\nimport.meta.hot.accept(() => { RefreshRuntime.x() })';
  const fn = (name, start, end, count) => ({ functionName: name, ranges: [{ startOffset: start, endOffset: end, count }] });
  const entries = [
    { url: 'http://localhost:5173/src/pages/A.jsx', source: src, functions: [fn('', 0, src.length, 1), fn('Page', 7, 25, 2)] },
    { url: 'http://localhost:5173/src/pages/B.jsx', source: src, functions: [fn('', 0, src.length, 1), fn('Page', 7, 25, 0)] },
    { url: 'http://localhost:5173/src/pages/C.jsx', source: src, functions: [fn('', 0, src.length, 1), fn('', 43, src.length - 1, 1)] },
  ];
  assert.deepEqual(executedFiles(entries, ROOT), ['src/pages/A.jsx']);
});

const map = buildMap({
  sha: 'abc', seconds: 1, known: ['src/pages/MyAgendaPage.jsx', 'src/lib/api.js', 'server/lib/seats.js'],
  unit: [{ test: 'tests/api/seats.test.js', files: ['server/lib/seats.js'] }],
  browser: [
    { project: 'desktop', file: 'home.spec.js', title: 'My Agenda › it lists', files: ['src/pages/MyAgendaPage.jsx', 'src/lib/api.js'] },
    { project: 'mobile', file: 'home.spec.js', title: 'My Agenda › it lists', files: ['src/pages/MyAgendaPage.jsx'] },
    { project: 'desktop', file: 'seats.spec.js', title: 'takes a seat', files: ['server/lib/seats.js', 'src/lib/api.js'] },
  ],
});

test('the map names each test once and points each file at the tests that ran it', () => {
  assert.deepEqual(map.tests.desktop, ['home.spec.js › My Agenda › it lists', 'seats.spec.js › takes a seat']);
  assert.deepEqual(map.files['src/lib/api.js'], { desktop: [0, 1] });
  assert.deepEqual(map.files['server/lib/seats.js'], { unit: [0], desktop: [1] });
});

test('candidates: per project, the titles that ran a changed file; which changed file reaches each spec; files the map never saw', () => {
  const c = candidatesFor(map, ['src/pages/MyAgendaPage.jsx', 'src/lib/new.js', 'context/x.md']);
  assert.deepEqual(c.desktop, { 'tests/home.spec.js': ['My Agenda › it lists'] });
  assert.deepEqual(c.mobile, { 'tests/home.spec.js': ['My Agenda › it lists'] });
  assert.deepEqual(c.reach, { 'tests/home.spec.js': ['src/pages/MyAgendaPage.jsx'] });
  assert.deepEqual(c.unmapped, ['src/lib/new.js']);
  assert.deepEqual(candidatesFor(map, ['server/lib/seats.js']).unit, ['tests/api/seats.test.js']);
});

test('the --list report → every test per project, with its describe path and line', () => {
  const report = { suites: [{ title: 'home.spec.js', file: 'home.spec.js', specs: [], suites: [{ title: 'My Agenda', specs: [{ title: 'it lists', file: 'home.spec.js', line: 12, tests: [{ projectName: 'desktop' }, { projectName: 'mobile' }] }] }] }] };
  assert.deepEqual(listedTests(report).mobile, [{ spec: 'tests/home.spec.js', line: 12, title: 'My Agenda › it lists' }]);
});

test('every spec takes `test` from tests/fixtures.js, so the map sees what it runs', () => {
  const specs = readdirSync('tests').filter((f) => f.endsWith('.spec.js') && f !== 'qa-probe.spec.js');
  const direct = specs.filter((f) => /from '@playwright\/test'/.test(readFileSync(`tests/${f}`, 'utf8')));
  assert.deepEqual(direct, []);
});
