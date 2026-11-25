import { test, expect } from './fixtures.js';
import { API, visit, momentOn, laneFor, bookableFor, conferenceDays } from './helpers.js';

test.describe('My Agenda lists the day you hold seats for', () => {
  test('cards, portraits, remove, line and hover', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.page', testInfo);
    const free = await bookableFor(request, lane.user, lane.day);
    const first = free[0];
    const second = free.find((s) => s.startsAt >= first.endsAt);
    const other = free.find((s) => s !== first && s !== second && s.startsAt < first.endsAt) ?? null;
    const booked = [first, second];
    const day = (await conferenceDays()).indexOf(lane.day);
    try {
      for (const s of booked) {
        const r = await request.put(`${API}/users/${lane.user}/reservations/${s.id}`, { data: {} });
        expect(r.ok()).toBeTruthy();
      }
      await visit(page, '/my-agenda', { as: lane.user, at: await momentOn(day, '08:00') });

      const cards = page.locator('[data-testid^="agenda-session-"]');
      await expect(page.getByTestId('agenda-day')).toBeVisible();
      await expect(page.getByTestId(`agenda-session-${first.id}`)).toBeVisible();
      await expect(page.getByTestId(`agenda-session-${second.id}`)).toBeVisible();
      const ids = await cards.evaluateAll((els) => els.map((e) => e.dataset.testid));
      expect(ids.indexOf(`agenda-session-${first.id}`)).toBeLessThan(ids.indexOf(`agenda-session-${second.id}`));
      if (other) await expect(page.getByTestId(`agenda-session-${other.id}`)).toHaveCount(0);

      // large card with speaker, role/company and room · venue
      const card = page.getByTestId(`agenda-session-${first.id}`);
      const detail = await (await request.get(`${API}/sessions/${first.id}`)).json();
      const sp = detail.speakers[0];
      expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(testInfo.project.name === 'mobile' ? 120 : 160);
      await expect(card).toContainText(sp.company);
      await expect(card).toContainText(`${detail.room.name} · ${detail.venue.shortName}`);

      // portraits link to the speaker
      const link = card.getByTestId(`agenda-speaker-${sp.id}`);
      await expect(link).toHaveAttribute('href', `/speakers/${sp.id}`);
      await expect(link.locator('img')).toHaveCount(1);

      // line animates in the track colour; hover lifts the card
      await expect(page.getByTestId(`agenda-line-${first.id}`)).toHaveClass(/animate-line-grow/);
      await card.hover();
      await expect.poll(() => card.evaluate((e) => getComputedStyle(e).transform)).not.toBe('none');

      // no reserve control, only Remove
      await expect(page.getByRole('button', { name: /^(add|reserve)/i })).toHaveCount(0);

      // remove
      await page.getByTestId(`agenda-remove-${first.id}`).click();
      await expect(page.getByTestId(`agenda-session-${first.id}`)).toHaveCount(0);
      await expect(page.getByTestId(`agenda-session-${second.id}`)).toBeVisible();
      const me = await (await request.get(`${API}/users/${lane.user}`)).json();
      expect(me.reservations.some((r) => r.sessionId === first.id)).toBe(false);

      // portrait click lands on the speaker
      await page.getByTestId(`agenda-session-${second.id}`).locator('[data-testid^="agenda-speaker-"]').first().click();
      await expect(page).toHaveURL(/\/speakers\/\d+$/);
    } finally {
      for (const s of booked) await request.delete(`${API}/users/${lane.user}/reservations/${s.id}`);
    }
  });
});
