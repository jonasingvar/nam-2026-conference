import { test, expect } from '@playwright/test';
import { API, visit, momentOn, laneFor, shotForPR, failOnPageErrors } from './helpers.js';

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * The sessions this test drives the agenda with, booked against the seed's real
 * geometry on the lane's day (Day 2 for two attendees the seed leaves empty —
 * see LANES in helpers.js):
 *
 *  - the day's keynote (Aurora, 08:00–08:45) and a Foundry talk at 09:00. The
 *    15-minute gap is shorter than the fastest non-walking route plus the walk
 *    to the room, so it is a cross-town hop that will not fit.
 *  - a session in that same 09:00 slot the seed has already sold out. Booking
 *    it waitlists the attendee, and it overlaps the Foundry talk, so a clash.
 *
 * A full session is booked first: the API blocks two *confirmed* seats in one
 * slot, so only a waitlist place can be held alongside the talk.
 */
async function agendaDay(request, lane, at) {
  const all = await (await request.get(`${API}/sessions?day=${lane.day}`)).json();
  const keynote = all.find((s) => s.isKeynote);
  const full = all.find((s) => !s.isKeynote && s.isFull && s.startsAt >= keynote.endsAt);
  const talk = all.find((s) => !s.isKeynote && !s.isFull
    && s.startsAt === full.startsAt && s.venue.id !== full.venue.id);
  expect(talk, 'the sold-out slot has no session at the other venue').toBeTruthy();

  // The seeded plan is not ours to clear — release only what this test books.
  const schedule = await (await request.get(`${API}/users/${lane.user}/schedule`)).json();
  const held = new Set((schedule.days.find((d) => d.date === lane.day)?.sessions ?? [])
    .filter((s) => s.reservation === 'confirmed').map((s) => s.id));

  const mine = [];
  for (const session of [full, talk, keynote]) {
    if (held.has(session.id)) continue;
    const res = await request.put(`${API}/users/${lane.user}/reservations/${session.id}`, {
      data: { day: lane.day, time: at },
    });
    expect(res.ok(), `booking ${session.id} (${session.title}) failed`).toBeTruthy();
    mine.push(session.id);
  }
  return { keynote, full, talk, mine };
}

/** How long the fastest non-walking route plus the walk to the room really is. */
async function tripMinutes(request, from, to) {
  const { travel } = await (await request.get(`${API}/bootstrap`)).json();
  const fastest = travel
    .filter((t) => t.fromVenueId === from.venue.id && t.toVenueId === to.venue.id && t.mode !== 'Walk')
    .sort((a, b) => a.minutes - b.minutes)[0];
  return fastest.minutes + to.room.walkMinutes;
}

test.describe('My Agenda', () => {
  test('lists what is ahead, flags what will not fit, and updates when you drop one', async ({ page, request }, testInfo) => {
    const errors = failOnPageErrors(page);
    const lane = await laneFor('agenda.page', testInfo);
    const { keynote, full, talk, mine } = await agendaDay(request, lane, '07:00');
    const trip = await tripMinutes(request, keynote, talk);
    const gap = toMinutes(talk.startsAt) - toMinutes(keynote.endsAt);

    try {
      // 08:30: the keynote is still running, so it is still ahead of them.
      await visit(page, '/my-agenda', { as: lane.user, at: await momentOn(1, '08:30') });

      await expect(page.getByTestId('agenda-day').first()).toBeVisible();

      const keynoteRow = page.getByTestId(`agenda-row-${keynote.id}`);
      await expect(keynoteRow).toBeVisible();
      await expect(keynoteRow).toContainText(keynote.title);
      await expect(keynoteRow).toContainText(keynote.room.name);
      await expect(keynoteRow).toContainText(keynote.venue.name);
      await expect(keynoteRow).toContainText('Seat');

      const talkRow = page.getByTestId(`agenda-row-${talk.id}`);
      await expect(talkRow).toBeVisible();
      await expect(talkRow).toContainText(talk.venue.name);
      await expect(talkRow).toContainText('Seat');

      const fullRow = page.getByTestId(`agenda-row-${full.id}`);
      await expect(fullRow).toBeVisible();
      await expect(fullRow).toContainText('Waitlist');

      // The hop names the other session and both numbers: the trip, and the gap.
      await expect(talkRow.getByTestId('agenda-hop')).toContainText(`${trip} min`);
      await expect(talkRow.getByTestId('agenda-hop')).toContainText(`${gap} min`);
      await expect(keynoteRow.getByTestId('agenda-hop')).toContainText(talk.title);

      // The overlap flags both rows, each naming the other.
      await expect(talkRow.getByTestId('agenda-clash')).toContainText(full.title);
      await expect(fullRow.getByTestId('agenda-clash')).toContainText(talk.title);

      await shotForPR(page, 'my-agenda');

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'my agenda scrolls horizontally').toBeLessThanOrEqual(1);

      // Dropping the waitlisted session updates the list and its flags in place.
      let navigations = 0;
      page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });
      await fullRow.getByTestId('agenda-remove').click();
      await expect(fullRow).toHaveCount(0);
      await expect(talkRow.getByTestId('agenda-clash')).toHaveCount(0);
      await expect(talkRow.getByTestId('agenda-hop')).toBeVisible(); // still cannot make the trip
      expect(navigations, 'the list updated without a reload').toBe(0);

      // 10:15: keynote and talk are both over, so neither is listed; what is
      // left later that day still is.
      await visit(page, '/my-agenda', { as: lane.user, at: await momentOn(1, '10:15') });
      await expect(page.getByTestId(`agenda-row-${keynote.id}`)).toHaveCount(0);
      await expect(page.getByTestId(`agenda-row-${talk.id}`)).toHaveCount(0);
      await expect(page.getByTestId(/^agenda-row-/).first()).toBeVisible();

      // Nothing ahead at all: an empty state that points at the schedule.
      await visit(page, '/my-agenda', { as: lane.user, at: await momentOn(3, '23:59') });
      const empty = page.getByTestId('agenda-empty');
      await expect(empty).toBeVisible();
      await expect(empty.getByRole('link', { name: /schedule/i })).toHaveAttribute('href', '/schedule');

      expect(errors).toEqual([]);
    } finally {
      for (const id of mine) await request.delete(`${API}/users/${lane.user}/reservations/${id}`);
    }
  });
});
