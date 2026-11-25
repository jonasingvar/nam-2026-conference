import { test, expect } from './fixtures.js';
import { API, visit, momentOn, conferenceDays, laneFor, bookableFor, ATTENDEES } from './helpers.js';


test.describe('Home is a way in, not a feed', () => {
  test('it links to every main page, and each link lands', async ({ page }) => {
    await visit(page, '/');
    const links = page.getByTestId('quick-links').getByRole('link');
    await expect(links).toHaveCount(5);

    for (const [name, path] of [['Schedule', '/schedule'], ['Speakers', '/speakers'], ['Venues', '/venues'],
      ['Food & drink', '/food'], ['Expo', '/expo']]) {
      await expect(page.getByTestId('quick-links').getByRole('link', { name: new RegExp(`^${name}`) }))
        .toHaveAttribute('href', path);
    }
  });

  test('the panels that used to fill it stay gone', async ({ page }) => {
    // A speaker, mid-morning, with sessions booked: the case that used to fill the page.
    await visit(page, '/', { as: ATTENDEES.andy, at: await momentOn(0, '10:30') });
    await expect(page.getByTestId('quick-links')).toBeVisible();
    for (const id of ['today-panel', 'live-now', 'speaking-strip', 'followed-sessions', 'next-up']) {
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

test.describe('Your day', () => {
  test('lists the seats I hold today, with the speaker and the room, and takes one back', async ({ page, request }, testInfo) => {
    const lane = await laneFor('home.today', testInfo);
    const at = `${lane.day}T10:00`;

    // Book through the API the way the seat button does, so the page loads with
    // the seats already held. Two that do not overlap, and one sell-out to queue
    // for — a waitlist place is not a seat.
    const bookable = await bookableFor(request, lane.user, lane.day);
    const picked = [];
    for (const s of bookable) {
      if (s.seatsLeft <= 3 || !s.speakers?.length) continue;
      if (picked.some((p) => p.startsAt < s.endsAt && s.startsAt < p.endsAt)) continue;
      picked.push(s);
      if (picked.length === 2) break;
    }
    expect(picked.length, `two sessions ${lane.user} can hold on ${lane.day}`).toBe(2);
    const full = bookable.find((s) => s.seatsLeft === 0
      && !picked.some((p) => p.startsAt < s.endsAt && s.startsAt < p.endsAt));
    expect(full, `a sell-out ${lane.user} can queue for on ${lane.day}`).toBeTruthy();
    const held = [...picked, full];

    try {
      for (const s of held) {
        const res = await request.put(`${API}/users/${lane.user}/reservations/${s.id}`, { data: {} });
        expect(res.ok(), `booking session ${s.id}`).toBeTruthy();
      }
      const queued = await (await request.get(`${API}/users/${lane.user}/reservations/${full.id}`)).json();
      expect(queued.status, 'the room is full, so this is a waitlist place').toBe('waitlisted');

      const plan = await (await request.get(`${API}/users/${lane.user}/schedule`)).json();
      const todayIds = plan.days.find((d) => d.date === lane.day).sessions
        .filter((s) => s.reservation === 'confirmed').map((s) => s.id);

      await visit(page, '/', { as: lane.user, at });
      const section = page.getByTestId('home-today');
      await expect(section).toBeVisible();

      // Every seat I hold today, and only those: nothing from another day, and
      // no waitlist place dressed up as a seat.
      await expect(section.locator('[data-testid^="home-session-"]')).toHaveCount(todayIds.length);
      for (const id of todayIds) await expect(page.getByTestId(`home-session-${id}`)).toBeVisible();
      const elsewhere = plan.days.filter((d) => d.date !== lane.day).flatMap((d) => d.sessions.map((s) => s.id));
      expect(elsewhere.length, `${lane.user} holds seats on other days`).toBeGreaterThan(0);
      for (const id of [...elsewhere, full.id]) {
        await expect(page.getByTestId(`home-session-${id}`), `session ${id} is not today's`).toHaveCount(0);
      }

      // The speaker's portrait is a way into their page, and the card says where it is.
      const first = picked[0];
      const card = page.getByTestId(`home-session-${first.id}`);
      await expect(card).toContainText(first.room.name);
      await expect(card).toContainText(first.venue.name);
      for (const speaker of first.speakers) {
        const portrait = card.locator(`a[href="/speakers/${speaker.id}"]`);
        await expect(portrait).toBeVisible();
        await expect(portrait.locator('img'), `a portrait, not initials`).toBeVisible();
        await expect(portrait).toContainText(speaker.name);
        await expect(portrait).toContainText(speaker.company);
      }

      // Roomier than the same session's row on the schedule, which is the
      // tightest the app draws it.
      const cardBox = await card.boundingBox();
      await visit(page, `/schedule?day=${lane.day}&view=list`, { as: lane.user, at });
      const row = page.locator('[data-testid="session-card"]', { has: page.locator(`a[href="/sessions/${first.id}"]`) });
      await expect(row).toBeVisible();
      const rowBox = await row.boundingBox();
      expect(cardBox.height, 'a home card is roomier than a schedule row').toBeGreaterThan(rowBox.height);

      // One action, and it is not a reserve or a check-in.
      await visit(page, '/', { as: lane.user, at });
      const again = page.getByTestId(`home-session-${first.id}`);
      await expect(again.getByRole('button')).toHaveCount(1);
      for (const id of ['reserve-seat', 'release-seat', 'check-in']) {
        await expect(again.getByTestId(id), `${id} does not belong on a home card`).toHaveCount(0);
      }

      // Unreserving drops the card at once, and really gives the seat back.
      await again.getByTestId(`home-unreserve-${first.id}`).click();
      await expect(again).toHaveCount(0);
      await expect(page.getByTestId(`home-session-${picked[1].id}`)).toBeVisible();
      const me = await (await request.get(`${API}/users/${lane.user}`)).json();
      expect(me.reservations.some((r) => r.sessionId === first.id), 'the seat is really gone').toBe(false);

      // The portrait really lands on the speaker.
      await page.getByTestId(`home-session-${picked[1].id}`)
        .locator(`a[href="/speakers/${picked[1].speakers[0].id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/speakers/${picked[1].speakers[0].id}$`));
      await expect(page.getByRole('heading', { name: picked[1].speakers[0].name }).first()).toBeVisible();
    } finally {
      for (const s of held) await request.delete(`${API}/users/${lane.user}/reservations/${s.id}`);
    }
  });

  test('keeps out of the way when no seat is held today', async ({ page }, testInfo) => {
    // Marcus holds nothing at all on day 3 and no lane books there, so the
    // section is absent — not an empty Reveal gap. The same attendee on a day he
    // does hold seats for gets one, so the absence is about the day, not the page.
    const lane = await laneFor('home.today.empty', testInfo);
    const days = await conferenceDays();

    await visit(page, '/', { as: lane.user, at: `${days[1]}T10:00` });
    await expect(page.getByTestId('home-today')).toBeVisible();

    await visit(page, '/', { as: lane.user, at: `${lane.day}T10:00` });
    await expect(page.getByTestId('quick-links')).toBeVisible();
    await expect(page.getByTestId('home-today')).toHaveCount(0);
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
