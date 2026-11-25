import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingAgenda } from '../../src/lib/agenda.js';

/**
 * The attendee's own agenda, as a pure function.
 *
 * It takes the `GET /users/:id/schedule` payload, the store's live reservations,
 * the conference clock and the travel table — no HTTP, no React — so the rules
 * can be pinned down on plain objects:
 *
 *   - only what is still ahead (the clock decides, not `new Date()`),
 *   - only what the *store* still holds, not what the fetched day listed,
 *   - both statuses clash; only confirmed seats can be a hop.
 */

const AURORA = 1;
const FOUNDRY = 2;
const DAY_1 = '2026-10-12';
const DAY_2 = '2026-10-13';
const MORNING = { day: DAY_1, time: '08:00' };

/** The two-venue travel table, in the camelCase shape `toTravel` returns. */
const travel = [
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Shuttle', minutes: 25, costUsd: 0 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Rideshare', minutes: 16, costUsd: 18 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Transit', minutes: 34, costUsd: 3 },
  { fromVenueId: AURORA, toVenueId: FOUNDRY, mode: 'Walk', minutes: 118, costUsd: 0 },
  { fromVenueId: FOUNDRY, toVenueId: AURORA, mode: 'Shuttle', minutes: 27, costUsd: 0 },
];

const session = (over = {}) => ({
  id: 1, title: 'A talk', day: DAY_1, startsAt: '09:00', endsAt: '09:45',
  venue: { id: AURORA, shortName: 'Aurora' }, room: { name: 'Main Hall', walkMinutes: 0 },
  ...over,
});
const on = (date, ...sessions) => ({ date, sessions });
/** Holding everything the payload lists, unless a test says otherwise. */
const holding = () => 'confirmed';
/** The store, from a plain sessionId → status map. */
const store = (map) => (id) => map[id] ?? null;
const agenda = (days, { clock = MORNING, reservationFor = holding } = {}) =>
  upcomingAgenda({ days, reservationFor, clock, travel });

describe('What is still ahead', () => {
  test('keeps the days in date order, each grouping its sessions in time order', () => {
    const out = agenda([
      on(DAY_2, session({ id: 5, startsAt: '11:30', endsAt: '12:15' })),
      on(DAY_1,
        session({ id: 2, title: 'Later', startsAt: '14:45', endsAt: '15:30' }),
        session({ id: 1, title: 'Earlier', startsAt: '09:00', endsAt: '09:45' })),
      on('2026-10-14'),
    ]);

    assert.deepEqual(out.map((d) => d.date), [DAY_1, DAY_2]);
    assert.deepEqual(out[0].sessions.map((s) => s.id), [1, 2]);
  });

  test('a session that has ended is gone, but one already under way is not', () => {
    const out = agenda([on(DAY_1,
      session({ id: 1, startsAt: '09:00', endsAt: '09:45' }),
      session({ id: 2, startsAt: '10:15', endsAt: '11:00' }),
      session({ id: 3, startsAt: '13:30', endsAt: '14:15' }),
    )], { clock: { day: DAY_1, time: '10:30' } });

    assert.deepEqual(out[0].sessions.map((s) => s.id), [2, 3]);
  });

  test('a session ending exactly now is over, and takes its empty day with it', () => {
    const out = agenda([on(DAY_1, session({ id: 1, startsAt: '09:00', endsAt: '09:45' }))],
      { clock: { day: DAY_1, time: '09:45' } });

    assert.deepEqual(out, []);
  });

  test('a day behind the clock is over, whatever the times read', () => {
    const out = agenda([
      on(DAY_1, session({ id: 1, startsAt: '20:00', endsAt: '22:00' })),
      on(DAY_2, session({ id: 2, day: DAY_2, startsAt: '09:00', endsAt: '09:45' })),
    ], { clock: { day: DAY_2, time: '08:00' } });

    assert.deepEqual(out.map((d) => d.date), [DAY_2]);
  });
});

describe('What you still hold', () => {
  test('a waitlist place stays on the page, marked as one', () => {
    const out = agenda([on(DAY_1, session({ id: 1 }))], { reservationFor: store({ 1: 'waitlisted' }) });

    assert.equal(out[0].sessions[0].reservation, 'waitlisted');
  });

  test('a session the store no longer holds is gone, even though the payload listed it', () => {
    const out = agenda([on(DAY_1,
      session({ id: 1 }),
      session({ id: 2, startsAt: '13:30', endsAt: '14:15' }),
    )], { reservationFor: store({ 2: 'confirmed' }) });

    assert.deepEqual(out[0].sessions.map((s) => s.id), [2]);
  });

  test('a day nothing is held on any more is dropped', () => {
    const out = agenda([on(DAY_1, session({ id: 1 }))], { reservationFor: store({}) });

    assert.deepEqual(out, []);
  });
});

describe('Two of your sessions at once', () => {
  const overlapping = (venueId) => session({
    id: 2, title: 'The other one', startsAt: '10:15', endsAt: '11:00',
    venue: { id: venueId, shortName: venueId === AURORA ? 'Aurora' : 'Foundry' },
  });

  test('both name the other, seat or waitlist place alike', () => {
    const out = agenda([on(DAY_1,
      session({ id: 1, title: 'A seat', startsAt: '10:15', endsAt: '11:00' }),
      overlapping(FOUNDRY),
    )], { reservationFor: store({ 1: 'confirmed', 2: 'waitlisted' }) });

    const [seat, queued] = out[0].sessions;
    assert.deepEqual(seat.clash, { id: 2, title: 'The other one' });
    assert.deepEqual(queued.clash, { id: 1, title: 'A seat' });
  });

  test('back-to-back sessions are not a clash', () => {
    const out = agenda([on(DAY_1,
      session({ id: 1, startsAt: '09:00', endsAt: '09:45' }),
      session({ id: 2, startsAt: '10:15', endsAt: '11:00' }),
    )]);

    assert.equal(out[0].sessions[0].clash, null);
    assert.equal(out[0].sessions[1].clash, null);
  });

  test('the flag goes when the session it named is no longer held', () => {
    const out = agenda([on(DAY_1,
      session({ id: 1, startsAt: '10:15', endsAt: '11:00' }),
      overlapping(FOUNDRY),
    )], { reservationFor: store({ 1: 'confirmed' }) });

    assert.equal(out[0].sessions[0].clash, null);
  });
});

describe('Getting across town between two seats', () => {
  const auroraTalk = session({ id: 1, title: 'Aurora talk', startsAt: '09:00', endsAt: '09:45' });
  const foundryTalk = (over = {}) => session({
    id: 2, title: 'Foundry talk', startsAt: '10:15', endsAt: '11:00', venue: { id: FOUNDRY, shortName: 'Foundry' },
    room: { name: 'Studio', walkMinutes: 15 },
    ...over,
  });
  const pair = (over) => agenda([on(DAY_1, auroraTalk, foundryTalk(over))]);

  test('a confirmed pair the fastest route misses carries the trip and the gap', () => {
    const out = pair();
    const hop = out[0].sessions[1].hop;

    // 09:45 → 10:15 is a 30-minute gap; the quickest way over is a 16-minute
    // rideshare plus the 15-minute walk to the room, so 31 minutes.
    assert.equal(hop.fromTitle, 'Aurora talk');
    assert.equal(hop.gapMinutes, 30);
    assert.equal(hop.minutes, 31);
    assert.equal(hop.mode, 'Rideshare');
    assert.equal(out[0].sessions[0].hop, null);
  });

  test('a gap the quickest route makes is not flagged', () => {
    assert.equal(pair({ startsAt: '10:30' })[0].sessions[1].hop, null);
  });

  test('a gap only a paid option makes is not flagged — the ticket says the fastest route', () => {
    // 35 minutes: the free shuttle (25 + 15) still misses, but a rideshare fits.
    assert.equal(pair({ startsAt: '10:20' })[0].sessions[1].hop, null);
  });

  test('two rooms at the same venue are never a hop', () => {
    const out = agenda([on(DAY_1, auroraTalk, foundryTalk({ venue: { id: AURORA, shortName: 'Aurora' } }))]);

    assert.equal(out[0].sessions[1].hop, null);
  });

  test('a waitlist place is not a chair, so it is never a hop', () => {
    const out = agenda([on(DAY_1, auroraTalk, foundryTalk())],
      { reservationFor: store({ 1: 'confirmed', 2: 'waitlisted' }) });

    assert.equal(out[0].sessions[1].hop, null);
  });

  test('only consecutive confirmed seats are judged, so a waitlist place between them does not break the pair', () => {
    // Same slot, so the queueing session sorts between the two seats and is
    // adjacent to the Foundry one — which must not swallow the hop.
    const queued = session({ id: 2, title: 'Queued', startsAt: '10:15', endsAt: '11:00' });
    const out = agenda([on(DAY_1, auroraTalk, queued, foundryTalk({ id: 5 }))],
      { reservationFor: store({ 1: 'confirmed', 2: 'waitlisted', 5: 'confirmed' }) });

    assert.equal(out[0].sessions[1].reservation, 'waitlisted');
    assert.equal(out[0].sessions[1].hop, null);
    assert.equal(out[0].sessions[2].hop.gapMinutes, 30);
  });

  test('the flag goes when the session you are coming from is dropped', () => {
    const out = agenda([on(DAY_1, auroraTalk, foundryTalk())],
      { reservationFor: store({ 2: 'confirmed' }) });

    assert.deepEqual(out[0].sessions.map((s) => s.id), [2]);
    assert.equal(out[0].sessions[0].hop, null);
  });
});
