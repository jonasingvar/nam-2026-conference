import { assessTravel } from './travel.js';
import { hasEnded, toMinutes } from './clock.js';

/**
 * The attendee's own conference: what they still have ahead of them, day by
 * day, with the two problems worth knowing about.
 *
 * The store, not the payload the page was fetched with, is the source of truth
 * for your own reservations (CLAUDE.md § There is exactly one action): a
 * session removed a moment ago is still in `getSchedule`'s days, so the days
 * are re-filtered through `reservationFor` on every render rather than trusted.
 * A session that has already finished is not yours to plan around any more, so
 * it goes too, and a day that loses its last session goes with it.
 *
 * Two flags, both per session:
 *  - `clashesWith` — the other sessions of the day this one overlaps, seat or
 *    waitlist place. The seat rules refuse two confirmed seats in one slot, so
 *    what turns up here is a waitlist place beside something you hold.
 *  - `hop` — the trip from the session before this one does not fit the gap
 *    between them. Confirmed seats only, and only against the previous
 *    confirmed seat: a waitlist place may never come good, so warning about
 *    missing one would be noise.
 */
export function upcomingDays({ days = [], reservationFor, clock, travel = [] }) {
  return days
    .map((day) => ({
      date: day.date,
      sessions: day.sessions
        .filter((session) => reservationFor(session.id) && !hasEnded(session, clock))
        .map((session) => ({ ...session, reservation: reservationFor(session.id) }))
        .sort((a, b) => toMinutes(a.startsAt) - toMinutes(b.startsAt) || a.id - b.id),
    }))
    .filter((day) => day.sessions.length)
    .map((day) => ({ ...day, sessions: flag(day.sessions, travel) }));
}

/** Does one session's time run into the other's? */
const overlaps = (a, b) =>
  toMinutes(a.startsAt) < toMinutes(b.endsAt) && toMinutes(b.startsAt) < toMinutes(a.endsAt);

function flag(sessions, travel) {
  const clashesWith = (session) => sessions
    .filter((other) => other.id !== session.id && overlaps(session, other))
    .map((other) => other.id);

  const hopInto = hopsInto(sessions, travel);

  return sessions.map((session) => ({
    ...session,
    clashesWith: clashesWith(session),
    hop: hopInto.get(session.id) ?? null,
  }));
}

/**
 * The trip that will not fit, keyed by the session you are travelling *to* —
 * that is the one you miss. The gap is what is left between the two, and the
 * trip is the quickest way over plus the walk to the room at the other end.
 */
function hopsInto(sessions, travel) {
  const confirmed = sessions.filter((session) => session.reservation === 'confirmed');
  const hops = new Map();

  for (let i = 1; i < confirmed.length; i++) {
    const from = confirmed[i - 1];
    const to = confirmed[i];
    const gapMinutes = toMinutes(to.startsAt) - toMinutes(from.endsAt);
    const trip = assessTravel({ travel, from, to, gapMinutes });

    if (trip?.impossible) {
      hops.set(to.id, { fromId: from.id, gapMinutes, travelMinutes: trip.fastest.total });
    }
  }

  return hops;
}
