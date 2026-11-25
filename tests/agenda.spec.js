import { test, expect } from './fixtures.js';
import { API, visit, momentOn, bookableFor, ATTENDEES } from './helpers.js';

// Day 1 (index 1) is untouched by the seed's attended morning; the clock is
// pinned to Day 1 afternoon so "today" is that day for every state below.
const LANE = { desktop: ATTENDEES.jonas, mobile: ATTENDEES.abraham };

async function book(request, user, ids) {
  for (const id of ids) {
    const day = (await (await request.get(`${API}/sessions/${id}`)).json()).day;
    const res = await request.put(`${API}/users/${user}/reservations/${id}`, { data: { day, time: '08:00' } });
    expect(res.ok()).toBeTruthy();
  }
}

test.describe('My Agenda is your day', () => {
  test('lists confirmed seats as large clickable cards, and removes one after confirming', async ({ page, request }, testInfo) => {
    const user = LANE[testInfo.project.name];
    const at = await momentOn(1, '14:26');
    const day = at.split('T')[0];
    const free = (await bookableFor(request, user, day)).slice(0, 2);
    expect(free.length).toBe(2);
    const ids = free.map((s) => s.id);
    await book(request, user, ids);
    try {
      await visit(page, `/my-agenda?at=${at}`, { as: user, at });
      for (const id of ids) await expect(page.locator(`[data-testid="agenda-card"][data-session-id="${id}"]`)).toBeVisible();
      await expect(page.getByTestId('agenda-coming-soon')).toHaveCount(0);

      // size, content, accent rail
      const first = page.locator(`[data-testid="agenda-card"][data-session-id="${ids[0]}"]`);
      expect((await first.boundingBox()).height).toBeGreaterThan(150);
      await expect(first).toContainText(free[0].title);
      await expect(first).toContainText(free[0].roomName ?? free[0].room?.name);
      await expect(first.getByTestId('agenda-rail')).toHaveAttribute('data-accent', /\w+/);

      // hover effect
      const before = await first.evaluate((el) => getComputedStyle(el).transform);
      await first.hover();
      await expect.poll(() => first.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);

      // portrait links to the speaker
      const portrait = first.getByTestId('agenda-speaker').first();
      expect(await portrait.getAttribute('href')).toMatch(/^\/speakers\/\d+$/);

      // cancel keeps it, confirm removes it
      await first.getByTestId('agenda-remove').click();
      await expect(page.getByTestId('agenda-confirm')).toBeVisible();
      await page.getByTestId('agenda-confirm-cancel').click();
      await expect(first).toBeVisible();
      await first.getByTestId('agenda-remove').click();
      await page.getByTestId('agenda-confirm-ok').click();
      await expect(first).toHaveCount(0);
      await expect(page.locator(`[data-testid="agenda-card"][data-session-id="${ids[1]}"]`)).toBeVisible();
      const me = await (await request.get(`${API}/users/${user}`)).json();
      expect(me.reservations.some((r) => r.sessionId === ids[0])).toBe(false);

      // the whole card opens the session
      await page.locator(`[data-testid="agenda-card"][data-session-id="${ids[1]}"]`).click({ position: { x: 300, y: 20 } });
      await expect(page).toHaveURL(new RegExp(`/sessions/${ids[1]}$`));
    } finally {
      for (const id of ids) await request.delete(`${API}/users/${user}/reservations/${id}`);
    }
  });
});
