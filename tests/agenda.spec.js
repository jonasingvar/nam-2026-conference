import { test, expect } from '@playwright/test';
import { API, ATTENDEES, visit, momentOn, laneFor, bookableFor, shotForPR, failOnPageErrors } from './helpers.js';

const noOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('My Agenda', () => {
  test('lists what I hold, not what has ended', async ({ page, request }) => {
    const errors = failOnPageErrors(page);
    const at = await momentOn(0, '12:30');
    const clock = { day: at.slice(0, 10), time: '12:30' };
    const me = await (await request.get(`${API}/users/${ATTENDEES.jonas}`)).json();
    const all = await (await request.get(`${API}/sessions`)).json();
    const byId = new Map(all.map((s) => [s.id, s]));
    const ended = (s) => s.day < clock.day || (s.day === clock.day && s.endsAt <= clock.time);
    const mine = me.reservations.map((r) => byId.get(r.sessionId)).filter(Boolean);

    await visit(page, '/my-agenda', { as: ATTENDEES.jonas, at });
    const items = page.getByTestId('agenda-item');
    await expect(items.first()).toBeVisible();
    await expect(items).toHaveCount(mine.filter((s) => !ended(s)).length);
    for (const s of mine.filter(ended)) await expect(page.locator(`[data-session-id="${s.id}"]`)).toHaveCount(0);

    const first = items.first();
    await expect(first.getByTestId('agenda-status')).toHaveText(/Seat|Waitlist/);
    await expect(first).toContainText(/\d:\d\d [AP]M/);
    const dates = await page.getByTestId('agenda-day').evaluateAll((els) => els.map((e) => e.dataset.date));
    expect(dates).toEqual([...dates].sort());
    expect(await noOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('flags a hop that won\'t fit, and removing a seat clears it without a reload', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.hop', testInfo);
    const boot = await (await request.get(`${API}/bootstrap`)).json();
    const free = (await bookableFor(request, lane.user, lane.day)).filter((s) => s.seatsLeft > 3);
    const mins = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
    let pair = null;
    for (const a of free) {
      for (const b of free) {
        if (a.venue.id === b.venue.id || b.startsAt < a.endsAt) continue;
        const gap = mins(b.startsAt) - mins(a.endsAt);
        const fastest = Math.min(...boot.travel
          .filter((t) => t.fromVenueId === a.venue.id && t.toVenueId === b.venue.id && t.mode !== 'Walk')
          .map((t) => t.minutes + (b.room.walkMinutes ?? 0)));
        // consecutive: nothing of ours sits between them, and the gap is too short
        if (gap < fastest && gap >= 0) { pair = { a, b, gap, fastest }; break; }
      }
      if (pair) break;
    }
    expect(pair, 'no cross-town pair with a gap that is too short').toBeTruthy();

    const put = (id) => request.put(`${API}/users/${lane.user}/reservations/${id}`, { data: { day: lane.day, time: '07:00' } });
    const del = (id) => request.delete(`${API}/users/${lane.user}/reservations/${id}`);
    try {
      expect((await put(pair.a.id)).ok()).toBe(true);
      expect((await put(pair.b.id)).ok()).toBe(true);

      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T07:00` });
      const hop = page.getByTestId('agenda-hop');
      await expect(hop).toContainText(`${pair.fastest} min`);
      await expect(hop).toContainText(`you have ${pair.gap}`);
      await shotForPR(page, 'a hop between two seats that the gap cannot cover is flagged');
      expect(await noOverflow(page)).toBe(true);

      await page.locator(`[data-session-id="${pair.b.id}"]`).getByRole('button', { name: /Remove/ }).click();
      await expect(page.locator(`[data-session-id="${pair.b.id}"]`)).toHaveCount(0);
      await expect(hop).toHaveCount(0);
      await expect(page.locator(`[data-session-id="${pair.a.id}"]`)).toBeVisible();
    } finally {
      await del(pair.a.id);
      await del(pair.b.id);
    }
  });

  test('empty state links to the schedule', async ({ page }) => {
    await visit(page, '/my-agenda', { as: ATTENDEES.jonas, at: await momentOn(3, '23:00') });
    const empty = page.getByTestId('agenda-empty');
    await expect(empty).toBeVisible();
    await expect(empty.getByRole('link')).toHaveAttribute('href', '/schedule');
  });
});
