import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todaysSeats } from '../../src/lib/agenda.js';

/**
 * What Home opens with: the sessions the attendee holds a seat for on the
 * current conference day.
 *
 * The store — not the payload a page was fetched with — is the source of truth
 * for your own reservations (CLAUDE.md § There is exactly one action), so a
 * seat given back must leave the list even though `/users/:id/schedule` still
 * carries the reservation row. A waitlist place is not a seat: it may never
 * come good, so it is never an hour you hold.
 */

const session = (id, startsAt, day = '2026-11-25') => ({ id, day, startsAt, endsAt: '23:00', title: `Session ${id}` });
const plan = () => [
  { date: '2026-11-24', sessions: [session(9, '09:00', '2026-11-24')] },
  { date: '2026-11-25', sessions: [session(1, '09:00'), session(2, '10:15'), session(3, '11:30')] },
];

test('keeps the confirmed seats and drops a waitlist place', () => {
  const held = { 1: 'confirmed', 2: 'waitlisted' };
  const seats = todaysSeats(plan(), '2026-11-25', (id) => held[id] ?? null);
  assert.deepEqual(seats.map((s) => s.id), [1]);
});

test('a seat released on the page is gone, even though the payload still lists it', () => {
  const payload = plan();
  payload[1].sessions = payload[1].sessions.map((s) => ({ ...s, reservation: 'confirmed' }));
  assert.deepEqual(todaysSeats(payload, '2026-11-25', () => null).map((s) => s.id), []);
});

test('only the given day, earliest first', () => {
  const seats = todaysSeats(plan(), '2026-11-25', () => 'confirmed');
  assert.deepEqual(seats.map((s) => s.id), [1, 2, 3]);
});

test('a day with nothing on it is empty, not the rest of the plan', () => {
  assert.deepEqual(todaysSeats(plan(), '2026-11-26', () => 'confirmed'), []);
});

test('no schedule yet is no seats, not a crash', () => {
  assert.deepEqual(todaysSeats(undefined, '2026-11-25', () => 'confirmed'), []);
  assert.deepEqual(todaysSeats([], '2026-11-25', () => 'confirmed'), []);
});

test('sorting does not reorder the payload it was handed', () => {
  const payload = plan();
  todaysSeats(payload, '2026-11-25', () => 'confirmed');
  assert.deepEqual(payload[1].sessions.map((s) => s.id), [1, 2, 3]);
});
