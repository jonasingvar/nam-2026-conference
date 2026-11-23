import { hasEnded } from './clock.js';
import { assessTravel } from './travel.js';

const overlaps = (a, b) => a.day === b.day && a.startsAt < b.endsAt && b.startsAt < a.endsAt;
const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * The attendee's sessions that have not ended, grouped by day, with problems flagged.
 * Pure: the store's `reservationFor` is the source of truth, so a removal recomputes
 * every flag without a refetch.
 *
 * Each session carries `status`, `clashesWith` (every other held session it overlaps,
 * seat or waitlist) and `hop` (null, or `{ mode, tripMinutes, gapMinutes }` when the
 * trip from the previous confirmed seat that day does not fit in the gap).
 */
export function upcomingAgenda({ sessions, reservationFor, clock, travel }) {
  const mine = sessions
    .filter((s) => reservationFor(s.id) && !hasEnded(s, clock))
    .sort((a, b) => a.day.localeCompare(b.day) || a.startsAt.localeCompare(b.startsAt) || a.id - b.id);

  const byDay = new Map();
  for (const s of mine) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day).push(s);
  }

  return [...byDay].map(([date, list]) => {
    const confirmed = list.filter((s) => reservationFor(s.id) === 'confirmed');
    return {
      date,
      sessions: list.map((s) => {
        const prev = confirmed.filter((c) => c.endsAt <= s.startsAt && c.id !== s.id).at(-1);
        const trip = reservationFor(s.id) === 'confirmed' && prev
          ? assessTravel({ travel, from: prev, to: s, gapMinutes: mins(s.startsAt) - mins(prev.endsAt) })
          : null;
        return {
          ...s,
          status: reservationFor(s.id),
          clashesWith: list.filter((o) => o.id !== s.id && overlaps(o, s)),
          hop: trip?.impossible
            ? { mode: trip.fastest.mode, tripMinutes: trip.fastest.total, gapMinutes: trip.gapMinutes }
            : null,
        };
      }),
    };
  });
}
