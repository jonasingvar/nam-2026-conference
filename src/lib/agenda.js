import { assessTravel } from './travel.js';
import { hasEnded, toMinutes } from './clock.js';

const overlaps = (a, b) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * The attendee's upcoming plan from `getSchedule`'s days, judged by the store:
 * only sessions `reservationFor` still holds, not yet ended, sorted by start.
 * Each gets `clashesWith` (any overlapping session, seat or waitlist place) and
 * `hop` — set on the arriving session of two consecutive confirmed seats at
 * different venues when no non-walking route fits the gap.
 */
export function planDays(days, { reservationFor, clock, travel }) {
  return days
    .map((day) => {
      const mine = day.sessions
        .map((s) => ({ s, reservation: reservationFor(s.id) }))
        .filter(({ s, reservation }) => reservation && !hasEnded(s, clock))
        .map(({ s, reservation }) => ({ ...s, reservation }))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);

      const confirmed = mine.filter((s) => s.reservation === 'confirmed');
      const sessions = mine.map((s) => {
        const prev = confirmed[confirmed.indexOf(s) - 1];
        let hop = null;
        if (prev && s.reservation === 'confirmed') {
          const gapMinutes = toMinutes(s.startsAt) - toMinutes(prev.endsAt);
          const trip = assessTravel({ travel, from: prev, to: s, gapMinutes });
          if (trip?.impossible) hop = { minutes: trip.fastest.total, mode: trip.fastest.mode, gapMinutes, from: prev };
        }
        return {
          ...s,
          clashesWith: mine.filter((o) => o.id !== s.id && overlaps(s, o)),
          hop,
        };
      });
      return { ...day, sessions };
    })
    .filter((day) => day.sessions.length > 0);
}
