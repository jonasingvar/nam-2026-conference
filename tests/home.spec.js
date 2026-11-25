import { test, expect } from './fixtures.js';
import { API, visit, momentOn, conferenceDays, laneFor, bookableFor, ATTENDEES } from './helpers.js';

/** Every session this attendee still holds a confirmed seat for on `day`, earliest first. */
async function bookedToday(request, userId, day) {
  const me = await (await request.get(`${API}/users/${userId}`)).json();
  const all = await (await request.get(`${API}/sessions`)).json();
  const byId = new Map(all.map((s) => [s.id, s]));
  return me.reservations
    .filter((r) => r.status === 'confirmed')
    .map((r) => byId.get(r.sessionId))
    .filter((s) => s?.day === day)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
}

test.describe('Home is a way in, not a feed', () => {
  test('it links to every main page, and each link lands', async ({ page }) => {
    await visit(page, '/');
    const links = page.getByTestId('quick-links').getByRole('link');
    await expect(links).toHaveCount(5);

    for (const [name, path] of [['Schedule', '/schedule'], ['Speakers', '/speakers'], ['Venues', '/venues'],
      ['Food & Drink', '/food'], ['Expo', '/expo']]) {
      await expect(page.getByTestId('quick-links').getByRole('link', { name: new RegExp(`^${name}`, 'i') }))
        .toHaveAttribute('href', path);
    }
  });

  test('no other page\'s section is duplicated here', async ({ page }) => {
    // A speaker, mid-morning, with sessions booked: the case that used to fill the page.
    await visit(page, '/', { as: ATTENDEES.andy, at: await momentOn(0, '10:30') });
    await expect(page.getByTestId('quick-links')).toBeVisible();
    // Home opens with your own day (`today-seats`); what is live, and what you
    // follow, stay on the pages that own them.
    for (const id of ['live-now', 'speaking-strip', 'followed-sessions', 'next-up']) {
      await expect(page.getByTestId(id), `${id} should not be on home`).toHaveCount(0);
    }
  });

  test('no announcement appears before it was posted', async ({ page, request }) => {
    const days = await conferenceDays();
    const all = await (await request.get(`${API}/announcements`)).json();
    const cutoff = `${days[0]}T09:00:00Z`;
    const posted = all.filter((a) => a.postedAt <= cutoff);
    const future = all.filter((a) => a.postedAt > cutoff);
    expect(posted.length, 'nothing is posted before 09:00 on day 1').toBeGreaterThan(0);
    expect(future.length, 'nothing is posted after 09:00 on day 1').toBeGreaterThan(0);

    await visit(page, '/', { at: await momentOn(0, '09:00') });
    const strip = page.getByTestId('announcements');
    await expect(strip).toBeVisible();

    const shown = await strip.innerText();
    for (const a of future) {
      expect(shown, `"${a.title}" was posted later than the clock`).not.toContain(a.title);
    }
  });
});

/**
 * The one personal section on Home: every session you hold a seat for today.
 *
 * Only this file's `home.today` lane takes a seat, so it owns andy/1 and
 * abraham/1 outright (tests/unit/lanes.test.js holds the table to that). The
 * other tests read Home as Kenji on days 1 and 2 — no lane writes a
 * reservation for him there, so what they see cannot change under them.
 */
test.describe('Your day on Home', () => {
  test('every session booked for today is a card, in the order of the day', async ({ page, request }) => {
    const days = await conferenceDays();
    const expected = await bookedToday(request, ATTENDEES.kenji, days[1]);
    expect(expected.length, 'the seed gives this attendee seats today').toBeGreaterThan(1);

    await visit(page, '/', { as: ATTENDEES.kenji, at: await momentOn(1, '10:30') });
    const cards = page.getByTestId('today-seat');
    await expect(cards).toHaveCount(expected.length);
    // Exactly these, earliest first — no waitlist place, nothing from another day.
    expect(await cards.evaluateAll((els) => els.map((e) => Number(e.dataset.sessionId))))
      .toEqual(expected.map((s) => s.id));
    await expect(cards.first()).toContainText(expected[0].title);
  });

  test('a card\'s portrait links to the speaker', async ({ page, request }) => {
    const days = await conferenceDays();
    const [first] = await bookedToday(request, ATTENDEES.kenji, days[1]);
    const speaker = first.speakers[0];
    expect(speaker, 'the first session today has a speaker').toBeTruthy();

    await visit(page, '/', { as: ATTENDEES.kenji, at: await momentOn(1, '10:30') });
    const link = page.getByTestId('today-seat').first().getByRole('link', { name: `About ${speaker.name}` });
    await expect(link).toHaveAttribute('href', `/speakers/${speaker.id}`);
    await expect(link.locator('img')).toBeVisible();

    await link.click();
    await expect(page).toHaveURL(new RegExp(`/speakers/${speaker.id}$`));
    await expect(page.getByTestId('speaker-name')).toHaveText(speaker.name);
  });

  test('a card is big, and says who is speaking and where it is', async ({ page, request }) => {
    const days = await conferenceDays();
    const [first] = await bookedToday(request, ATTENDEES.kenji, days[1]);

    await visit(page, '/', { as: ATTENDEES.kenji, at: await momentOn(1, '10:30') });
    const card = page.getByTestId('today-seat').first();
    await expect(card).toBeVisible();

    // Big enough to carry the details below, on a phone as well as a desktop.
    expect((await card.boundingBox()).height, 'the card is a large one').toBeGreaterThanOrEqual(140);
    await expect(card).toContainText(first.speakers[0].name);
    await expect(card).toContainText(first.room.name);
    await expect(card).toContainText(first.venue.shortName);
  });

  test('a day with no seat booked says so', async ({ page }) => {
    await visit(page, '/', { as: ATTENDEES.kenji, at: await momentOn(2, '10:30') });
    await expect(page.getByTestId('today-seats-empty')).toBeVisible();
    await expect(page.getByTestId('today-seat')).toHaveCount(0);
    await expect(page.getByTestId('today-seat-skeleton')).toHaveCount(0);
  });

  test('a seat taken today shows up, and giving it back sticks', async ({ page, request }, testInfo) => {
    const lane = await laneFor('home.today', testInfo);
    // Home cannot reserve (out of scope), so the seat is taken through the API.
    const open = (await bookableFor(request, lane.user, lane.day))
      .find((s) => s.startsAt === lane.slot && s.seatsLeft > 2);
    expect(open, `no open session at ${lane.slot} on ${lane.day}`).toBeTruthy();
    const url = `${API}/users/${lane.user}/reservations/${open.id}`;

    try {
      await request.put(url);
      await visit(page, '/', { as: lane.user, at: `${lane.day}T10:30` });
      const card = page.getByTestId('today-seat').filter({ hasText: open.title });
      await expect(card).toHaveCount(1);

      await card.getByTestId('remove-today-seat').click();
      await expect(card).toHaveCount(0);
      await expect(page.getByTestId('toaster')).toContainText('Removed');

      // Server state, not just the page: the reservation is gone.
      const after = (await (await request.get(`${API}/users/${lane.user}`)).json()).reservations;
      expect(after.filter((r) => r.sessionId === open.id)).toEqual([]);

      // And a reload does not bring it back.
      await visit(page, '/', { as: lane.user, at: `${lane.day}T10:30` });
      await expect(page.getByTestId('today-seat').filter({ hasText: open.title })).toHaveCount(0);
    } finally {
      await request.delete(url);
    }
  });

  test('the tiles wait for your day, then play in behind it', async ({ page }) => {
    // Hold the attendee's own reservations back, so the moment before their day
    // lands can be looked at.
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route(`**/api/users/${ATTENDEES.kenji}`, async (route) => {
      await held;
      await route.continue();
    });

    await visit(page, '/', { as: ATTENDEES.kenji, at: await momentOn(1, '10:30') });

    // The way-in tiles are not parked there to be shoved down the page as the
    // seats arrive: they are not on the page until your day is known.
    await expect(page.getByTestId('today-seat-skeleton')).toBeVisible();
    await expect(page.getByTestId('quick-links')).toHaveCount(0);

    release();

    const links = page.getByTestId('quick-links');
    await expect(links).toBeVisible();
    await expect(links.getByRole('link')).toHaveCount(5);

    // Then both the tiles and the day's cards enter in a stagger, each a beat
    // after the one before it — not all at once.
    for (const [items, what] of [[links.locator('li'), 'tiles'], [page.getByTestId('today-seat'), 'cards']]) {
      await expect(items.first()).toHaveCSS('animation-name', 'rise-in');
      const delays = await items.evaluateAll((els) =>
        els.map((e) => getComputedStyle(e).animationDelay));
      expect(new Set(delays).size, `${what} enter one after another`).toBeGreaterThan(1);
    }
  });

  test('the section reserves its space and swaps in place, so nothing pops in', async ({ page }) => {
    // Hold the attendee's own reservations back, so the section is seen in both
    // of its states: waiting, then holding their seats.
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route(`**/api/users/${ATTENDEES.kenji}`, async (route) => {
      await held;
      await route.continue();
    });

    await visit(page, '/', { as: ATTENDEES.kenji, at: await momentOn(1, '10:30') });

    const section = page.getByTestId('today-seats');
    const skeleton = page.getByTestId('today-seat-skeleton');
    await expect(skeleton).toBeVisible();
    // A card's worth of space from the first paint — not a gap that fills in
    // later — and no claim that the day is empty while their seats are in flight.
    const reserved = await skeleton.boundingBox();
    expect(reserved.height).toBeGreaterThanOrEqual(140);
    await expect(page.getByTestId('today-seats-empty')).toHaveCount(0);
    const topBefore = (await section.boundingBox()).y;

    release();
    const cards = page.getByTestId('today-seat');
    await expect(cards.first()).toBeVisible();
    await expect(skeleton).toHaveCount(0);
    // The empty state never flashed on the way.
    await expect(page.getByTestId('today-seats-empty')).toHaveCount(0);

    // The reserved block was a card's worth of space...
    expect((await cards.first().boundingBox()).height).toBeGreaterThanOrEqual(reserved.height - 1);
    // ...nothing above the section moved...
    expect((await section.boundingBox()).y).toBeCloseTo(topBefore, 0);
    // ...and once the cards are in, the section stays put.
    const settled = (await section.boundingBox()).height;
    await page.waitForTimeout(400);
    expect((await section.boundingBox()).height).toBe(settled);
  });
});

test.describe('My Agenda is a blank canvas', () => {
  test('it says it is coming soon, and is still in the nav', async ({ page }, testInfo) => {
    await visit(page, '/');
    // Desktop shows the main nav; a phone hides it behind the menu button.
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: /My Agenda/ }).click();
    } else {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /My Agenda/ }).click();
    }
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByTestId('agenda-coming-soon')).toContainText('Coming soon');

    await visit(page, '/my-plan');
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByTestId('agenda-coming-soon')).toBeVisible();
  });
});
