import { hasEnded, toMinutes } from './clock.js';
import { assessTravel } from './travel.js';

/**
 * The attendee's own agenda — what is still ahead, and what will not work.
 *
 * Pure, and given everything it needs: the `GET /users/:id/schedule` payload,
 * the store's live reservations, the conference clock and the travel table.
 * The store is what decides what you hold, not the payload the page was
 * fetched with, so removing a seat moves the list and its flags at once
 * (CLAUDE.md § There is exactly one action).
 */
export function upcomingAgenda({ days = [], reservationFor, clock, travel = [] }) {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const sessions = day.sessions
        .map((s) => ({ ...s, reservation: reservationFor(s.id) }))
        .filter((s) => s.reservation)
        // "Upcoming" is not over yet: a talk under way still counts.
        .filter((s) => !hasEnded(s, clock))
        .sort((a, b) => toMinutes(a.startsAt) - toMinutes(b.startsAt) || a.id - b.id)
        .map((s) => ({ ...s, clash: null, hop: null }));

      flagClashes(sessions);
      flagHops(sessions, travel);
      return { date: day.date, sessions };
    })
    .filter((day) => day.sessions.length > 0);
}

const overlaps = (a, b) =>
  toMinutes(a.startsAt) < toMinutes(b.endsAt) && toMinutes(b.startsAt) < toMinutes(a.endsAt);

/**
 * Every overlapping pair names the other session. Both statuses count: the seat
 * rules block two confirmed seats in a slot, so what surfaces here is a waitlist
 * place that overlaps something you hold — still worth saying.
 */
function flagClashes(sessions) {
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const [a, b] = [sessions[i], sessions[j]];
      if (!overlaps(a, b)) continue;
      if (!a.clash) a.clash = { id: b.id, title: b.title };
      if (!b.clash) b.clash = { id: a.id, title: a.title };
    }
  }
}

/**
 * A cross-town hop is judged between consecutive *confirmed* seats only: a
 * waitlist place is not a chair, so a claim about making it across town would
 * be about a session you may never get into. The gap runs from the end of one
 * to the start of the next, and is reported when even the quickest non-walking
 * route, plus the walk to the room, does not fit it.
 */
function flagHops(sessions, travel) {
  let previous = null;
  for (const session of sessions) {
    if (session.reservation !== 'confirmed') continue;
    if (previous) {
      const gapMinutes = toMinutes(session.startsAt) - toMinutes(previous.endsAt);
      const leg = assessTravel({ travel, from: previous, to: session, gapMinutes });
      if (leg?.impossible) {
        session.hop = {
          fromId: previous.id,
          fromTitle: previous.title,
          gapMinutes,
          minutes: leg.fastest.total,
          mode: leg.fastest.mode,
        };
      }
    }
    previous = session;
  }
}
