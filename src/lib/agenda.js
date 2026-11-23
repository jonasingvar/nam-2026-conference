import { hasEnded, toMinutes } from './clock.js';
import { assessTravel } from './travel.js';

const overlaps = (a, b) => a.day === b.day
  && toMinutes(a.startsAt) < toMinutes(b.endsAt) && toMinutes(b.startsAt) < toMinutes(a.endsAt);

/**
 * The attendee's upcoming sessions, grouped by day, with problems flagged.
 * Pure: the store's `reservationFor` decides what is held, so a removal needs
 * no refetch. Clashes cover seats and waitlist places (as `clashesIn` does on
 * the server); a hop is only checked between consecutive confirmed seats.
 */
export function upcomingAgenda({ sessions, reservationFor, clock, travel }) {
  const mine = sessions
    .filter((s) => reservationFor(s.id) && !hasEnded(s, clock))
    .map((s) => ({ ...s, status: reservationFor(s.id) }))
    .sort((a, b) => a.day.localeCompare(b.day)
      || toMinutes(a.startsAt) - toMinutes(b.startsAt) || a.id - b.id);

  const flagged = mine.map((s) => ({
    ...s,
    clashesWith: mine.filter((o) => o.id !== s.id && overlaps(s, o)),
    hop: null,
  }));

  const seats = flagged.filter((s) => s.status === 'confirmed');
  seats.forEach((to, i) => {
    const from = seats[i - 1];
    if (!from || from.day !== to.day) return;
    const gapMinutes = toMinutes(to.startsAt) - toMinutes(from.endsAt);
    const a = assessTravel({ travel, from, to, gapMinutes });
    if (a?.impossible) to.hop = { mode: a.fastest.mode, tripMinutes: a.fastest.total, gapMinutes };
  });

  const days = [];
  for (const s of flagged) {
    if (days.at(-1)?.date !== s.day) days.push({ date: s.day, sessions: [] });
    days.at(-1).sessions.push(s);
  }
  return days;
}
