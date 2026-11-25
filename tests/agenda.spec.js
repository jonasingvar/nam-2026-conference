import { test, expect } from './fixtures.js';
import { API, visit, laneFor, bookableFor, failOnPageErrors } from './helpers.js';

/** Book the first two free sessions of the lane's day; the test releases them. */
async function book(request, lane, n = 2) {
  const picks = [];
  for (const s of await bookableFor(request, lane.user, lane.day)) {
    if (picks.length === n) break;
    if (s.isFull || picks.some((p) => p.startsAt < s.endsAt && s.startsAt < p.endsAt)) continue;
    const res = await request.put(`${API}/users/${lane.user}/reservations/${s.id}`, {
      data: { day: lane.day, time: '06:00' },
    });
    if (res.ok()) picks.push(s);
  }
  return picks;
}
const release = (request, lane, picks) =>
  Promise.all(picks.map((s) => request.delete(`${API}/users/${lane.user}/reservations/${s.id}`)));

test.describe('My Agenda', () => {
  test('lists my seats as large clickable cards, and removing one asks first', async ({ page, request }, testInfo) => {
    const errors = failOnPageErrors(page);
    const lane = await laneFor('agenda.page', testInfo);
    const picks = await book(request, lane);
    expect(picks.length).toBe(2);
    try {
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T23:00` });
      await expect(page.getByTestId('agenda-hero')).toContainText('Day 2');
      for (const s of picks) await expect(page.getByTestId(`agenda-session-${s.id}`)).toBeVisible();

      const [first, second] = picks;
      const card = page.getByTestId(`agenda-session-${first.id}`);
      await expect(card).toContainText(first.title);
      await expect(card).toContainText(first.room.name);
      await expect(card).toContainText('FINISHED', { ignoreCase: true });
      expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(150);

      // the rail is in the track colour and grows to the card's height
      const rail = card.getByTestId('agenda-rail');
      await expect.poll(async () => (await rail.boundingBox()).height).toBeGreaterThanOrEqual((await card.boundingBox()).height - 3);
      expect(await rail.evaluate((e) => getComputedStyle(e).animationName)).not.toBe('none');

      // hover lifts the card
      const before = await card.evaluate((e) => getComputedStyle(e).boxShadow);
      await card.hover();
      await expect.poll(() => card.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe(before);

      // a portrait goes to the speaker
      await card.getByTestId('agenda-speaker').first().click();
      await expect(page).toHaveURL(/\/speakers\/\d+$/);
      await page.goBack();

      // the card itself goes to the session
      const box = await page.getByTestId(`agenda-session-${first.id}`).boundingBox();
      await page.getByTestId(`agenda-session-${first.id}`).click({ position: { x: box.width - 10, y: 10 } });
      await expect(page).toHaveURL(new RegExp(`/sessions/${first.id}$`));
      await page.goBack();

      // remove: cancel keeps the seat, confirm releases it
      await page.getByTestId(`agenda-remove-${first.id}`).click();
      await page.getByRole('button', { name: 'Keep seat' }).click();
      await expect(page.getByTestId(`agenda-session-${first.id}`)).toBeVisible();
      await expect(page).toHaveURL(/\/my-agenda$/);

      await page.getByTestId(`agenda-remove-${first.id}`).click();
      await page.getByTestId('agenda-remove-confirm').click();
      await expect(page.getByTestId(`agenda-session-${first.id}`)).toHaveCount(0);
      await expect(page.getByTestId(`agenda-session-${second.id}`)).toBeVisible();
      const plan = await (await request.get(`${API}/users/${lane.user}/schedule`)).json();
      const held = plan.days.flatMap((d) => d.sessions).map((x) => x.id);
      expect(held).not.toContain(first.id);
      expect(held).toContain(second.id);
    } finally {
      await release(request, lane, picks);
    }
    expect(errors).toEqual([]);
  });

  test('an upcoming session is not marked finished', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.upcoming', testInfo);
    const picks = await book(request, lane, 1);
    try {
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T06:00` });
      await expect(page.getByTestId(`agenda-session-${picks[0].id}`)).not.toContainText('FINISHED', { ignoreCase: true });
    } finally {
      await release(request, lane, picks);
    }
  });
});
