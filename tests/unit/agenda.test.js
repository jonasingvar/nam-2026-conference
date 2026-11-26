import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { todaysSeats } from '../../src/lib/agenda.js';

const s = (id, startsAt) => ({ id, startsAt });
const days = [
  { date: '2026-11-25', sessions: [s(3, '11:00'), s(1, '09:00'), s(2, '10:00'), s(4, '12:00')] },
  { date: '2026-11-26', sessions: [s(9, '09:00')] },
];
const store = (map) => (id) => (map[id] ?? null);

describe('My Agenda lists the seats you hold today', () => {
  test('keeps confirmed seats on the day, in start order', () => {
    const got = todaysSeats(days, '2026-11-25', store({ 3: 'confirmed', 1: 'confirmed' }));
    assert.deepEqual(got.map((x) => x.id), [1, 3]);
  });

  test('drops waitlisted places, released seats and other days', () => {
    const got = todaysSeats(days, '2026-11-25', store({ 1: 'waitlisted', 2: 'confirmed', 9: 'confirmed' }));
    assert.deepEqual(got.map((x) => x.id), [2]);
  });

  test('a day with no entry is empty', () => {
    assert.deepEqual(todaysSeats(days, '2026-12-01', store({})), []);
    assert.deepEqual(todaysSeats(undefined, '2026-11-25', store({})), []);
  });
});
