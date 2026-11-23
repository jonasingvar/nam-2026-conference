import { hasEnded, toMinutes } from './clock.js';
import { assessTravel } from './travel.js';

const overlaps = (a, b) => a.day === b.day && a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * The attendee's own plan, from the store's reservations rather than a fetched
 * payload so a removal needs no refetch. Keeps what is held and not yet over,
 * grouped by day in start order, and flags the two ways a plan fails: sessions
 * that overlap (`clashesWith`, either status, same rule as the server's
 * `clashesIn`) and a hop between consecutive confirmed seats at different
 * venues that the gap cannot cover (`hop`, via `assessTravel`).
 */
export function upcomingAgenda({ sessions, reservationFor, clock, travel }) {
  const mine = sessions
    .map((s) => ({ s, status: reservationFor(s.id) }))
    .filter(({ s, status }) => status && !hasEnded(s, clock))
    .map(({ s, status }) => ({ ...s, status }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.startsAt.localeCompare(b.startsAt) || a.id - b.id);

  const days = [];
  for (const s of mine) {
    if (days.at(-1)?.date !== s.day) days.push({ date: s.day, sessions: [] });
    days.at(-1).sessions.push(s);
  }

  return days.map(({ date, sessions: list }) => {
    const seats = list.filter((s) => s.status === 'confirmed');
    return {
      date,
      sessions: list.map((s) => {
        const prev = seats[seats.indexOf(s) - 1];
        const trip = s.status === 'confirmed' && prev
          ? assessTravel({ travel, from: prev, to: s, gapMinutes: toMinutes(s.startsAt) - toMinutes(prev.endsAt) })
          : null;
        return {
          ...s,
          clashesWith: list.filter((o) => o !== s && overlaps(o, s)),
          hop: trip?.impossible
            ? { mode: trip.fastest.mode, tripMinutes: trip.fastest.total, gapMinutes: trip.gapMinutes }
            : null,
        };
      }),
    };
  });
}
