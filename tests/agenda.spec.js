import { test, expect } from './fixtures.js';
import {
  API, ATTENDEES, bookableFor, conferenceDays, laneFor, shotForPR, visit,
} from './helpers.js';

/** A CSS `transform` matrix's vertical scale. `none` is the identity. */
const scaleY = (transform) =>
  (transform === 'none' ? 1 : Number(transform.slice(7).split(',')[3]));

/** Two sessions this attendee can book today, in different slots, with room to spare. */
async function twoBookable(request, userId, day) {
  const bySlot = new Map();
  for (const s of await bookableFor(request, userId, day)) {
    // The first speaker carries the panel's details, so it needs a job title.
    if (s.seatsLeft > 3 && s.speakers[0]?.jobTitle && !bySlot.has(s.startsAt)) bySlot.set(s.startsAt, s);
  }
  return [...bySlot.values()].slice(0, 2);
}

/** What the page should be showing: today's seats, split by the status that matters. */
async function seatsToday(request, userId, day) {
  const plan = await (await request.get(`${API}/users/${userId}/schedule`)).json();
  const onDay = (plan.days ?? []).find((d) => d.date === day) ?? { sessions: [] };
  return {
    confirmed: onDay.sessions
      .filter((s) => s.reservation === 'confirmed')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id),
    waitlisted: onDay.sessions.filter((s) => s.reservation === 'waitlisted'),
  };
}

test.describe('My Agenda is the day you hold seats for', () => {
  test('it lists today\'s booked sessions, in order, with their speakers and rooms', async ({ page, request }, testInfo) => {
    const { user, day } = await laneFor('agenda.page', testInfo);
    const at = `${day}T08:00`; // before today's first session

    const booked = await twoBookable(request, user, day);
    expect(booked.length, 'the seed leaves two bookable slots today').toBe(2);
    for (const s of booked) {
      const res = await request.put(`${API}/users/${user}/reservations/${s.id}`, { data: { day, time: '08:00' } });
      expect(res.ok(), `could not book ${s.title}`).toBeTruthy();
    }

    try {
      const agenda = await seatsToday(request, user, day);
      expect(agenda.confirmed.length).toBeGreaterThanOrEqual(2);

      // The empty state must never appear on the way to a full agenda. Watch
      // the DOM for it from before the first script runs, so a flash between
      // skeleton and panels cannot slip past.
      await page.addInitScript(() => {
        window.__emptyAgendaSeen = false;
        const check = (node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('[data-testid="agenda-empty"]') || node.querySelector?.('[data-testid="agenda-empty"]')) {
            window.__emptyAgendaSeen = true;
          }
        };
        new MutationObserver((records) => {
          for (const r of records) for (const n of r.addedNodes) check(n);
        }).observe(document.documentElement, { childList: true, subtree: true });
      });
      // Hold the day payload back, so the skeleton is observable and any
      // panel → empty → panel flicker has the time to happen.
      await page.route('**/api/users/*/today*', async (route) => {
        await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      });

      await visit(page, '/my-agenda', { as: user, at });

      // A skeleton in the panels' shape while the day loads — never an empty agenda.
      await expect(page.getByTestId('agenda-skeleton').first()).toBeVisible();
      await expect(page.getByTestId('agenda-empty')).toHaveCount(0);

      const panels = page.locator('[data-testid^="agenda-session-"]');
      await expect(panels).toHaveCount(agenda.confirmed.length);
      await page.unroute('**/api/users/*/today*');
      await shotForPR(page, 'my-agenda');

      // Every confirmed seat has a panel; a waitlist place has none. Nothing
      // today is over yet, and a panel never flashed the empty state.
      for (const s of agenda.confirmed) {
        await expect(page.getByTestId(`agenda-session-${s.id}`), s.title).toBeVisible();
      }
      for (const s of agenda.waitlisted) {
        await expect(page.getByTestId(`agenda-session-${s.id}`), s.title).toHaveCount(0);
      }
      await expect(page.getByTestId('agenda-finished')).toHaveCount(0);
      expect(await page.evaluate(() => window.__emptyAgendaSeen), 'the empty state flashed').toBe(false);

      // In time order, and nothing on the page can book or take a seat.
      const shown = await panels.evaluateAll((els) =>
        els.map((e) => Number(e.getAttribute('data-testid').replace('agenda-session-', ''))));
      expect(shown).toEqual(agenda.confirmed.map((s) => s.id));
      await expect(page.getByRole('button', { name: /reserve|add to my agenda/i })).toHaveCount(0);

      // One panel, in full: large enough for the details, and the speaker's
      // portrait links to their profile.
      const mine = booked[0];
      const panel = page.getByTestId(`agenda-session-${mine.id}`);
      const speaker = mine.speakers[0];
      await expect(panel).toContainText(speaker.name);
      await expect(panel).toContainText(speaker.jobTitle);
      await expect(panel).toContainText(mine.room.name);
      await expect(panel).toContainText(mine.venue.name);
      const box = await panel.boundingBox();
      expect(box.height, 'the panel is too small to read').toBeGreaterThanOrEqual(150);

      const portrait = panel.getByRole('link', { name: new RegExp(speaker.name) });
      await expect(portrait).toHaveAttribute('href', `/speakers/${speaker.id}`);
      await expect(portrait.locator('img, svg')).toHaveCount(1);
      await portrait.click();
      await expect(page).toHaveURL(new RegExp(`/speakers/${speaker.id}$`));
      await page.goBack();
      await expect(page.getByTestId(`agenda-session-${mine.id}`)).toBeVisible();

      // The rail on the left of each panel is drawn downward on load.
      const rail = await page.getByTestId('agenda-rail').first().evaluate((el) => {
        const anim = el.getAnimations()[0];
        return {
          name: getComputedStyle(el).animationName,
          originY: getComputedStyle(el).transformOrigin.split(' ')[1],
          keys: anim ? anim.effect.getKeyframes().map((k) => k.transform) : [],
        };
      });
      expect(rail.name).toBe('rail-draw');
      expect(rail.originY).toBe('0px'); // anchored at the top
      expect(scaleY(rail.keys[0]), 'the rail starts with no line').toBe(0);
      expect(scaleY(rail.keys[rail.keys.length - 1]), 'the rail ends full height').toBe(1);

      // Motion off is not a rail that never arrives.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await visit(page, '/my-agenda', { as: user, at });
      const settled = await page.getByTestId('agenda-rail').first()
        .evaluate((el) => getComputedStyle(el).transform);
      expect(scaleY(settled)).toBe(1);
      await page.emulateMedia({ reducedMotion: null });

      // Releasing the seat removes the panel at once, and gives the seat back.
      await page.getByTestId(`agenda-release-${mine.id}`).click();
      await expect(page.getByTestId(`agenda-session-${mine.id}`)).toHaveCount(0);
      const held = await (await request.get(`${API}/users/${user}`)).json();
      expect(held.reservations.some((r) => r.sessionId === mine.id)).toBe(false);

      // Once the day is over, what you held is marked finished rather than
      // presented as still to come.
      const past = agenda.confirmed.find((s) => s.id !== mine.id);
      await visit(page, '/my-agenda', { as: user, at: `${day}T21:00` });
      await expect(page.getByTestId(`agenda-session-${past.id}`)).toContainText(/finished/i);
    } finally {
      for (const s of booked) await request.delete(`${API}/users/${user}/reservations/${s.id}`);
    }
  });

  test('a day with nothing booked says so, and offers the schedule', async ({ page }) => {
    // marcus holds nothing on the third day (day index 2), and no other test
    // touches that attendee and day.
    const days = await conferenceDays();
    await visit(page, '/my-agenda', { as: ATTENDEES.marcus, at: `${days[2]}T10:30` });

    const empty = page.getByTestId('agenda-empty');
    await expect(empty).toBeVisible();
    await expect(page.getByTestId('agenda-skeleton')).toHaveCount(0);
    await expect(empty.getByRole('link', { name: /schedule/i })).toHaveAttribute('href', '/schedule');
  });
});
