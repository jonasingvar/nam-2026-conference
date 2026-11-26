import { test, expect } from './fixtures.js';
import { API, visit, laneFor, bookableFor, clearAgendaFor, failOnPageErrors } from './helpers.js';

/** Book three sessions on the lane's day, the third last, and pin the clock to 14:00 of that day. */
async function arrange(request, testInfo) {
  const lane = await laneFor('agenda.page', testInfo);
  await clearAgendaFor(request, lane.user, lane.day);
  const open = (await bookableFor(request, lane.user, lane.day)).filter((s) => s.seatsLeft > 20 && s.speakers.length);
  const chosen = [];
  for (const s of open) {
    if (chosen.every((c) => !(c.startsAt < s.endsAt && s.startsAt < c.endsAt))) chosen.push(s);
    if (chosen.length === 2) break;
  }
  expect(chosen).toHaveLength(2);
  for (const s of chosen) {
    const res = await request.put(`${API}/users/${lane.user}/reservations/${s.id}`);
    expect(res.status(), JSON.stringify(await res.json())).toBe(200);
    expect((await res.json()).status).toBe('confirmed');
  }
  return { lane, chosen, at: `${lane.day}T07:30` };
}
const release = (request, lane, ids) =>
  Promise.all(ids.map((id) => request.delete(`${API}/users/${lane.user}/reservations/${id}`)));

test.describe('My Agenda', () => {
  // One test: it owns the lane's attendee and day, which concurrent tests may not share.
  test('lists today\'s seats as large linked cards and gives one back only after confirming', async ({ page, request }, testInfo) => {
    const { lane, chosen, at } = await arrange(request, testInfo);
    const [first, second] = chosen;
    const errors = failOnPageErrors(page);
    const held = async (id) => {
      const me = await (await request.get(`${API}/users/${lane.user}`)).json();
      return me.reservations.some((r) => r.sessionId === id && r.status === 'confirmed');
    };
    try {
      await visit(page, '/my-agenda', { as: lane.user, at });
      await expect(page.getByTestId('agenda-day')).toBeVisible();
      await expect(page.locator('[data-testid^="agenda-card-"]')).toHaveCount(2);

      const card = page.getByTestId(`agenda-card-${first.id}`);
      expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(150);
      await expect(card).toContainText(first.title);
      await expect(card).toContainText(first.speakers[0].name);
      await expect(card).toContainText(first.room.name);
      await expect(card).toContainText(first.venue.shortName);
      await expect(card.locator('img')).toHaveCount(first.speakers.length);

      const rail = card.getByTestId('agenda-rail');
      expect(await rail.evaluate((el) => getComputedStyle(el).animationName)).toBe('rail-draw');

      // hover lifts the card (a touch phone has no hover)
      if (testInfo.project.name === 'desktop') {
        const before = await card.evaluate((el) => getComputedStyle(el).transform);
        await card.hover({ position: { x: 300, y: 10 } });
        await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
      }

      // a portrait goes to the speaker, not the session
      await card.locator('a[href^="/speakers/"]').first().click();
      await expect(page).toHaveURL(new RegExp(`/speakers/${first.speakers[0].id}$`));
      await page.goBack();

      // the rest of the card goes to the session
      await page.getByTestId(`agenda-card-${first.id}`).click({ position: { x: 200, y: 8 } });
      await expect(page).toHaveURL(new RegExp(`/sessions/${first.id}$`));
      await page.goBack();

      // Remove asks first: Escape keeps the seat, confirm gives it back
      await page.getByTestId(`agenda-remove-${first.id}`).click();
      await expect(page.getByTestId('agenda-remove-dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('agenda-remove-dialog')).toHaveCount(0);
      expect(await held(first.id)).toBe(true);
      await expect(page.getByTestId(`agenda-card-${first.id}`)).toBeVisible();

      await page.getByTestId(`agenda-remove-${first.id}`).click();
      await page.getByTestId('agenda-remove-confirm').click();
      await expect(page.getByTestId(`agenda-card-${first.id}`)).toHaveCount(0);
      await expect(page.getByTestId(`agenda-card-${second.id}`)).toBeVisible();
      expect(await held(first.id)).toBe(false);

      await page.getByTestId(`agenda-remove-${second.id}`).click();
      await page.getByTestId('agenda-remove-confirm').click();
      await expect(page.getByTestId('agenda-empty')).toBeVisible();
    } finally {
      await release(request, lane, chosen.map((s) => s.id));
    }
    expect(errors).toEqual([]);
  });
});
