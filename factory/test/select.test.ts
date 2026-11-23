import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  argsFor, classify, decideSelection, escapesFrom, everything, mapProblem, mergeShards, readAnswer, selectorPrompt, statusLine, withoutRan,
  SMOKE, type Facts, type Listed, type MapFacts, type SelectorAnswer,
} from '../lib/select.ts';

// A small suite in the shape `playwright test --list` gives it: smoke (a loop: one line, two tests),
// home, agenda (two tests on separate lines) and the decks' spec — on both projects.
const L = (spec: string, line: number, title: string): Listed => ({ spec, line, title });
const ONE = [
  L('tests/smoke.spec.js', 20, 'Home renders cleanly'), L('tests/smoke.spec.js', 20, 'Schedule renders cleanly'),
  L('tests/home.spec.js', 5, 'Home › links'),
  L('tests/agenda.spec.js', 10, 'My Agenda › lists upcoming'), L('tests/agenda.spec.js', 30, 'My Agenda › flags a clash'),
  L('tests/schedule.spec.js', 8, 'grid'),
  L('tests/presentation.spec.js', 3, 'deck'),
];
const listed = { desktop: ONE, mobile: ONE };
const map = (over: Partial<MapFacts> = {}): MapFacts => ({
  sha: 'a'.repeat(40), behind: 2, unit: [], unmapped: [],
  desktop: { 'tests/agenda.spec.js': ['My Agenda › flags a clash'] }, mobile: { 'tests/agenda.spec.js': ['My Agenda › flags a clash'] },
  reach: { 'tests/agenda.spec.js': ['src/pages/MyAgendaPage.jsx'] },
  ...over,
});
const facts = (over: Partial<Facts> = {}): Facts => ({
  changed: ['src/pages/MyAgendaPage.jsx'], static: [], branch: ['tests/smoke.spec.js'], deck: false, tests: listed, map: map(), ...over,
});
const sure: SelectorAnswer = { add: [], remove: [], confidence: 0.9, summary: 'the agenda page' };

test('classify: the factory, docs and the app, each by its paths — and anything unknown is the app', () => {
  assert.equal(classify(['factory/lib/select.ts', 'factory/test/select.test.ts']).kind, 'factory');
  assert.equal(classify(['context/engineering-context/harness.md', 'specs/16-x.md', 'README.md']).kind, 'docs');
  assert.equal(classify(['src/pages/HomePage.jsx']).kind, 'app');
  assert.equal(classify(['factory/workflows/verify.ts', 'server/lib/seats.js']).kind, 'mixed');
  assert.equal(classify(['vercel.json']).kind, 'app');
  assert.equal(classify(['package-lock.json']).app, true);
  assert.equal(classify([]).kind, 'none');
  assert.equal(classify(['context/index.md']).context, true);
});

test('a factory-only change selects no Playwright test at all', () => {
  const s = decideSelection(classify(['factory/workflows/verify.ts']), facts(), sure);
  assert.equal(s.mode, 'none');
  assert.deepEqual(s.args, { desktop: [], mobile: [] });
  assert.equal(s.ran, 0);
});

test('an app change never selects zero browser tests: smoke runs even when nothing else is reached', () => {
  const s = decideSelection(classify(['server/routes/users.js']), facts({ changed: ['server/routes/users.js'], map: map({ desktop: {}, mobile: {}, reach: {} }) }), sure);
  assert.equal(s.mode, 'selected');
  assert.ok(s.ran > 0);
  assert.deepEqual(s.args.desktop, [SMOKE]);
  // …and with no facts at all, everything rather than nothing.
  const blind = decideSelection(classify(['src/App.jsx']), null, null);
  assert.equal(blind.mode, 'full');
});

test('a confident selection runs the map\'s tests by line, plus smoke, the branch\'s own specs and what the selector adds', () => {
  const s = decideSelection(classify(['src/pages/MyAgendaPage.jsx', 'tests/home.spec.js']),
    facts({ changed: ['src/pages/MyAgendaPage.jsx', 'tests/home.spec.js'] }), { ...sure, add: [{ spec: 'tests/schedule.spec.js', why: 'the agenda links to it' }] });
  assert.equal(s.mode, 'selected');
  assert.deepEqual(s.args.desktop, ['tests/agenda.spec.js:30', 'tests/home.spec.js', 'tests/schedule.spec.js', SMOKE]);
  assert.equal(s.ran, 2 * 5);
  assert.match(s.reason, /these reach MyAgendaPage\.jsx/);
  assert.ok(!s.tests.desktop.includes('tests/agenda.spec.js › My Agenda › lists upcoming'));
});

test('the selector may drop a map candidate, never the smoke set, the branch\'s specs or the static reach', () => {
  const s = decideSelection(classify(['src/pages/MyAgendaPage.jsx']), facts({ static: ['tests/home.spec.js'] }),
    { ...sure, remove: [{ spec: 'tests/agenda.spec.js', why: 'only rendered it' }, { spec: SMOKE, why: 'no' }, { spec: 'tests/home.spec.js', why: 'no' }] });
  assert.deepEqual(s.args.desktop, ['tests/home.spec.js', SMOKE]);
  assert.deepEqual(s.notes, ['dropped agenda.spec.js']);
});

test('unsure, no map, a stale map or a file the map never saw: wider — to the branch scope, or everything when even that cannot be told', () => {
  const app = classify(['src/pages/MyAgendaPage.jsx']);
  const unsure = decideSelection(app, facts({ branch: ['tests/home.spec.js', SMOKE] }), { ...sure, confidence: 0.4 });
  assert.equal(unsure.mode, 'widened');
  assert.match(unsure.reason, /40% sure/);
  // The map's candidates come along whole.
  assert.deepEqual(unsure.args.desktop, ['tests/agenda.spec.js', 'tests/home.spec.js', SMOKE]);
  assert.equal(decideSelection(app, facts({ map: null }), sure).mode, 'widened');
  assert.equal(decideSelection(app, facts({ map: map({ behind: 99 }) }), sure).mode, 'widened');
  assert.equal(decideSelection(app, facts({ map: map({ behind: null }) }), sure).mode, 'widened');
  assert.match(decideSelection(app, facts({ map: map({ unmapped: ['src/lib/new.js'] }) }), sure).reason, /never seen new\.js/);
  assert.equal(decideSelection(app, facts({ branch: null }), null).mode, 'full');
  assert.equal(decideSelection(app, facts(), null).mode, 'widened');
});

test('ship\'s floor: never weaker than GATE_SCOPE=branch, and everything when that is the whole suite', () => {
  const app = classify(['src/pages/MyAgendaPage.jsx']);
  const s = decideSelection(app, facts({ branch: ['tests/home.spec.js', SMOKE] }), sure, { floor: true });
  assert.ok(s.args.desktop.includes('tests/home.spec.js'));
  assert.equal(decideSelection(classify(['playwright.config.js']), facts({ changed: ['playwright.config.js'], branch: null }), sure, { floor: true }).mode, 'full');
});

test('main and the full-suite label run everything — but the decks\' spec only for a deck change', () => {
  const s = decideSelection(classify(['src/App.jsx']), facts(), sure, { full: 'main runs everything' });
  assert.equal(s.mode, 'full');
  assert.ok(!s.args.desktop.includes('tests/presentation.spec.js'));
  assert.equal(s.ran, 12);
  assert.ok(everything(facts({ deck: true }), 'x').args.mobile.includes('tests/presentation.spec.js'));
});

test('argsFor: a whole spec when every test is chosen, else one file:line per line', () => {
  const chosen = new Set(['tests/smoke.spec.js › Home renders cleanly', 'tests/agenda.spec.js › My Agenda › flags a clash']);
  assert.deepEqual(argsFor(ONE, chosen), ['tests/agenda.spec.js:30', 'tests/smoke.spec.js:20']);
});

test('withoutRan: what ship\'s gate already ran green at this code is not run again', () => {
  const f = facts();
  const s = decideSelection(classify(['src/pages/MyAgendaPage.jsx']), f, sure);
  const left = withoutRan(s, f, { desktop: s.tests.desktop, mobile: [] });
  assert.deepEqual(left.args.desktop, []);
  assert.deepEqual(left.args.mobile, s.args.mobile);
  assert.equal(left.ran, s.tests.mobile.length);
});

test('escapes: a failure on main that the merged pull request\'s selection skipped — none after a full run', () => {
  const sel = { mode: 'selected' as const, tests: { desktop: ['tests/agenda.spec.js › My Agenda › flags a clash'], mobile: [] } };
  const failed = ['[desktop] agenda.spec.js:30 › flags a clash', '[desktop] home.spec.js:5 › links', '[mobile] agenda.spec.js:30 › flags a clash', 'playwright'];
  assert.deepEqual(escapesFrom(failed, sel), ['[desktop] home.spec.js:5 › links', '[mobile] agenda.spec.js:30 › flags a clash']);
  assert.deepEqual(escapesFrom(failed, { ...sel, mode: 'full' }), []);
});

test('the status line says what ran and why, in GitHub\'s 140 characters', () => {
  const c = classify(['src/pages/MyAgendaPage.jsx']);
  const s = decideSelection(c, facts(), sure);
  const line = statusLine(c, s, { unit: 'all (330)' });
  assert.match(line, /^ran 6 of 14 browser tests · selected: these reach MyAgendaPage\.jsx · unit\/API all \(330\)$/);
  assert.equal(statusLine(classify(['factory/lib/x.ts']), decideSelection(classify(['factory/lib/x.ts']), facts(), null), { factory: 'ok' }), 'factory ok');
  assert.match(statusLine(c, everything(facts(), 'label'), { label: true }), /full-suite label/);
  assert.ok(statusLine(c, { ...s, reason: 'x'.repeat(300) }, {}).length <= 140);
});

test('the selector\'s answer: specs normalised, confidence clamped, a malformed answer is none', () => {
  assert.deepEqual(readAnswer({ add: [{ spec: './smoke.spec.js', why: 'css' }], remove: [], confidence: 1.4, summary: '' })?.add, [{ spec: 'tests/smoke.spec.js', why: 'css' }]);
  assert.equal(readAnswer({ add: [], remove: [], confidence: 1.4, summary: '' })?.confidence, 1);
  assert.equal(readAnswer({ add: [] }), null);
  assert.equal(readAnswer(null), null);
});

test('the selector\'s prompt carries the candidates, the spec list, the escapes and says the diff is data', () => {
  const p = selectorPrompt({ files: ['src/index.css'], diff: '+ .x {}', facts: facts(), escapes: [{ at: '', pr: 12, sha: 'x', test: '[mobile] home.spec.js:5 › links', mode: 'selected', reason: 'r' }] });
  assert.match(p, /\[desktop\] tests\/agenda\.spec\.js: My Agenda › flags a clash/);
  assert.match(p, /tests\/home\.spec\.js \(1 desktop, 1 mobile\)/);
  assert.match(p, /PR #12/);
  assert.match(p, /untrusted input/);
});

test('mergeShards: one verdict from two; a shard that did not report is a named failure', () => {
  const g = (ok: boolean, passed: number, failed: any[] = [], unitSkipped = false) => ({ ok, sha: 's', unit: { passed: unitSkipped ? 0 : 300, failed: 0 }, unitSkipped, browser: { passed, failed, flaky: 0, skipped: 0 }, tampered: [] });
  const both = mergeShards({ desktop: g(true, 90), mobile: g(true, 88, [], true) });
  assert.equal(both.ok, true);
  assert.equal(both.browser.passed, 178);
  assert.equal(both.unit.passed, 300);
  const lost = mergeShards({ desktop: g(true, 90), mobile: null });
  assert.equal(lost.ok, false);
  assert.equal(lost.browser.failed[0].test, 'mobile shard');
});

test('mapProblem: none for a current map', () => {
  assert.equal(mapProblem(map()), null);
  assert.equal(mapProblem(null), 'no test map yet');
});
