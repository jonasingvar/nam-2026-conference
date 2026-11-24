import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingDays } from '../../src/lib/agenda.js';

/**
 * What My Agenda is made of. The input is `getSchedule`'s days, the store's
 * reservations and the conference clock; the output is the attendee's own
 * conference, day by day, with the two problems worth knowing about.
 */

const DAY = '2026-10-12';
const NEXT_DAY = '2026-10-13';
const AURORA = 1;
const FOUNDRY = 2;

/** The two-venue travel table `travel.test.js` uses, in `toTravel`'s shape. */
const travel = [
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Shuttle', minutes: 25, costUsd: 0 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Rideshare', minutes: 16, costUsd: 18 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Transit', minutes: 34, costUsd: 3 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Walk', minutes: 96, costUsd: 0 },
];

const session = (id, startsAt, endsAt, venueId = AURORA, walkMinutes = 0) => ({
  id,
  day: DAY,
  startsAt,
  endsAt,
  title: `Session ${id}`,
  venue: { id: venueId, shortName: venueId === AURORA ? 'Aurora' : 'The Foundry' },
  room: { name: `Room ${id}`, walkMinutes },
});

/** `getSchedule`'s days, in the shape `scheduleFor` returns them. */
const days = (...sessions) => [{ date: DAY, sessions }];

/** The store's `reservationFor`: session id → 'confirmed' | 'waitlisted' | null. */
const store = (map) => (id) => map[id] ?? null;

const at = (time) => ({ day: DAY, time });

describe('The attendee’s own conference', () => {
  test('comes back day by day, in time order, saying seat or waitlist place', () => {
    const out = upcomingDays({
      days: [
        { date: DAY, sessions: [session(2, '11:30', '12:15'), session(1, '09:00', '09:45'), session(3, '14:45', '15:30')] },
        { date: NEXT_DAY, sessions: [session(4, '10:15', '11:00')] },
      ],
      reservationFor: store({ 1: 'confirmed', 2: 'waitlisted', 4: 'confirmed' }),
      clock: at('08:00'),
      travel,
    });

    assert.deepEqual(out.map((d) => d.date), [DAY, NEXT_DAY]);
    assert.deepEqual(out[0].sessions.map((s) => s.id), [1, 2]);
    assert.deepEqual(out[0].sessions.map((s) => s.reservation), ['confirmed', 'waitlisted']);
    assert.equal(out[0].sessions[0].title, 'Session 1');
    assert.deepEqual(out[1].sessions.map((s) => s.id), [4]);
  });

  test('never falls back to the reservation the payload was fetched with', () => {
    // The store is the source of truth: a session removed a moment ago is still
    // in the payload, and must not still be on the page.
    const payload = days({ ...session(1, '09:00', '09:45'), reservation: 'confirmed' });
    assert.deepEqual(upcomingDays({ days: payload, reservationFor: () => null, clock: at('08:00'), travel }), []);
  });

  test('drops a session that has ended, and the day it leaves empty', () => {
    const payload = [
      { date: DAY, sessions: [session(1, '09:00', '09:45')] },
      { date: NEXT_DAY, sessions: [session(2, '10:15', '11:00')] },
    ];
    const reservations = store({ 1: 'confirmed', 2: 'confirmed' });

    // endsAt is the moment the door shuts, so 09:45 is over and 09:44 is not
    assert.deepEqual(upcomingDays({ days: payload, reservationFor: reservations, clock: at('09:45'), travel })
      .map((d) => d.date), [NEXT_DAY]);
    assert.deepEqual(upcomingDays({ days: payload, reservationFor: reservations, clock: at('09:44'), travel })[0]
      .sessions.map((s) => s.id), [1]);
    // started but not ended still counts as upcoming
    assert.deepEqual(upcomingDays({ days: payload, reservationFor: reservations, clock: at('09:30'), travel })[0]
      .sessions.map((s) => s.id), [1]);
  });
});

describe('Clashes', () => {
  test('two sessions that overlap are both flagged, each naming the other', () => {
    const out = upcomingDays({
      days: days(session(1, '10:15', '11:00'), session(2, '10:30', '11:15', FOUNDRY, 6)),
      reservationFor: store({ 1: 'confirmed', 2: 'waitlisted' }),
      clock: at('08:00'),
      travel,
    });

    assert.deepEqual(out[0].sessions[0].clashesWith, [2]);
    assert.deepEqual(out[0].sessions[1].clashesWith, [1]);
  });

  test('a session that merely starts when the last one ends does not clash', () => {
    const out = upcomingDays({
      days: days(session(1, '09:00', '09:45'), session(2, '09:45', '10:30')),
      reservationFor: store({ 1: 'confirmed', 2: 'confirmed' }),
      clock: at('08:00'),
      travel,
    });

    assert.deepEqual(out[0].sessions.map((s) => s.clashesWith), [[], []]);
  });
});

describe('Cross-town hops', () => {
  test('a trip the gap cannot cover is flagged with the trip and the gap', () => {
    // 11:30 − 11:00 = 30 minutes; the quickest way over is 16 by rideshare plus
    // the 20-minute walk to the room.
    const out = upcomingDays({
      days: days(session(1, '10:15', '11:00'), session(2, '11:30', '12:15', FOUNDRY, 20)),
      reservationFor: store({ 1: 'confirmed', 2: 'confirmed' }),
      clock: at('08:00'),
      travel,
    });

    assert.deepEqual(out[0].sessions[1].hop, { fromId: 1, gapMinutes: 30, travelMinutes: 36 });
    // the warning belongs to the session you are travelling to
    assert.equal(out[0].sessions[0].hop, null);
  });

  test('a hop that fits, or one inside the same building, is not flagged', () => {
    const gap = (second) => upcomingDays({
      days: days(session(1, '10:15', '11:00'), second),
      reservationFor: store({ 1: 'confirmed', 2: 'confirmed' }),
      clock: at('08:00'),
      travel,
    })[0].sessions[1].hop;

    assert.equal(gap(session(2, '11:30', '12:15', FOUNDRY, 6)), null);   // 16 + 6 = 22 ≤ 30
    assert.equal(gap(session(2, '11:30', '12:15', AURORA, 20)), null);   // same venue: no travel to assess
  });

  test('a waitlist place next to a seat never triggers one — it may never come good', () => {
    const out = upcomingDays({
      days: days(session(1, '10:15', '11:00'), session(2, '11:30', '12:15', FOUNDRY, 20)),
      reservationFor: store({ 1: 'confirmed', 2: 'waitlisted' }),
      clock: at('08:00'),
      travel,
    });

    assert.equal(out[0].sessions[1].hop, null);
  });

  test('it is the gap to the previous confirmed seat, so the first one has no hop into it', () => {
    const out = upcomingDays({
      days: days(
        session(1, '09:00', '09:45', FOUNDRY, 20),        // over by the time we look
        session(2, '10:15', '11:00'),
        session(3, '11:30', '12:15', FOUNDRY, 20),
      ),
      reservationFor: store({ 1: 'confirmed', 2: 'confirmed', 3: 'confirmed' }),
      clock: at('10:15'),
      travel,
    });

    const [first, second] = out[0].sessions;
    assert.deepEqual(out[0].sessions.map((s) => s.id), [2, 3]);
    assert.equal(first.hop, null);
    assert.deepEqual(second.hop, { fromId: 2, gapMinutes: 30, travelMinutes: 36 });
  });

  test('with no travel table there is nothing to assess', () => {
    const out = upcomingDays({
      days: days(session(1, '10:15', '11:00'), session(2, '11:30', '12:15', FOUNDRY, 20)),
      reservationFor: store({ 1: 'confirmed', 2: 'confirmed' }),
      clock: at('08:00'),
    });

    assert.equal(out[0].sessions[1].hop, null);
  });
});
