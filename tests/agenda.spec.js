import { test, expect } from './fixtures.js';
import { API, ATTENDEES, conferenceDays, laneFor, shotForPR, visit } from './helpers.js';
import { assessTravel } from '../src/lib/travel.js';
import { hasEnded, toMinutes } from '../src/lib/clock.js';

/**
 * My Agenda is the attendee's own conference, so this test builds its own: a
 * seat clashing with a waitlist place, and a cross-town hop too tight to make.
 * Seat state is real and every test runs at once, so each project books in its
 * own lane and the test gives back everything it took.
 */
test.describe('My Agenda', () => {
  test('lists what is still to come, flags a clash and a hop, and updates as you remove', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.page', testInfo);
    const bootstrap = await (await request.get(`${API}/bootstrap`)).json();
    const primary = bootstrap.venues.find((v) => v.isPrimary);
    const plan = await (await request.get(`${API}/users/${lane.user}/schedule`)).json();
    const mine = plan.days.find((d) => d.date === lane.day)?.sessions ?? [];
    const held = new Set(mine.map((s) => s.startsAt));
    const sessions = await (await request.get(`${API}/sessions?day=${lane.day}`)).json();

    /*
     * Two consecutive slots this attendee holds nothing in, where the trip from
     * the one to the next does not fit the gap between them — plus a sold-out
     * session in one of them, to take a waitlist place on. Over to the Foundry
     * is 18 minutes by rideshare plus the walk to the room at that end, so a
     * 30-minute gap never fits there, and a 15-minute one is hopeless anywhere.
     */
    const slots = [...new Set(sessions.map((s) => s.startsAt))].sort();
    let target = null;
    for (let i = 0; i + 1 < slots.length && !target; i++) {
      const [start, next] = [slots[i], slots[i + 1]];
      if (held.has(start) || held.has(next)) continue;

      const from = sessions.find((s) => s.startsAt === start && s.venue.id === primary.id && s.seatsLeft > 10);
      const to = sessions.find((s) => s.startsAt === next && s.venue.id !== primary.id && s.seatsLeft > 10);
      const full = sessions.find((s) => [start, next].includes(s.startsAt) && s.isFull
        && ![from?.id, to?.id].includes(s.id));
      const trip = from && to && assessTravel({
        travel: bootstrap.travel,
        from,
        to,
        gapMinutes: toMinutes(to.startsAt) - toMinutes(from.endsAt),
      });

      if (trip?.impossible && full) target = { from, to, full, trip };
    }
    expect(target, 'nothing on this day to build an agenda problem from').toBeTruthy();
    const { from, to, full, trip } = target;
    // Whichever of the two booked seats shares the sold-out session's slot.
    const partner = full.startsAt === from.startsAt ? from : to;

    // Book them the way the app would: a full room takes no seat, so a place on
    // its waitlist first, then the seat that overlaps it, then the one across
    // town.
    const take = (s) => request.put(`${API}/users/${lane.user}/reservations/${s.id}`).then((r) => r.json());
    expect((await take(full)).status, 'the sold-out session queues you').toBe('waitlisted');
    expect((await take(from)).status).toBe('confirmed');
    expect((await take(to)).status).toBe('confirmed');

    // Everything of theirs still ahead at the moment we look, in the order the
    // page should show it: day by day, earliest first.
    const clock = { day: lane.day, time: from.startsAt };
    const upcoming = [];
    for (const day of plan.days) {
      const rows = day.sessions.filter((s) => !hasEnded(s, clock));
      if (day.date === lane.day) rows.push(from, to, full);
      if (!rows.length) continue;
      upcoming.push(...rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id));
    }

    await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T${from.startsAt}` });

    const rows = page.locator('[data-testid^="agenda-row-"]');
    await expect(rows).toHaveCount(upcoming.length);
    expect(await rows.evaluateAll((els) => els.map((e) => e.dataset.testid)))
      .toEqual(upcoming.map((s) => `agenda-row-${s.id}`));

    // Each row says when it is, what it is and where — and whether it is a seat
    // or a place in the queue.
    const row = (s) => page.getByTestId(`agenda-row-${s.id}`);
    await expect(row(from)).toContainText(from.title);
    await expect(row(from)).toContainText(from.startsAt);
    await expect(row(from)).toContainText(from.room.name);
    await expect(row(from)).toContainText(from.venue.shortName);
    await expect(row(from).getByTestId('agenda-status')).toHaveText('Seat');
    await expect(row(to).getByTestId('agenda-status')).toHaveText('Seat');
    await expect(row(full).getByTestId('agenda-status')).toHaveText('Waitlist');

    // Both sides of the overlap, each naming the other session.
    await expect(page.getByTestId(`agenda-clash-${full.id}`)).toContainText(partner.title);
    await expect(page.getByTestId(`agenda-clash-${partner.id}`)).toContainText(full.title);

    // The hop says how long the trip takes and how long the gap is.
    const hop = page.getByTestId(`agenda-hop-${to.id}`);
    await expect(hop).toContainText(`${trip.fastest.total} min`);
    await expect(hop).toContainText(`${trip.gapMinutes} min`);

    if (testInfo.project.name === 'mobile') {
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'the agenda scrolls sideways').toBeLessThanOrEqual(1);
    }
    await shotForPR(page, 'my-agenda');

    // Removing the waitlist place takes its row and the other row's clash flag
    // with it, and leaves the hop alone — with no reload in between.
    await row(full).getByRole('button', { name: 'Leave the waitlist' }).click();
    await expect(row(full)).toHaveCount(0);
    await expect(page.getByTestId(`agenda-clash-${partner.id}`)).toHaveCount(0);
    await expect(row(partner)).toBeVisible();
    await expect(hop).toBeVisible();
    await expect(page).toHaveURL(/\/my-agenda$/);

    // A session that is over leaves the list: at a clock past the first one's
    // end it is gone, and the one after it is still there to go to.
    await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T${from.endsAt}` });
    await expect(page.getByTestId(`agenda-row-${from.id}`), `${from.title} has ended`).toHaveCount(0);
    await expect(page.getByTestId(`agenda-row-${to.id}`)).toBeVisible();

    // Give back what is left. The waitlist place went through the page itself.
    for (const s of [from, to]) await request.delete(`${API}/users/${lane.user}/reservations/${s.id}`);
  });

  test('an attendee with nothing left to come is sent to the schedule', async ({ page }) => {
    // Nothing is written here, so it needs no lane: pin the clock past the last
    // session of the conference, and whatever else is booked has ended.
    const days = await conferenceDays();
    await visit(page, '/my-agenda', { as: ATTENDEES.jonas, at: `${days.at(-1)}T23:59` });

    const empty = page.getByTestId('agenda-empty');
    await expect(empty).toBeVisible();
    await expect(empty.getByRole('link', { name: /schedule/i })).toHaveAttribute('href', '/schedule');
    await expect(page.locator('[data-testid^="agenda-row-"]')).toHaveCount(0);
  });
});
