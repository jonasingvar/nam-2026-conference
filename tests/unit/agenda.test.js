import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
// Pure: nothing in these modules touches `window`. The schedule payload shape
// below is the one `server/lib/agenda.js:scheduleFor` serves, trimmed to the
// fields the agenda reads.
import { clashesFor, hopsFor, upcomingDays } from '../../src/lib/agenda.js';

const AURORA = { id: 1, name: 'Aurora Convention Center', shortName: 'Aurora' };
const FOUNDRY = { id: 2, name: 'The Foundry at Red Rock Yards', shortName: 'The Foundry' };

// The seeded travel table, same numbers and the same direction rule.
const travel = [
  { fromVenueId: 1, toVenueId: 2, mode: 'Shuttle', minutes: 27, costUsd: 0 },
  { fromVenueId: 1, toVenueId: 2, mode: 'Rideshare', minutes: 18, costUsd: 23.5 },
  { fromVenueId: 1, toVenueId: 2, mode: 'Taxi', minutes: 19, costUsd: 31 },
  { fromVenueId: 1, toVenueId: 2, mode: 'Walk', minutes: 96, costUsd: 0 },
  { fromVenueId: 2, toVenueId: 1, mode: 'Shuttle', minutes: 29, costUsd: 0 },
  { fromVenueId: 2, toVenueId: 1, mode: 'Rideshare', minutes: 18, costUsd: 23.5 },
  { fromVenueId: 2, toVenueId: 1, mode: 'Taxi', minutes: 19, costUsd: 31 },
  { fromVenueId: 2, toVenueId: 1, mode: 'Walk', minutes: 96, costUsd: 0 },
];

const session = (id, over = {}) => ({
  id,
  title: `Session ${id}`,
  day: '2026-11-23',
  startsAt: '10:15',
  endsAt: '11:00',
  reservation: 'confirmed',
  room: { name: `Room ${id}`, walkMinutes: 7 },
  venue: AURORA,
  ...over,
});

const day = (date, sessions) => ({ date, sessions });

/** A store lookup: every session below is still held, with the status it carries. */
const holdAll = (sessions) => (id) => sessions.find((s) => s.id === id)?.reservation ?? null;

describe('An agenda is what is still ahead of you', () => {
  const morning = session(1, { startsAt: '09:00', endsAt: '09:45' });
  const running = session(2, { startsAt: '10:15', endsAt: '11:00' });
  const later = session(3, { startsAt: '13:30', endsAt: '14:15' });
  const tomorrow = session(4, { day: '2026-11-24', startsAt: '09:00', endsAt: '09:45' });
  const days = [day('2026-11-23', [later, morning, running]), day('2026-11-24', [tomorrow])];

  test('a session that has ended is not listed, but one that is running now still is', () => {
    const clock = { day: '2026-11-23', time: '10:30' };
    const [today] = upcomingDays(days, holdAll([morning, running, later, tomorrow]), clock);
    assert.deepEqual(today.sessions.map((s) => s.id), [2, 3]);
  });

  test('the moment before it ends it is still there — the boundary is the end, not the start', () => {
    const hold = holdAll([morning, running, later, tomorrow]);
    const early = upcomingDays(days, hold, { day: '2026-11-23', time: '09:44' });
    assert.deepEqual(early[0].sessions.map((s) => s.id), [1, 2, 3]);

    const ended = upcomingDays(days, hold, { day: '2026-11-23', time: '09:45' });
    assert.deepEqual(ended[0].sessions.map((s) => s.id), [2, 3]);
  });

  test('sessions come back in time order within the day, days in date order', () => {
    const clock = { day: '2026-11-23', time: '08:00' };
    const ordered = upcomingDays([...days].reverse(), holdAll([morning, running, later, tomorrow]), clock);
    assert.deepEqual(ordered.map((d) => d.date), ['2026-11-23', '2026-11-24']);
    assert.deepEqual(ordered[0].sessions.map((s) => s.startsAt), ['09:00', '10:15', '13:30']);
  });

  test('a session dropped from the store leaves the list, and the payload reservation is replaced', () => {
    // The store has released 1; the fetched payload still says 'confirmed'.
    const clock = { day: '2026-11-23', time: '08:00' };
    const held = new Map([[2, 'waitlisted'], [3, 'confirmed']]);
    const reservationFor = (id) => held.get(id) ?? null;

    const shown = upcomingDays(days, reservationFor, clock);
    assert.deepEqual(shown[0].sessions.map((s) => s.id), [2, 3]);
    assert.equal(shown[0].sessions[0].reservation, 'waitlisted');
  });

  test('a day with nothing left on it is dropped, and an empty agenda is empty', () => {
    const clock = { day: '2026-11-24', time: '20:00' };
    assert.deepEqual(upcomingDays(days, holdAll([morning, running, later, tomorrow]), clock), []);
  });
});

describe('Two sessions at once clash, whichever kind of place you hold', () => {
  test('a seat and a waitlist place that overlap are both flagged, each naming the other', () => {
    const seat = session(1, { startsAt: '10:15', endsAt: '11:00', reservation: 'confirmed' });
    const queued = session(2, { startsAt: '10:45', endsAt: '11:30', reservation: 'waitlisted' });

    const clashes = clashesFor([seat, queued]);
    assert.deepEqual(clashes.get(1).map((s) => s.id), [2]);
    assert.deepEqual(clashes.get(2).map((s) => s.id), [1]);
  });

  test('back-to-back sessions do not clash — touching is not overlapping', () => {
    const first = session(1, { startsAt: '10:15', endsAt: '11:00' });
    const second = session(2, { startsAt: '11:00', endsAt: '11:45' });
    assert.equal(clashesFor([first, second]).size, 0);
  });

  test('sessions on different days never clash, even at the same time', () => {
    const a = session(1, { day: '2026-11-23' });
    const b = session(2, { day: '2026-11-24' });
    assert.equal(clashesFor([a, b]).size, 0);
  });
});

describe('A cross-town hop that will not fit', () => {
  test('a 15 minute gap to a Foundry room is impossible even by rideshare, and both rows are flagged', () => {
    const keynote = session(1, { startsAt: '08:00', endsAt: '08:45', venue: AURORA });
    const talk = session(2, { startsAt: '09:00', endsAt: '09:45', venue: FOUNDRY, room: { walkMinutes: 7 } });

    const hops = hopsFor([keynote, talk], travel);
    assert.deepEqual(hops.get(1).map((h) => h.to.id), [2]);
    assert.deepEqual(hops.get(2).map((h) => h.from.id), [1]);

    const [hop] = hops.get(1);
    assert.equal(hop.gapMinutes, 15);
    // fastest non-walking route (rideshare, 18) plus the walk to the room (7)
    assert.equal(hop.tripMinutes, 25);
  });

  test('a 30 minute gap does fit, so nothing is flagged', () => {
    const keynote = session(1, { startsAt: '08:00', endsAt: '08:45', venue: AURORA });
    const talk = session(2, { startsAt: '09:15', endsAt: '10:00', venue: FOUNDRY, room: { walkMinutes: 7 } });
    assert.equal(hopsFor([keynote, talk], travel).size, 0);
  });

  test('two sessions at the same venue are not a hop, however tight', () => {
    const a = session(1, { startsAt: '08:00', endsAt: '08:45' });
    const b = session(2, { startsAt: '08:50', endsAt: '09:35' });
    assert.equal(hopsFor([a, b], travel).size, 0);
  });

  test('a waitlist place is skipped, because you cannot miss a chair you never held', () => {
    const keynote = session(1, { startsAt: '08:00', endsAt: '08:45', venue: AURORA });
    const queued = session(2, { startsAt: '08:50', endsAt: '09:35', venue: FOUNDRY, reservation: 'waitlisted' });
    const talk = session(3, { startsAt: '09:00', endsAt: '09:45', venue: FOUNDRY, room: { walkMinutes: 7 } });

    // Consecutive confirmed seats are the keynote and talk; the queue between them is ignored.
    const hops = hopsFor([keynote, queued, talk], travel);
    assert.deepEqual(hops.get(1).map((h) => h.to.id), [3]);
    assert.equal(hops.has(2), false);
    assert.equal(hops.get(1)[0].gapMinutes, 15);
  });
});
