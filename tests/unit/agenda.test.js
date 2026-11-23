import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingAgenda } from '../../src/lib/agenda.js';

const AURORA = 1;
const FOUNDRY = 2;
const travel = [
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Shuttle', minutes: 25, costUsd: 0 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Rideshare', minutes: 16, costUsd: 18 },
  { fromVenueId: FOUNDRY, toVenueId: AURORA, mode: 'Rideshare', minutes: 16, costUsd: 18 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Walk', minutes: 118, costUsd: 0 },
];

let n = 0;
const session = (day, startsAt, endsAt, over = {}) => ({
  id: ++n, title: `Talk ${n}`, day, startsAt, endsAt,
  venue: { id: AURORA }, room: { walkMinutes: 2 }, ...over,
});

const D1 = '2026-10-12';
const D2 = '2026-10-13';
const run = (sessions, status, clock = { day: D1, time: '08:00' }) =>
  upcomingAgenda({ sessions, reservationFor: (id) => status[id] ?? null, clock, travel });
const flat = (days) => days.flatMap((d) => d.sessions);

describe('upcomingAgenda', () => {
  test('groups by day in start order, with status', () => {
    const a = session(D2, '09:00', '10:00');
    const b = session(D1, '11:00', '12:00');
    const c = session(D1, '09:00', '10:00');
    const out = run([a, b, c], { [a.id]: 'confirmed', [b.id]: 'waitlisted', [c.id]: 'confirmed' });
    assert.deepEqual(out.map((d) => d.date), [D1, D2]);
    assert.deepEqual(out[0].sessions.map((s) => [s.id, s.status]), [[c.id, 'confirmed'], [b.id, 'waitlisted']]);
  });

  test('drops sessions that are not held', () => {
    const a = session(D1, '09:00', '10:00');
    assert.deepEqual(run([a], {}), []);
  });

  test('drops sessions that have ended by the clock', () => {
    const early = session(D1, '09:00', '10:00');
    const live = session(D1, '10:00', '11:00');
    const past = session('2026-10-11', '09:00', '10:00');
    const status = { [early.id]: 'confirmed', [live.id]: 'confirmed', [past.id]: 'confirmed' };
    const out = run([early, live, past], status, { day: D1, time: '10:00' });
    assert.deepEqual(flat(out).map((s) => s.id), [live.id]);
    assert.deepEqual(run([early], status, { day: D1, time: '09:59' }).length, 1);
  });

  test('a seat and a waitlist place that overlap both carry clashesWith the other', () => {
    const a = session(D1, '09:00', '10:00');
    const b = session(D1, '09:30', '10:30');
    const c = session(D1, '10:30', '11:00');
    const out = flat(run([a, b, c], { [a.id]: 'confirmed', [b.id]: 'waitlisted', [c.id]: 'confirmed' }));
    const byId = Object.fromEntries(out.map((s) => [s.id, s]));
    assert.deepEqual(byId[a.id].clashesWith.map((s) => s.id), [b.id]);
    assert.deepEqual(byId[b.id].clashesWith.map((s) => s.id), [a.id]);
    assert.deepEqual(byId[c.id].clashesWith, []);
  });
});

describe('cross-town hops', () => {
  const pair = (gapEnd, over = {}) => {
    const a = session(D1, '09:00', '10:00');
    const b = session(D1, gapEnd, '12:00', { venue: { id: FOUNDRY }, room: { walkMinutes: 5 }, ...over });
    return [a, b];
  };
  const hopOf = (sessions, status) => flat(run(sessions, status)).find((s) => s.id === sessions[1].id).hop;

  test('flagged when the gap is shorter than the fastest non-walk route plus the walk', () => {
    const [a, b] = pair('10:20'); // gap 20 < 16 + 5
    assert.deepEqual(hopOf([a, b], { [a.id]: 'confirmed', [b.id]: 'confirmed' }),
      { mode: 'Rideshare', tripMinutes: 21, gapMinutes: 20 });
  });

  test('not flagged when the trip fits, at the same venue, or when one side is waitlisted', () => {
    const [a, b] = pair('10:21'); // gap 21 = 16 + 5
    assert.equal(hopOf([a, b], { [a.id]: 'confirmed', [b.id]: 'confirmed' }), null);
    const [c, d] = pair('10:20', { venue: { id: AURORA } });
    assert.equal(hopOf([c, d], { [c.id]: 'confirmed', [d.id]: 'confirmed' }), null);
    const [e, f] = pair('10:20');
    assert.equal(hopOf([e, f], { [e.id]: 'confirmed', [f.id]: 'waitlisted' }), null);
  });
});
