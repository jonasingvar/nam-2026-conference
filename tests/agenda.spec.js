import { test, expect } from './fixtures.js';
import { API, visit, laneFor, bookableFor, clearAgendaFor, failOnPageErrors } from './helpers.js';

/** Book three sessions on the lane's day, the third last, and pin the clock to 14:00 of that day. */
async function arrange(request, testInfo) {
  const lane = await laneFor('agenda.page', testInfo);
  await clearAgendaFor(request, lane.user, lane.day);
  const open = (await bookableFor(request, lane.user, lane.day)).filter((s) => !s.isFull && s.speakers.length);
  const chosen = [];
  for (const s of open) {
    if (chosen.every((c) => !(c.startsAt < s.endsAt && s.startsAt < c.endsAt))) chosen.push(s);
    if (chosen.length === 2) break;
  }
  expect(chosen).toHaveLength(2);
  for (const s of chosen) await request.put(`${API}/users/${lane.user}/reservations/${s.id}`);
  return { lane, chosen, at: `${lane.day}T07:30` };
}
const release = (request, lane, ids) =>
  Promise.all(ids.map((id) => request.delete(`${API}/users/${lane.user}/reservations/${id}`)));

test.describe('My Agenda', () => {
  test('lists the seats held today, with speakers, venue, a drawn rail and a clickable card', async ({ page, request }, testInfo) => {
    const { lane, chosen, at } = await arrange(request, testInfo);
    const errors = failOnPageErrors(page);
    try {
      await visit(page, '/my-agenda', { as: lane.user, at });
      await expect(page.getByTestId('agenda-day')).toBeVisible();
      // all cards arrive at once — the list is never partly drawn
      await expect(page.locator('[data-testid^="agenda-card-"]')).toHaveCount(2);

      const [first] = chosen;
      const card = page.getByTestId(`agenda-card-${first.id}`);
      expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(150);
      await expect(card).toContainText(first.title);
      await expect(card).toContainText(first.speakers[0].name);
      await expect(card).toContainText(first.room.name);
      await expect(card).toContainText(first.venue.name);
      await expect(card.locator('img')).toHaveCount(first.speakers.length);

      const rail = card.getByTestId('agenda-rail');
      expect(await rail.evaluate((el) => getComputedStyle(el).animationName)).toBe('rail-draw');

      // hover lifts the card
      const before = await card.evaluate((el) => getComputedStyle(el).transform);
      await card.hover({ position: { x: 300, y: 10 } });
      await expect.poll(() => card.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);

      // the whole card is a link to the session
      await card.click({ position: { x: 400, y: 8 } });
      await expect(page).toHaveURL(new RegExp(`/sessions/${first.id}$`));
    } finally {
      await release(request, lane, chosen.map((s) => s.id));
    }
    expect(errors).toEqual([]);
  });

  test('a speaker portrait goes to the speaker, not the session', async ({ page, request }, testInfo) => {
    const { lane, chosen, at } = await arrange(request, testInfo);
    try {
      await visit(page, '/my-agenda', { as: lane.user, at });
      const first = chosen[0];
      await page.getByTestId(`agenda-card-${first.id}`).locator('a[href^="/speakers/"]').first().click();
      await expect(page).toHaveURL(new RegExp(`/speakers/${first.speakers[0].id}$`));
    } finally {
      await release(request, lane, chosen.map((s) => s.id));
    }
  });

  test('Remove asks first; cancel keeps the seat, confirm gives it back', async ({ page, request }, testInfo) => {
    const { lane, chosen, at } = await arrange(request, testInfo);
    const [first, second] = chosen;
    const held = async (id) => {
      const me = await (await request.get(`${API}/users/${lane.user}`)).json();
      return me.reservations.some((r) => r.sessionId === id && r.status === 'confirmed');
    };
    try {
      await visit(page, '/my-agenda', { as: lane.user, at });
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
    } finally {
      await release(request, lane, chosen.map((s) => s.id));
    }
  });

  test('an empty day says so', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.page', testInfo);
    await clearAgendaFor(request, lane.user, lane.day);
    await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T07:30` });
    await expect(page.getByTestId('agenda-empty')).toBeVisible();
  });
});
