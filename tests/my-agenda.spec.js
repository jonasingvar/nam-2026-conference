import { test, expect } from './fixtures.js';
import { API, visit, laneFor, bookableFor, clearAgendaFor, shotForPR, failOnPageErrors } from './helpers.js';

/** Book two sessions in different slots on the lane's day; returns them in time order. */
async function bookTwo(request, lane) {
  await clearAgendaFor(request, lane.user, lane.day);
  const open = (await bookableFor(request, lane.user, lane.day)).filter((s) => s.seatsLeft > 3 && s.speakers.length);
  const first = open[0];
  const second = open.find((s) => s.startsAt >= first.endsAt);
  for (const s of [first, second]) {
    const res = await request.put(`${API}/users/${lane.user}/reservations/${s.id}`, { data: { day: lane.day, time: '08:00' } });
    expect(res.ok()).toBeTruthy();
  }
  return [first, second];
}

const release = (request, lane, ids) => Promise.all(ids.map((id) => request.delete(`${API}/users/${lane.user}/reservations/${id}`)));

test.describe('My Agenda — your day', () => {
  test('lists the confirmed seats of the day as large cards that link to the session and the speakers', async ({ page, request }, testInfo) => {
    const lane = await laneFor('my-agenda', testInfo);
    const [a, b] = await bookTwo(request, lane);
    const errors = failOnPageErrors(page);
    try {
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T08:00` });
      const cards = page.getByTestId('agenda-card');
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0)).toContainText(a.title);
      await expect(cards.nth(1)).toContainText(b.title);

      // speaker, venue and room details, on a card that is large
      const speaker = a.speakers[0];
      await expect(cards.nth(0)).toContainText(speaker.name);
      await expect(cards.nth(0)).toContainText(a.room.name);
      await expect(cards.nth(0)).toContainText(a.venue.shortName ?? a.venue.name);
      expect((await cards.nth(0).boundingBox()).height).toBeGreaterThanOrEqual(150);

      // the rail has the track's colour and animates in
      const rail = cards.nth(0).getByTestId('agenda-rail');
      await expect(rail).toHaveCSS('animation-name', /agenda-rail/);
      await expect(rail).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      // hover lifts the card
      const before = await cards.nth(0).evaluate((el) => getComputedStyle(el).transform);
      await cards.nth(0).hover();
      await expect.poll(() => cards.nth(0).evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
      await shotForPR(page, 'my agenda');

      // the portrait goes to the speaker, the rest of the card to the session
      const portrait = cards.nth(0).getByTestId(`agenda-speaker-${speaker.id}`);
      await expect(portrait).toHaveAttribute('href', `/speakers/${speaker.id}`);
      await portrait.click();
      await expect(page).toHaveURL(new RegExp(`/speakers/${speaker.id}$`));
      await page.goBack();
      // a click on the title (pointer-transparent) lands on the card's link
      await cards.nth(1).getByRole('heading').scrollIntoViewIfNeeded();
      const title = await cards.nth(1).getByRole('heading').boundingBox();
      await page.mouse.click(title.x + 20, title.y + title.height / 2);
      await expect(page).toHaveURL(new RegExp(`/sessions/${b.id}$`));

      // the list does not move once it has rendered
      await page.goBack();
      const h1 = (await page.getByTestId('agenda-list').boundingBox()).height;
      await page.waitForTimeout(400);
      expect((await page.getByTestId('agenda-list').boundingBox()).height).toBe(h1);
      expect(errors).toEqual([]);
    } finally {
      await release(request, lane, [a.id, b.id]);
    }
  });

  test('Remove asks first: Keep leaves the seat, Remove gives it back and drops the card', async ({ page, request }, testInfo) => {
    const lane = await laneFor('my-agenda.remove', testInfo);
    const [a, b] = await bookTwo(request, lane);
    try {
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T08:00` });
      const cards = page.getByTestId('agenda-card');
      await expect(cards).toHaveCount(2);

      await cards.nth(0).getByTestId('agenda-remove').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByTestId('agenda-remove-keep').click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(cards).toHaveCount(2);
      let me = await (await request.get(`${API}/users/${lane.user}`)).json();
      expect(me.reservations.some((r) => r.sessionId === a.id)).toBe(true);

      await cards.nth(0).getByTestId('agenda-remove').click();
      await page.getByTestId('agenda-remove-confirm').click();
      await expect(cards).toHaveCount(1);
      await expect(cards.nth(0)).toContainText(b.title);
      me = await (await request.get(`${API}/users/${lane.user}`)).json();
      expect(me.reservations.some((r) => r.sessionId === a.id)).toBe(false);

      await cards.nth(0).getByTestId('agenda-remove').click();
      await page.getByTestId('agenda-remove-confirm').click();
      await expect(page.getByTestId('agenda-empty')).toBeVisible();
    } finally {
      await release(request, lane, [a.id, b.id]);
    }
  });
});
