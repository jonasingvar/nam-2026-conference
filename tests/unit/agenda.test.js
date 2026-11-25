import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dayAgenda } from '../../src/lib/agenda.js';

const s = (id, day, startsAt) => ({ id, day, startsAt });
const schedule = {
  days: [
    { date: '2026-11-25', sessions: [s(3, '2026-11-25', '11:00'), s(1, '2026-11-25', '09:00'), s(2, '2026-11-25', '10:00')] },
    { date: '2026-11-26', sessions: [s(9, '2026-11-26', '09:00')] },
  ],
};

describe('My Agenda lists the seats you hold today', () => {
  test('keeps confirmed seats of the day, sorted by start, and drops waitlist places', () => {
    const state = { 1: 'confirmed', 2: 'waitlisted', 3: 'confirmed', 9: 'confirmed' };
    const rows = dayAgenda(schedule, '2026-11-25', (id) => state[id] ?? null);
    assert.deepEqual(rows.map((r) => r.id), [1, 3]);
  });

  test('the store decides: a seat released since the fetch is gone', () => {
    const rows = dayAgenda(schedule, '2026-11-25', (id) => (id === 3 ? 'confirmed' : null));
    assert.deepEqual(rows.map((r) => r.id), [3]);
  });

  test('no schedule yet, or a day without seats, is an empty list', () => {
    assert.deepEqual(dayAgenda(null, '2026-11-25', () => 'confirmed'), []);
    assert.deepEqual(dayAgenda(schedule, '2030-01-01', () => 'confirmed'), []);
  });
});
