import { test, expect } from '@playwright/test';
import { API, visit, momentOn, conferenceDays, laneFor, bookableFor, shotForPR, failOnPageErrors, ATTENDEES } from './helpers.js';

const noOverflow = async (page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

test.describe('My Agenda', () => {
  test('lists what I hold, without what has ended', async ({ page, request }, testInfo) => {
    const errors = failOnPageErrors(page);
    const me = await (await request.get(`${API}/users/${ATTENDEES.jonas}`)).json();
    const all = await (await request.get(`${API}/sessions`)).json();
    const byId = new Map(all.map((s) => [s.id, s]));
    const ended = me.reservations.map((r) => byId.get(r.sessionId)).filter((s) => s && s.endsAt <= '12:15' && s.day === all.map((x) => x.day).sort()[0]);
    expect(ended.length).toBeGreaterThan(0);

    await visit(page, '/my-agenda', { at: await momentOn(0, '12:30') });
    const items = page.getByTestId('agenda-item');
    await expect(items.first()).toBeVisible();
    for (const s of ended) await expect(page.locator(`[data-session-id="${s.id}"]`)).toHaveCount(0);

    for (const item of await items.all()) {
      await expect(item).toContainText(/\d{1,2}:\d{2} (AM|PM)/);
      await expect(item.getByRole('link')).not.toHaveText('');
      await expect(item.getByTestId('agenda-status')).toHaveText(/^(Seat|Waitlist)$/);
      await expect(item).toContainText('·');
    }
    const dates = await page.getByTestId('agenda-day').evaluateAll((els) => els.map((e) => e.dataset.date));
    expect(dates).toEqual([...dates].sort());
    if (testInfo.project.name === 'mobile') await noOverflow(page);
    expect(errors).toEqual([]);
  });

  test('flags a hop that will not fit, and clears it when a session is removed', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.hop', testInfo);
    const options = (await bookableFor(request, lane.user, lane.day)).filter((s) => s.seatsLeft > 3);
    let pair = null;
    for (const a of options) {
      const b = options.find((x) => x.venue.id !== a.venue.id && x.room.walkMinutes >= 13
        && x.startsAt >= a.endsAt && (Number(x.startsAt.slice(0, 2)) * 60 + Number(x.startsAt.slice(3)))
          - (Number(a.endsAt.slice(0, 2)) * 60 + Number(a.endsAt.slice(3))) <= 30);
      if (b) { pair = [a, b]; break; }
    }
    expect(pair, 'a cross-town pair with a tight gap').toBeTruthy();
    const [a, b] = pair;
    const days = await conferenceDays();
    const book = (s) => request.put(`${API}/users/${lane.user}/reservations/${s.id}`, { data: { day: days[0], time: '08:00' } });
    try {
      for (const s of pair) expect((await book(s)).ok()).toBe(true);
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T08:00` });
      await expect(page.locator(`[data-session-id="${b.id}"]`)).toBeVisible();
      // the seeded plan may carry hops of its own, so look only at the pair's second row
      const hop = page.locator(`[data-session-id="${b.id}"]`).getByTestId('agenda-hop');
      await expect(hop).toHaveCount(1);
      await expect(hop).toContainText(/\d+ min.*\d+ min/);
      if (testInfo.project.name === 'mobile') await noOverflow(page);
      await shotForPR(page, 'My Agenda flags a hop that will not fit');

      const url = page.url();
      await page.locator(`[data-session-id="${a.id}"]`).getByTestId('agenda-remove').click();
      await expect(page.locator(`[data-session-id="${a.id}"]`)).toHaveCount(0);
      await expect(hop).toHaveCount(0);
      await expect(page.locator(`[data-session-id="${b.id}"]`)).toBeVisible();
      expect(page.url()).toBe(url);
    } finally {
      for (const s of pair) await request.delete(`${API}/users/${lane.user}/reservations/${s.id}`);
    }
  });

  test('says so, and links to the schedule, when nothing is upcoming', async ({ page }) => {
    const days = await conferenceDays();
    await visit(page, '/my-agenda', { at: `${days.at(-1)}T23:00` });
    const empty = page.getByTestId('agenda-empty');
    await expect(empty).toBeVisible();
    await expect(page.getByTestId('agenda-item')).toHaveCount(0);
    await expect(empty.getByRole('link')).toHaveAttribute('href', '/schedule');
    await shotForPR(page, 'My Agenda empty state');
  });
});
