import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { todaysSeats } from '../../src/lib/agenda.js';

const s = (id, day, startsAt) => ({ id, day, startsAt });
const schedule = [
  { date: '2026-11-25', sessions: [s(3, '2026-11-25', '10:15'), s(1, '2026-11-25', '08:00'), s(2, '2026-11-25', '09:00'), s(4, '2026-11-25', '11:00')] },
  { date: '2026-11-26', sessions: [s(5, '2026-11-26', '08:00')] },
];
const status = (map) => (id) => map[id] ?? null;

describe('My Agenda lists the seats you hold today', () => {
  test('only confirmed seats on the day, earliest first', () => {
    const got = todaysSeats(schedule, status({ 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed', 5: 'confirmed' }), '2026-11-25');
    assert.deepEqual(got.map((x) => x.id), [1, 3]);
  });

  test('a seat given back in the store disappears even if the payload still has it', () => {
    const got = todaysSeats(schedule, status({ 1: 'confirmed' }), '2026-11-25');
    assert.deepEqual(got.map((x) => x.id), [1]);
    assert.deepEqual(todaysSeats(schedule, status({}), '2026-11-25'), []);
  });

  test('a day with nothing booked, or no schedule yet, is empty', () => {
    assert.deepEqual(todaysSeats(schedule, status({ 1: 'confirmed' }), '2026-11-27'), []);
    assert.deepEqual(todaysSeats(null, status({}), '2026-11-25'), []);
  });
});
