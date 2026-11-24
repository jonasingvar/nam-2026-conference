import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  argsFor, breakdownLine, classify, decideSelection, escapesFrom, everything, mapProblem, mergeShards, readAnswer, selectorPrompt, statusLine, withoutRan,
  SMOKE_SET, type Facts, type Listed, type MapFacts, type SelectorAnswer,
} from '../lib/select.ts';

// A small suite in the shape `playwright test --list` gives it, on both projects: the smoke set's five
// tests (two of smoke's come from one loop line), home, agenda (two tests), schedule and the decks' spec.
const L = (spec: string, line: number, title: string): Listed => ({ spec, line, title });
const ONE = [
  ...SMOKE_SET.map((s, i) => L(s.spec, s.spec === 'tests/smoke.spec.js' ? 20 : 40 + i, s.title)),
  L('tests/smoke.spec.js', 20, 'Schedule renders cleanly'),
  L('tests/home.spec.js', 5, 'Home › links'),
  L('tests/agenda.spec.js', 10, 'My Agenda › lists upcoming'), L('tests/agenda.spec.js', 30, 'My Agenda › flags a clash'),
  L('tests/schedule.spec.js', 8, 'grid'),
  L('tests/presentation.spec.js', 3, 'deck'),
];
const listed = { desktop: ONE, mobile: ONE };
const SUITE = ONE.length - 1; // the deck only counts for a deck change
const map = (over: Partial<MapFacts> = {}): MapFacts => ({
  sha: 'a'.repeat(40), behind: 2, unit: [], unmapped: [],
  desktop: { 'tests/agenda.spec.js': ['My Agenda › flags a clash'] }, mobile: { 'tests/agenda.spec.js': ['My Agenda › flags a clash'] },
  reach: { 'tests/agenda.spec.js': ['src/pages/MyAgendaPage.jsx'] },
  ...over,
});
const facts = (over: Partial<Facts> = {}): Facts => ({
  changed: ['src/pages/MyAgendaPage.jsx'], static: ['tests/home.spec.js', 'tests/schedule.spec.js'], branch: ['tests/home.spec.js', 'tests/schedule.spec.js'],
  deck: false, tests: listed, map: map(), ...over,
});
const sure: SelectorAnswer = { add: [], remove: [], confidence: 0.9, summary: 'the agenda page' };
const app = classify(['src/pages/MyAgendaPage.jsx']);

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

test('an app change never selects zero browser tests: the smoke set runs even when nothing else is reached', () => {
  const s = decideSelection(classify(['server/routes/users.js']), facts({ changed: ['server/routes/users.js'], map: map({ desktop: {}, mobile: {}, reach: {} }) }), sure);
  assert.equal(s.mode, 'selected');
  assert.equal(s.ran, SMOKE_SET.length);
  assert.deepEqual(s.breakdown, { smoke: SMOKE_SET.length });
  // …and with no facts at all, everything rather than nothing.
  assert.equal(decideSelection(classify(['src/App.jsx']), null, null).mode, 'full');
});

test('a current map is the evidence: its tests by title and the smoke set — the import graph\'s reach does not widen it', () => {
  const s = decideSelection(app, facts(), sure);
  assert.equal(s.mode, 'selected');
  assert.equal(s.ran, 1 + SMOKE_SET.length);
  assert.equal(s.total, SUITE);
  assert.deepEqual(s.breakdown, { smoke: 5, map: 1 });
  assert.ok(!s.args.desktop.includes('tests/home.spec.js') && !s.args.desktop.includes('tests/schedule.spec.js'));
  assert.match(s.reason, /these reach MyAgendaPage\.jsx/);
  // The exact tests, by title: smoke's loop line holds two tests and only one is chosen.
  assert.match(s.grep.desktop!, /^\^desktop \(/);
  assert.ok(s.grep.desktop!.includes('smoke\\.spec\\.js Home renders cleanly'));
  assert.ok(!s.grep.desktop!.includes('Schedule renders cleanly'));
  assert.ok(s.grep.mobile!.startsWith('^mobile ('));
});

test('the branch\'s own specs run whole, and the selector\'s additions too', () => {
  const s = decideSelection(classify(['src/pages/MyAgendaPage.jsx', 'tests/home.spec.js']),
    facts({ changed: ['src/pages/MyAgendaPage.jsx', 'tests/home.spec.js'] }), { ...sure, add: [{ spec: 'tests/schedule.spec.js', why: 'the agenda links to it' }] });
  assert.deepEqual(s.breakdown, { smoke: 5, own: 1, map: 1, added: 1 });
  assert.equal(breakdownLine(s), 'map 1 · smoke 5 · own 1 · added 1');
});

test('the selector may drop a map candidate, never the smoke set or the branch\'s own specs', () => {
  const s = decideSelection(app, facts(), { ...sure, remove: [{ spec: 'tests/agenda.spec.js', why: 'only rendered it' }, { spec: 'tests/smoke.spec.js', why: 'no' }] });
  assert.deepEqual(s.breakdown, { smoke: 5 });
  assert.deepEqual(s.notes, ['dropped agenda.spec.js, smoke.spec.js']);
});

test('unsure, no map, a stale map or a file the map never saw: wider — to the branch scope, or everything when even that cannot be told', () => {
  const unsure = decideSelection(app, facts(), { ...sure, confidence: 0.4 });
  assert.equal(unsure.mode, 'widened');
  assert.match(unsure.reason, /40% sure/);
  // The branch scope and the map's candidates come along whole.
  assert.deepEqual(unsure.args.desktop, ['tests/agenda.spec.js', 'tests/attendance.spec.js', 'tests/home.spec.js', 'tests/schedule.spec.js', 'tests/seats.spec.js', 'tests/smoke.spec.js']);
  assert.equal(decideSelection(app, facts({ map: null }), sure).mode, 'widened');
  assert.equal(decideSelection(app, facts({ map: map({ behind: 99 }) }), sure).mode, 'widened');
  assert.equal(decideSelection(app, facts({ map: map({ behind: null }) }), sure).mode, 'widened');
  assert.match(decideSelection(app, facts({ map: map({ unmapped: ['src/lib/new.js'] }) }), sure).reason, /never seen new\.js/);
  assert.equal(decideSelection(app, facts({ branch: null }), null).mode, 'full');
  assert.equal(decideSelection(app, facts(), null).mode, 'widened');
});

test('ship\'s floor: never weaker than GATE_SCOPE=branch, and everything when that is the whole suite', () => {
  const s = decideSelection(app, facts(), sure, { floor: true });
  assert.ok(s.args.desktop.includes('tests/home.spec.js'));
  assert.equal(s.breakdown.floor, 2);
  assert.equal(decideSelection(classify(['playwright.config.js']), facts({ changed: ['playwright.config.js'], branch: null }), sure, { floor: true }).mode, 'full');
});

test('main and the full-suite label run everything — but the decks\' spec only for a deck change', () => {
  const s = decideSelection(classify(['src/App.jsx']), facts(), sure, { full: 'main runs everything' });
  assert.equal(s.mode, 'full');
  assert.ok(!s.args.desktop.includes('tests/presentation.spec.js'));
  assert.equal(s.ran, SUITE);
  assert.deepEqual(s.grep, { desktop: null, mobile: null });
  assert.ok(everything(facts({ deck: true }), 'x').args.mobile.includes('tests/presentation.spec.js'));
});

test('argsFor: the spec files, and a grep of the exact titles unless every test of them is chosen', () => {
  const some = argsFor('desktop', ONE, new Set(['tests/agenda.spec.js › My Agenda › flags a clash']));
  assert.deepEqual(some.args, ['tests/agenda.spec.js']);
  assert.equal(some.grep, '^desktop (agenda\\.spec\\.js My Agenda flags a clash)$');
  assert.ok(new RegExp(some.grep!).test('desktop agenda.spec.js My Agenda flags a clash'));
  const all = argsFor('mobile', ONE, new Set(['tests/agenda.spec.js › My Agenda › flags a clash', 'tests/agenda.spec.js › My Agenda › lists upcoming']));
  assert.equal(all.grep, null);
});

test('withoutRan: what ship\'s gate already ran green at this code is not run again', () => {
  const f = facts();
  const s = decideSelection(app, f, sure);
  const left = withoutRan(s, f, { desktop: s.tests.desktop, mobile: [] });
  assert.deepEqual(left.args.desktop, []);
  assert.deepEqual(left.args.mobile, s.args.mobile);
  assert.equal(left.ran, s.ran);
  const none = withoutRan(s, f, s.tests);
  assert.equal(none.ran, 0);
});

test('escapes: a failure on main that the merged pull request\'s selection skipped — none after a full run', () => {
  const sel = { mode: 'selected' as const, tests: { desktop: ['tests/agenda.spec.js › My Agenda › flags a clash'], mobile: [] } };
  const failed = ['[desktop] agenda.spec.js:30 › flags a clash', '[desktop] home.spec.js:5 › links', '[mobile] agenda.spec.js:30 › flags a clash', 'playwright'];
  assert.deepEqual(escapesFrom(failed, sel), ['[desktop] home.spec.js:5 › links', '[mobile] agenda.spec.js:30 › flags a clash']);
  assert.deepEqual(escapesFrom(failed, { ...sel, mode: 'full' }), []);
});

test('the status line says what ran, what brought it in and why, in GitHub\'s 140 characters', () => {
  const s = decideSelection(app, facts(), sure);
  assert.equal(statusLine(app, s, { unit: 'all (330)' }), `ran 6 of ${SUITE} browser tests (map 1, smoke 5) · selected: these reach MyAgendaPage.jsx · unit/API all (330)`);
  assert.equal(statusLine(classify(['factory/lib/x.ts']), decideSelection(classify(['factory/lib/x.ts']), facts(), null), { factory: 'ok' }), 'factory ok');
  assert.match(statusLine(app, everything(facts(), 'label'), { label: true }), /full-suite label/);
  assert.ok(statusLine(app, { ...s, reason: 'x'.repeat(300) }, {}).length <= 140);
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
  const g = (ok: boolean, passed: number, failed: any[] = [], unitSkipped = false, addedNeverRan: any[] = []) =>
    ({ ok, sha: 's', unit: { passed: unitSkipped ? 0 : 300, failed: 0 }, unitSkipped, browser: { passed, failed, flaky: 0, skipped: 0, addedNeverRan }, tampered: [] });
  const both = mergeShards({ desktop: g(true, 90), mobile: g(true, 88, [], true) });
  assert.equal(both.ok, true);
  assert.equal(both.browser.passed, 178);
  assert.equal(both.unit.passed, 300);
  const lost = mergeShards({ desktop: g(true, 90), mobile: null });
  assert.equal(lost.ok, false);
  assert.equal(lost.browser.failed[0].test, 'mobile shard');
  // A test the branch added fails only when every shard skipped it: desktop-only is fine.
  const skip = { test: 'agenda.spec.js › new', error: 'skipped on every project' };
  assert.equal(mergeShards({ desktop: g(true, 1), mobile: g(true, 0, [], true, [skip]) }).ok, true);
  assert.equal(mergeShards({ desktop: g(true, 0, [], false, [skip]), mobile: g(true, 0, [], true, [skip]) }).ok, false);
});

test('a test the map knows that this commit renamed takes its whole spec, not nothing', () => {
  const renamed = map({ desktop: { 'tests/agenda.spec.js': ['My Agenda › an old title'] }, mobile: {} });
  const s = decideSelection(app, facts({ map: renamed }), sure);
  assert.ok(s.tests.desktop.includes('tests/agenda.spec.js › My Agenda › lists upcoming'));
  assert.ok(s.tests.desktop.includes('tests/agenda.spec.js › My Agenda › flags a clash'));
  assert.equal(s.breakdown.map, 2);
});

test('a smoke test renamed away takes its whole spec, rather than leaving a hole', () => {
  const gone = ONE.filter((t) => t.title !== 'Home renders cleanly');
  const s = decideSelection(app, facts({ tests: { desktop: gone, mobile: gone }, map: map({ desktop: {}, mobile: {}, reach: {} }) }), sure);
  assert.ok(s.tests.desktop.includes('tests/smoke.spec.js › Schedule renders cleanly'));
});

test('after ship ran everything green, a full selection has nothing left — and the status does not claim it ran', () => {
  const f = facts({ branch: null, map: null });
  const full = decideSelection(app, f, sure);
  assert.equal(full.mode, 'full');
  const left = withoutRan(full, f, full.tests);
  assert.equal(left.ran, 0);
  assert.deepEqual(left.args, { desktop: [], mobile: [] });
  assert.match(statusLine(app, left, { reused: full.ran }), new RegExp(`^ran 0 of ${SUITE} browser tests · ${SUITE} green in ship's gate`));
});

test('mapProblem: none for a current map', () => {
  assert.equal(mapProblem(map()), null);
  assert.equal(mapProblem(null), 'no test map yet');
});
