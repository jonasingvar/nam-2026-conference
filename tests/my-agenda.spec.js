import { test, expect } from './fixtures.js';
import { API, visit, laneFor, bookableFor, shotForPR } from './helpers.js';
import { assessTravel } from '../src/lib/travel.js';
import { time } from '../src/lib/format.js';

/**
 * My Agenda — the attendee's own plan, with its problems on it.
 *
 * What the payload, the clock and the travel table say is proved on plain
 * objects in `tests/unit/agenda.test.js`. This file is only for what a page
 * shows: the rows, the flags, the empty state, and that removing a session
 * moves the list and its flags at once.
 */

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const overlaps = (a, b) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

const travelTable = async (request) =>
  (await (await request.get(`${API}/bootstrap`)).json()).travel;

/**
 * Two sessions in consecutive slots at different venues that the quickest
 * non-walking route, plus the walk to the room, cannot cover.
 */
function crossTownPair(sessions, travel) {
  const slots = [...new Set(sessions.map((s) => s.startsAt))].sort();
  for (let i = 0; i < slots.length - 1; i++) {
    for (const a of sessions.filter((s) => s.startsAt === slots[i])) {
      for (const b of sessions.filter((s) => s.startsAt === slots[i + 1])) {
        if (a.venue.id === b.venue.id) continue;
        const gapMinutes = toMinutes(b.startsAt) - toMinutes(a.endsAt);
        if (assessTravel({ travel, from: a, to: b, gapMinutes })?.impossible) {
          return { from: a, to: b, gapMinutes };
        }
      }
    }
  }
  return null;
}

/** A row on the page, found by id so a seeded plan beside it changes nothing. */
const row = (page, id) => page.locator(`[data-testid="agenda-session"][data-session-id="${id}"]`);

test.describe('My Agenda', () => {
  test('lists what is still ahead, grouped by day with time, room, venue and status, and flags a hop that will not fit', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.plan', testInfo);
    const bookable = await bookableFor(request, lane.user, lane.day);
    const travel = await travelTable(request);

    const hop = crossTownPair(bookable, travel);
    expect(hop, 'no cross-town pair that misses its connection on this day').toBeTruthy();
    // A sold-out room to queue for, in a slot that clashes with neither seat.
    const queue = bookable.find((s) => s.isFull && !overlaps(s, hop.from) && !overlaps(s, hop.to));
    expect(queue, 'no sold-out session to queue for on this day').toBeTruthy();

    const booked = [hop.from, hop.to, queue];
    for (const s of booked) await request.put(`${API}/users/${lane.user}/reservations/${s.id}`);

    try {
      // Day 1's morning is already attended in the seed, so pin the clock to the
      // start of the lane's day: everything booked is still ahead.
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T07:00` });

      await expect(row(page, hop.from.id)).toBeVisible();
      await expect(row(page, hop.to.id)).toBeVisible();

      // Each row carries its own time, title, room and venue.
      const to = row(page, hop.to.id);
      await expect(to).toContainText(hop.to.title);
      await expect(to).toContainText(hop.to.room.name);
      await expect(to).toContainText(hop.to.venue.shortName);
      await expect(to).toContainText(time(hop.to.startsAt));
      await expect(to).toContainText(time(hop.to.endsAt));

      // A seat, and a waitlist place, said in as many words.
      await expect(row(page, hop.from.id)).toHaveAttribute('data-status', 'confirmed');
      await expect(row(page, queue.id)).toHaveAttribute('data-status', 'waitlisted');
      await expect(row(page, queue.id)).toContainText('Waitlisted');

      // Grouped by day, and in time order within it.
      const dates = await page.getByTestId('agenda-day').evaluateAll((els) =>
        els.map((el) => el.dataset.day));
      expect(dates).toContain(lane.day);
      const ids = await page.getByTestId('agenda-session').evaluateAll((els) =>
        els.map((el) => Number(el.dataset.sessionId)));
      expect(ids.indexOf(hop.from.id)).toBeLessThan(ids.indexOf(hop.to.id));

      // The hop names the trip and the gap between the two seats.
      const hopFlag = row(page, hop.to.id).getByTestId('agenda-hop');
      await expect(hopFlag).toBeVisible();
      await expect(hopFlag).toContainText(String(hop.gapMinutes));
      await expect(hopFlag).toContainText(hop.from.title);
      await shotForPR(page, 'my agenda with a hop that will not fit');

      if (testInfo.project.name === 'mobile') {
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'My Agenda scrolls sideways on a phone').toBeLessThanOrEqual(1);
      }

      // Once the first session is over it drops off — and takes the hop with it.
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T${hop.from.endsAt}` });
      await expect(row(page, hop.from.id)).toHaveCount(0);
      await expect(row(page, hop.to.id)).toBeVisible();
      await expect(row(page, hop.to.id).getByTestId('agenda-hop')).toHaveCount(0);
    } finally {
      for (const s of booked) await request.delete(`${API}/users/${lane.user}/reservations/${s.id}`);
    }
  });

  test('two sessions at once are both flagged, and removing one moves the list and the flag at once', async ({ page, request }, testInfo) => {
    const lane = await laneFor('agenda.clash', testInfo);
    const bookable = await bookableFor(request, lane.user, lane.day);

    // One slot holding a sold-out room and a seat to spare: the clash is a seat
    // in one and a waitlist place in the other.
    const bySlot = {};
    for (const s of bookable) (bySlot[s.startsAt] ??= []).push(s);
    let pair = null;
    for (const list of Object.values(bySlot)) {
      const full = list.find((s) => s.isFull);
      const open = list.find((s) => !s.isFull && s.seatsLeft > 3 && s.id !== full?.id);
      if (full && open) { pair = { full, open }; break; }
    }
    expect(pair, 'no slot with a sold-out room and a seat to spare on this day').toBeTruthy();

    // Queue first: the overlap guard only looks at confirmed seats, so this is
    // how an attendee ends up with two things on at once.
    await request.put(`${API}/users/${lane.user}/reservations/${pair.full.id}`);
    const seat = await request.put(`${API}/users/${lane.user}/reservations/${pair.open.id}`);
    expect(seat.ok(), 'the waitlist place should not block the seat').toBeTruthy();

    try {
      await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T07:00` });

      await expect(row(page, pair.open.id).getByTestId('agenda-clash')).toContainText(pair.full.title);
      await expect(row(page, pair.full.id).getByTestId('agenda-clash')).toContainText(pair.open.title);

      // Give the waitlist place up from the row itself: no reload, no navigation.
      await row(page, pair.full.id).getByRole('button', { name: 'Leave the waitlist' }).click();
      await expect(row(page, pair.full.id)).toHaveCount(0);
      await expect(row(page, pair.open.id).getByTestId('agenda-clash')).toHaveCount(0);
      await expect(page).toHaveURL(/\/my-agenda$/);
    } finally {
      await request.delete(`${API}/users/${lane.user}/reservations/${pair.open.id}`);
      await request.delete(`${API}/users/${lane.user}/reservations/${pair.full.id}`);
    }
  });

  test('nothing ahead is an empty state that says so and points at the schedule', async ({ page }, testInfo) => {
    const lane = await laneFor('agenda.empty', testInfo);
    // Hold the fetch open, so the loading state is what a slow network shows —
    // never an empty agenda that has not been asked for yet.
    await page.route(`**/api/users/${lane.user}/schedule`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    // This attendee's conference is over by this day: they hold nothing ahead.
    await visit(page, '/my-agenda', { as: lane.user, at: `${lane.day}T12:00` });

    await expect(page.getByTestId('agenda-loading')).toBeVisible();
    await expect(page.getByTestId('agenda-empty')).toHaveCount(0);
    await expect(page.getByTestId('agenda-empty')).toBeVisible();
    await expect(page.getByTestId('agenda-empty').getByRole('link', { name: /schedule/i }))
      .toHaveAttribute('href', '/schedule');
  });

  test('it is still in the nav, and the old /my-plan address lands here', async ({ page }, testInfo) => {
    await visit(page, '/');
    // Desktop shows the main nav; a phone hides it behind the menu button.
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: /My Agenda/ }).click();
    } else {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /My Agenda/ }).click();
    }
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByRole('heading', { name: /My Agenda/ })).toBeVisible();

    await visit(page, '/my-plan');
    await expect(page).toHaveURL(/\/my-agenda$/);
  });
});
