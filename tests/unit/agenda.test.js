import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planDays } from '../../src/lib/agenda.js';

const AURORA = 1;
const FOUNDRY = 2;
const travel = [
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Shuttle', minutes: 25, costUsd: 0 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Rideshare', minutes: 16, costUsd: 18 },
];

const s = (id, day, startsAt, endsAt, venueId = AURORA, extra = {}) => ({
  id, title: `Session ${id}`, day, startsAt, endsAt,
  room: { id: 1, name: 'Room', walkMinutes: 4 }, venue: { id: venueId, shortName: venueId === 1 ? 'Aurora' : 'Foundry' },
  ...extra,
});

const D1 = '2026-09-01';
const D2 = '2026-09-02';
const run = (days, res, clock = { day: D1, time: '08:00' }) =>
  planDays(days, { reservationFor: (id) => res[id] ?? null, clock, travel });

describe('planDays', () => {
  test('keeps only reserved sessions, sorted, carrying the store reservation, and drops empty days', () => {
    const days = [
      { date: D1, sessions: [s(2, D1, '11:00', '12:00'), s(1, D1, '09:00', '10:00'), s(3, D1, '13:00', '14:00')] },
      { date: D2, sessions: [s(4, D2, '09:00', '10:00')] },
    ];
    const out = run(days, { 1: 'confirmed', 2: 'waitlisted', 4: 'confirmed' });
    assert.deepEqual(out.map((d) => d.date), [D1, D2]);
    assert.deepEqual(out[0].sessions.map((x) => [x.id, x.reservation]), [[1, 'confirmed'], [2, 'waitlisted']]);
    assert.deepEqual(run(days, {}), []);
  });

  test('ended sessions are dropped: earlier days and same-day endsAt <= now; in progress stays', () => {
    const days = [
      { date: D1, sessions: [s(1, D1, '09:00', '10:00'), s(2, D1, '10:00', '11:00'), s(3, D1, '12:00', '13:00')] },
      { date: D2, sessions: [s(4, D2, '09:00', '10:00')] },
    ];
    const all = { 1: 'confirmed', 2: 'confirmed', 3: 'confirmed', 4: 'confirmed' };
    assert.deepEqual(run(days, all, { day: D1, time: '10:30' })[0].sessions.map((x) => x.id), [2, 3]);
    assert.deepEqual(run(days, all, { day: D1, time: '11:00' })[0].sessions.map((x) => x.id), [3]);
    assert.deepEqual(run(days, all, { day: D2, time: '08:00' }).map((d) => d.date), [D2]);
  });

  test('overlapping sessions, seat and waitlist, each clash with the other', () => {
    const days = [{ date: D1, sessions: [s(1, D1, '09:00', '10:00'), s(2, D1, '09:30', '10:30'), s(3, D1, '10:30', '11:00')] }];
    const [day] = run(days, { 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed' });
    const by = Object.fromEntries(day.sessions.map((x) => [x.id, x]));
    assert.deepEqual(by[1].clashesWith.map((x) => x.id), [2]);
    assert.deepEqual(by[2].clashesWith.map((x) => x.id), [1]);
    assert.deepEqual(by[3].clashesWith, []);
  });

  test('removing a session drops it and its partner\'s clash', () => {
    const days = [{ date: D1, sessions: [s(1, D1, '09:00', '10:00'), s(2, D1, '09:30', '10:30')] }];
    const [day] = run(days, { 2: 'waitlisted' });
    assert.deepEqual(day.sessions.map((x) => x.id), [2]);
    assert.deepEqual(day.sessions[0].clashesWith, []);
  });

  test('a cross-town hop that cannot fit is flagged on the arriving session', () => {
    // fastest 16 + walk 4 = 20 minutes; gap 15
    const days = [{ date: D1, sessions: [s(1, D1, '09:00', '10:00', AURORA), s(2, D1, '10:15', '11:00', FOUNDRY)] }];
    const [day] = run(days, { 1: 'confirmed', 2: 'confirmed' });
    assert.equal(day.sessions[0].hop, null);
    assert.equal(day.sessions[1].hop.minutes, 20);
    assert.equal(day.sessions[1].hop.mode, 'Rideshare');
    assert.equal(day.sessions[1].hop.gapMinutes, 15);
  });

  test('no hop when the gap fits, the venue is the same, or a leg is waitlisted', () => {
    const fits = [{ date: D1, sessions: [s(1, D1, '09:00', '10:00', AURORA), s(2, D1, '10:20', '11:00', FOUNDRY)] }];
    assert.equal(run(fits, { 1: 'confirmed', 2: 'confirmed' })[0].sessions[1].hop, null);
    const same = [{ date: D1, sessions: [s(1, D1, '09:00', '10:00', AURORA), s(2, D1, '10:05', '11:00', AURORA)] }];
    assert.equal(run(same, { 1: 'confirmed', 2: 'confirmed' })[0].sessions[1].hop, null);
    const queued = [{ date: D1, sessions: [s(1, D1, '09:00', '10:00', AURORA), s(2, D1, '10:15', '11:00', FOUNDRY)] }];
    assert.equal(run(queued, { 1: 'confirmed', 2: 'waitlisted' })[0].sessions[1].hop, null);
  });
});
