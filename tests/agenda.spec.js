import { test, expect } from './fixtures.js';
import { API, visit, bookableFor, laneFor } from './helpers.js';

// Day 1 (index 1) is untouched by the seed's attended morning; the clock is
// pinned to Day 1 afternoon so "today" is that day for every state below.

async function book(request, user, ids) {
  for (const id of ids) {
    const day = (await (await request.get(`${API}/sessions/${id}`)).json()).day;
    const res = await request.put(`${API}/users/${user}/reservations/${id}`, { data: { day, time: '08:00' } });
    expect(res.ok()).toBeTruthy();
  }
}

test.describe('My Agenda is your day', () => {
  test('lists confirmed seats as large clickable cards, and removes one after confirming', async ({ page, request }, testInfo) => {
    const { user, day } = await laneFor('agenda.page', testInfo);
    const at = `${day}T14:26`;
    const open = await bookableFor(request, user, day);
    // two seats that do not overlap each other, or the second is a clash
    const first0 = open[0];
    const free = [first0, open.find((s) => s.startsAt >= first0.endsAt)];
    expect(free[1]).toBeTruthy();
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
      const before = await first.evaluate((el) => getComputedStyle(el).translate);
      await first.hover();
      await expect.poll(() => first.evaluate((el) => getComputedStyle(el).translate)).not.toBe(before);

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

test.describe('My Agenda rail', () => {
  const railVsCard = (card) => card.evaluate((el) => {
    const rail = el.querySelector('[data-testid="agenda-rail"]');
    return { rail: rail.getBoundingClientRect().height, card: el.getBoundingClientRect().height };
  });

  test('draws down to the full card height, and is whole from the start under reduced motion', async ({ page }, testInfo) => {
    const { user, day } = await laneFor('agenda.rail', testInfo);
    const at = `${day}T08:00`;

    await visit(page, `/my-agenda?at=${at}`, { as: user, at });
    const card = page.getByTestId('agenda-card').first();
    await expect(card).toBeVisible();
    await expect.poll(async () => { const m = await railVsCard(card); return Math.abs(m.card - m.rail); }).toBeLessThanOrEqual(2);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await visit(page, `/my-agenda?at=${at}`, { as: user, at });
    await expect(card).toBeVisible();
    const m = await railVsCard(card);
    expect(Math.abs(m.card - m.rail)).toBeLessThanOrEqual(2);
  });
});

test.describe('My Agenda is in the nav', () => {
  test('the nav link and the old /my-plan address both land on the agenda', async ({ page }, testInfo) => {
    await visit(page, '/');
    // Desktop shows the main nav; a phone hides it behind the menu button.
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: /My Agenda/ }).click();
    } else {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /My Agenda/ }).click();
    }
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByTestId('agenda-hero')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your day' })).toBeVisible();

    await visit(page, '/my-plan');
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByTestId('agenda-hero')).toBeVisible();
  });
});
