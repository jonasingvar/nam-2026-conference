import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingAgenda } from '../../src/lib/agenda.js';

const AURORA = 1;
const FOUNDRY = 2;
const travel = [
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Shuttle', minutes: 25, costUsd: 0 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Rideshare', minutes: 16, costUsd: 18 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Walk', minutes: 118, costUsd: 0 },
  { fromVenueId: FOUNDRY, toVenueId: AURORA, mode: 'Shuttle', minutes: 27, costUsd: 0 },
  { fromVenueId: FOUNDRY, toVenueId: AURORA, mode: 'Rideshare', minutes: 17, costUsd: 18 },
];

const session = (id, day, startsAt, endsAt, venueId = AURORA, walkMinutes = 2) => ({
  id, day, startsAt, endsAt, title: `Session ${id}`,
  venue: { id: venueId, name: `Venue ${venueId}` }, room: { name: `Room ${id}`, walkMinutes },
});

const D1 = '2026-10-12';
const D2 = '2026-10-13';
const hold = (map) => (id) => map[id] ?? null;
const run = (sessions, held, clock = { day: D1, time: '08:00' }) =>
  upcomingAgenda({ sessions, reservationFor: hold(held), clock, travel });
const flat = (days) => days.flatMap((d) => d.sessions);

describe('upcomingAgenda', () => {
  test('groups by day in start order, with status', () => {
    const out = run(
      [session(3, D2, '09:00', '10:00'), session(2, D1, '11:00', '12:00'), session(1, D1, '09:00', '10:00'), session(4, D1, '14:00', '15:00')],
      { 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed' },
    );
    assert.deepEqual(out.map((d) => d.date), [D1, D2]);
    assert.deepEqual(out[0].sessions.map((s) => [s.id, s.status]), [[1, 'confirmed'], [2, 'waitlisted']]);
    assert.deepEqual(out[1].sessions.map((s) => s.id), [3]);
  });

  test('drops sessions that have ended by the clock, and days left empty', () => {
    const sessions = [session(1, D1, '09:00', '10:00'), session(2, D1, '10:00', '11:00'), session(3, D1, '11:00', '12:00')];
    const held = { 1: 'confirmed', 2: 'confirmed', 3: 'confirmed' };
    assert.deepEqual(flat(run(sessions, held, { day: D1, time: '10:00' })).map((s) => s.id), [2, 3]);
    assert.deepEqual(run(sessions, held, { day: D2, time: '08:00' }), []);
  });

  test('a seat and a waitlist place that overlap both carry clashesWith the other', () => {
    const out = flat(run([session(1, D1, '09:00', '10:00'), session(2, D1, '09:30', '10:30'), session(3, D1, '10:30', '11:00')],
      { 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed' }));
    assert.deepEqual(out[0].clashesWith.map((s) => s.id), [2]);
    assert.deepEqual(out[1].clashesWith.map((s) => s.id), [1]);
    assert.deepEqual(out[2].clashesWith, []);
  });

  test('flags a hop when the gap is shorter than the fastest non-walk trip plus the walk', () => {
    // Rideshare 16 + walk 2 = 18; gap 15
    const out = flat(run([session(1, D1, '09:00', '10:00', AURORA), session(2, D1, '10:15', '11:00', FOUNDRY, 2)],
      { 1: 'confirmed', 2: 'confirmed' }));
    assert.equal(out[0].hop, null);
    assert.deepEqual(out[1].hop, { mode: 'Rideshare', tripMinutes: 18, gapMinutes: 15 });
  });

  test('no hop when the trip fits, at one venue, or when a side is waitlisted', () => {
    const fits = flat(run([session(1, D1, '09:00', '10:00', AURORA), session(2, D1, '10:30', '11:00', FOUNDRY, 2)], { 1: 'confirmed', 2: 'confirmed' }));
    assert.equal(fits[1].hop, null);
    const same = flat(run([session(1, D1, '09:00', '10:00', AURORA), session(2, D1, '10:05', '11:00', AURORA)], { 1: 'confirmed', 2: 'confirmed' }));
    assert.equal(same[1].hop, null);
    const queued = flat(run([session(1, D1, '09:00', '10:00', AURORA), session(2, D1, '10:05', '11:00', FOUNDRY)], { 1: 'confirmed', 2: 'waitlisted' }));
    assert.equal(queued[1].hop, null);
  });

  test('a hop is judged from the previous seat that is still upcoming', () => {
    const out = flat(run([session(1, D1, '09:00', '10:00', AURORA), session(2, D1, '10:05', '11:00', FOUNDRY)],
      { 1: 'confirmed', 2: 'confirmed' }, { day: D1, time: '10:00' }));
    assert.deepEqual(out.map((s) => s.id), [2]);
    assert.equal(out[0].hop, null);
  });
});
