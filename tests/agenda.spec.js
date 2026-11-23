import { test, expect } from '@playwright/test';
import { API, ATTENDEES, visit, momentOn, laneFor, bookableFor, shotForPR } from './helpers.js';

const noOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('My Agenda', () => {
  test('lists upcoming sessions by day with seat or waitlist; ended ones are gone', async ({ page, request }) => {
    const sched = await (await request.get(`${API}/users/${ATTENDEES.jonas}/schedule`)).json();
    const seeded = sched.days[1];   // Day 2 is Jonas's read-only fixture
    const byStart = seeded.sessions.slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const morning = byStart[0];
    const afternoon = byStart.find((s) => s.startsAt >= '13:00');

    await visit(page, '/my-agenda', { at: await momentOn(1, '08:00') });
    const day = page.getByTestId(`agenda-day-${seeded.date}`);
    await expect(day).toBeVisible();
    const row = page.getByTestId(`agenda-item-${morning.id}`);
    await expect(row).toContainText(morning.title);
    await expect(row).toContainText(morning.room.name);
    await expect(row).toContainText(morning.venue.name);
    await expect(row).toContainText('Seat');
    const ids = await day.locator('[data-testid^="agenda-item-"]').evaluateAll((els) => els.map((e) => e.dataset.testid));
    expect(ids.slice(0, byStart.length).slice(0, 2)).toEqual(byStart.slice(0, 2).map((s) => `agenda-item-${s.id}`));
    expect(await noOverflow(page)).toBe(true);

    // Once the morning is over it is no longer listed; what is still ahead is.
    await visit(page, '/my-agenda', { at: await momentOn(1, '12:30') });
    await expect(page.getByTestId(`agenda-item-${afternoon.id}`)).toBeVisible();
    await expect(page.getByTestId(`agenda-item-${morning.id}`)).toHaveCount(0);
  });

  test('clashes and cross-town hops are flagged, and removing one clears the flags without a reload', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.remove', testInfo);
    const bookable = await bookableFor(request, lane.user, lane.day);
    const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
    const open = bookable.filter((s) => !s.isFull);
    const overlap = (x, y) => x.startsAt < y.endsAt && y.startsAt < x.endsAt;

    // Two seats at different venues whose gap is shorter than the fastest ride (18 min) plus the walk.
    let from, to;
    for (const a of open) {
      to = open.find((b) => b.venue.id !== a.venue.id && mins(b.startsAt) >= mins(a.endsAt)
        && mins(b.startsAt) - mins(a.endsAt) < 18 + b.room.walkMinutes);
      if (to) { from = a; break; }
    }
    expect(to, 'a cross-town pair that cannot be made on the lane day').toBeTruthy();

    const free = bookable.filter((s) => !overlap(s, from) && !overlap(s, to));
    const full = free.find((f) => f.isFull && free.some((o) => o.id !== f.id && !o.isFull && overlap(o, f)));
    expect(full, 'a full session with a free overlapping partner on the lane day').toBeTruthy();
    const seat = free.find((o) => o.id !== full.id && !o.isFull && overlap(o, full));
    try {
      // Waitlist first: the overlap guard only looks at confirmed seats.
      await request.put(`${API}/users/${lane.user}/reservations/${full.id}`, { data: {} });
      await request.put(`${API}/users/${lane.user}/reservations/${seat.id}`, { data: {} });
      await request.put(`${API}/users/${lane.user}/reservations/${from.id}`, { data: {} });
      await request.put(`${API}/users/${lane.user}/reservations/${to.id}`, { data: {} });
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T08:00` });
      const a = page.getByTestId(`agenda-item-${seat.id}`);
      const b = page.getByTestId(`agenda-item-${full.id}`);
      await expect(a.getByTestId('agenda-clash')).toContainText(full.title);
      await expect(b.getByTestId('agenda-clash')).toContainText(seat.title);
      await expect(b).toContainText('Waitlist');
      await expect(a).toContainText('Seat');
      await expect(page.getByTestId(`agenda-item-${from.id}`).getByTestId('agenda-hop')).toHaveCount(0);
      await expect(page.getByTestId(`agenda-item-${to.id}`).getByTestId('agenda-hop'))
        .toContainText(/Cross-town hop won't fit — \d+ min by \w+, \d+ min gap/);
      await shotForPR(page, 'My Agenda flagging a clash and a cross-town hop');

      await b.getByRole('button', { name: 'Remove' }).click();
      await expect(b).toHaveCount(0);
      await expect(a.getByTestId('agenda-clash')).toHaveCount(0);
    } finally {
      for (const id of [full.id, seat.id, from.id, to.id]) await request.delete(`${API}/users/${lane.user}/reservations/${id}`);
    }
  });

  test('with nothing upcoming it offers the schedule', async ({ page }) => {
    await visit(page, '/my-agenda', { at: await momentOn(3, '23:30') });
    const empty = page.getByTestId('agenda-empty');
    await expect(empty).toBeVisible();
    await expect(empty.getByRole('link', { name: /schedule/i })).toHaveAttribute('href', '/schedule');
    expect(await noOverflow(page)).toBe(true);
  });
});
