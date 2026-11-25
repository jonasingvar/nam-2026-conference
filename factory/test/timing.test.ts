import { test } from 'node:test';
import assert from 'node:assert/strict';
import { span, stopwatch, timeLine } from '../lib/timing';

const MIN = 60_000;

test('a span reads as seconds, minutes, then hours and minutes', () => {
  assert.equal(span(0), '0 s');
  assert.equal(span(44_600), '45 s');
  assert.equal(span(7 * MIN + 10_000), '7 min');
  assert.equal(span(125 * MIN), '2 h 05 min');
  assert.equal(span(-5), '0 s');
});

test('waiting for a person is kept apart from the work', () => {
  const w = stopwatch(1_000, 'Triage', ['Merge']);
  w.enter('Build', 1_000 + 2 * MIN);
  w.enter('Merge', 1_000 + 10 * MIN);
  w.enter('Production', 1_000 + 100 * MIN);
  const t = w.read(1_000 + 101 * MIN);
  assert.equal(t.elapsed, 101 * MIN);
  assert.equal(t.waiting, 90 * MIN);
  assert.equal(t.working, 11 * MIN);
  assert.deepEqual(t.byPhase, { Triage: 2 * MIN, Build: 8 * MIN, Production: 1 * MIN });
});

test('the phase still open counts up to now, and a phase entered twice adds up', () => {
  const w = stopwatch(0, 'Build');
  w.enter('Gate', 3 * MIN);
  w.enter('Build', 5 * MIN);
  assert.deepEqual(w.read(9 * MIN).byPhase, { Build: 7 * MIN, Gate: 2 * MIN });
  assert.equal(w.read(9 * MIN).working, 9 * MIN);
});

test('agents add up on their own, side by side or not', () => {
  const w = stopwatch(0, 'Audit');
  w.agent(120); w.agent(180); w.agent(undefined);
  const t = w.read(3 * MIN);
  assert.equal(t.agents, 5 * MIN);
  assert.equal(t.working, 3 * MIN);
});

test('the line names the wait only when there was one', () => {
  const w = stopwatch(0, 'Plan', ['Merge']);
  w.agent(240);
  w.enter('Build', 2 * MIN);
  assert.equal(timeLine(w.read(8 * MIN), { phases: true }), '8 min working — Plan 2 min, Build 6 min · agents ran 4 min in total');
  w.enter('Merge', 8 * MIN);
  assert.equal(timeLine(w.read(68 * MIN)), '8 min working · agents ran 4 min in total · 1 h 00 min waiting for you · 1 h 08 min start to finish');
});
