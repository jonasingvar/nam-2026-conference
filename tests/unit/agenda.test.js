import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingAgenda } from '../../src/lib/agenda.js';

const AURORA = 1;
const FOUNDRY = 2;
const travel = [
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Shuttle', minutes: 25, costUsd: 0 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Rideshare', minutes: 18, costUsd: 18 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Walk', minutes: 118, costUsd: 0 },
];

const s = (id, day, startsAt, endsAt, venueId = AURORA, walkMinutes = 2) => ({
  id, day, startsAt, endsAt, title: `Session ${id}`,
  venue: { id: venueId }, room: { name: 'Room', walkMinutes },
});
const held = (map) => (id) => map[id] ?? null;
const run = (sessions, status, clock = { day: 'D1', time: '08:00' }) =>
  upcomingAgenda({ sessions, reservationFor: held(status), clock, travel });
const flat = (days) => days.flatMap((d) => d.sessions);

describe('upcomingAgenda', () => {
  test('groups by day in start order, with status', () => {
    const days = run(
      [s(3, 'D2', '09:00', '10:00'), s(2, 'D1', '11:00', '12:00'), s(1, 'D1', '09:00', '10:00'), s(4, 'D1', '13:00', '14:00')],
      { 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed' },
    );
    assert.deepEqual(days.map((d) => d.date), ['D1', 'D2']);
    assert.deepEqual(days[0].sessions.map((x) => [x.id, x.status]), [[1, 'confirmed'], [2, 'waitlisted']]);
  });

  test('drops sessions that have ended by the clock', () => {
    const days = run(
      [s(1, 'D0', '09:00', '10:00'), s(2, 'D1', '09:00', '10:00'), s(3, 'D1', '10:30', '11:30')],
      { 1: 'confirmed', 2: 'confirmed', 3: 'confirmed' },
      { day: 'D1', time: '10:00' },
    );
    assert.deepEqual(flat(days).map((x) => x.id), [3]);
  });

  test('a day with nothing upcoming is dropped, and nothing held gives an empty list', () => {
    assert.deepEqual(run([s(1, 'D1', '09:00', '10:00')], {}), []);
  });

  test('a seat and a waitlist place that overlap both carry clashesWith the other', () => {
    const out = flat(run([s(1, 'D1', '09:00', '10:00'), s(2, 'D1', '09:30', '10:30'), s(3, 'D1', '10:30', '11:30')],
      { 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed' }));
    assert.deepEqual(out[0].clashesWith.map((x) => x.id), [2]);
    assert.deepEqual(out[1].clashesWith.map((x) => x.id), [1]);
    assert.deepEqual(out[2].clashesWith, []);
  });

  test('a hop is flagged when the gap is shorter than the fastest trip plus the walk', () => {
    const out = flat(run([s(1, 'D1', '09:00', '10:00'), s(2, 'D1', '10:30', '11:30', FOUNDRY, 13)],
      { 1: 'confirmed', 2: 'confirmed' }));
    assert.equal(out[0].hop, null);
    assert.equal(out[1].hop.mode, 'Rideshare');
    assert.equal(out[1].hop.tripMinutes, 31);
    assert.equal(out[1].hop.gapMinutes, 30);
  });

  test('no hop when it fits, at the same venue, or when one side is waitlisted', () => {
    const fits = flat(run([s(1, 'D1', '09:00', '10:00'), s(2, 'D1', '10:30', '11:30', FOUNDRY, 5)], { 1: 'confirmed', 2: 'confirmed' }));
    assert.equal(fits[1].hop, null);
    const same = flat(run([s(1, 'D1', '09:00', '10:00'), s(2, 'D1', '10:05', '11:00', AURORA, 13)], { 1: 'confirmed', 2: 'confirmed' }));
    assert.equal(same[1].hop, null);
    const wait = flat(run([s(1, 'D1', '09:00', '10:00'), s(2, 'D1', '10:30', '11:30', FOUNDRY, 13)], { 1: 'confirmed', 2: 'waitlisted' }));
    assert.equal(wait[1].hop, null);
  });
});
