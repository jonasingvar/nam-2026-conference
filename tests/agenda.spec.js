import { test, expect } from '@playwright/test';
import { API, visit, momentOn, laneFor, bookableFor, shotForPR, failOnPageErrors, ATTENDEES } from './helpers.js';

const noOverflow = async (page, testInfo) => {
  if (testInfo.project.name !== 'mobile') return;
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
};

test('lists what I hold, upcoming only, grouped by day', async ({ page }, testInfo) => {
  const errors = failOnPageErrors(page);
  await visit(page, '/my-agenda', { as: ATTENDEES.jonas, at: await momentOn(0, '12:30') });
  const items = page.getByTestId('agenda-item');
  await expect(items.first()).toBeVisible();
  const mine = await (await page.request.get(`${API}/users/${ATTENDEES.jonas}/schedule`)).json();
  const all = mine.days.flatMap((d) => d.sessions);
  const day1 = (await momentOn(0, '12:30')).split('T')[0];
  const ended = all.filter((s) => s.day === day1 && s.endsAt <= '12:30');
  for (const s of ended) await expect(page.locator(`[data-session-id="${s.id}"]`)).toHaveCount(0);
  for (const item of await items.all()) {
    await expect(item).toContainText(/\d{1,2}:\d{2} (AM|PM)/);
    await expect(item.getByTestId('agenda-status')).toHaveText(/Seat|Waitlist/);
    const id = Number(await item.getAttribute('data-session-id'));
    const s = all.find((x) => x.id === id);
    await expect(item).toContainText(s.title);
    await expect(item).toContainText(s.room.name);
    await expect(item).toContainText(s.venue.name);
  }
  const dates = await page.getByTestId('agenda-day').evaluateAll((els) => els.map((e) => e.dataset.date));
  expect(dates).toEqual([...dates].sort());
  for (const day of mine.days) {
    for (const c of day.conflicts) {
      for (const id of [c.a?.id, c.b?.id].filter(Boolean)) {
        if (await page.locator(`[data-session-id="${id}"]`).count()) {
          await expect(page.locator(`[data-session-id="${id}"]`).getByTestId('agenda-clash').first()).toBeVisible();
        }
      }
    }
  }
  await noOverflow(page, testInfo);
  expect(errors).toEqual([]);
});

test('empty state', async ({ page }, testInfo) => {
  await visit(page, '/my-agenda', { as: ATTENDEES.jonas, at: await momentOn(3, '23:00') });
  const empty = page.getByTestId('agenda-empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('link')).toHaveAttribute('href', '/schedule');
  await noOverflow(page, testInfo);
});

test('flags a hop that won\'t fit, and clears it on removal', async ({ page, request }, testInfo) => {
  const lane = await laneFor('agenda.hop', testInfo);
  const boot = await (await request.get(`${API}/bootstrap`)).json();
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const free = (await bookableFor(request, lane.user, lane.day))
    .filter((s) => s.seatsLeft > 3 && s.venue?.id != null || s.venueId != null);
  const venueOf = (s) => s.venue?.id ?? s.venueId;
  const fastest = (s, t) => Math.min(...boot.travel
    .filter((r) => r.fromVenueId === venueOf(s) && r.toVenueId === venueOf(t) && r.mode !== 'Walk')
    .map((r) => r.minutes));
  const rooms = Object.fromEntries(boot.rooms.map((r) => [r.id, r]));
  const walk = (s) => rooms[s.roomId ?? s.room?.id]?.walkMinutes ?? 0;
  let pair = null;
  for (const a of free) {
    for (const b of free) {
      if (venueOf(a) === venueOf(b) || mins(b.startsAt) < mins(a.endsAt)) continue;
      if (mins(b.startsAt) - mins(a.endsAt) < fastest(a, b) + walk(b)) { pair = [a, b]; break; }
    }
    if (pair) break;
  }
  test.skip(!pair, 'no cross-town pair in the lane');
  const put = (id) => request.put(`${API}/users/${lane.user}/reservations/${id}`, { data: {} });
  try {
    for (const s of pair) expect((await put(s.id)).ok()).toBe(true);
    await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T08:00` });
    const hop = page.getByTestId('agenda-hop');
    await expect(hop).toHaveCount(1);
    await expect(hop).toContainText(/takes \d+ min, you have \d+/);
    await shotForPR(page, 'a hop that will not fit');
    await noOverflow(page, testInfo);
    await page.locator(`[data-session-id="${pair[1].id}"]`).getByRole('button', { name: /Remove/ }).click();
    await expect(page.locator(`[data-session-id="${pair[1].id}"]`)).toHaveCount(0);
    await expect(hop).toHaveCount(0);
  } finally {
    for (const s of pair) await request.delete(`${API}/users/${lane.user}/reservations/${s.id}`);
  }
});
