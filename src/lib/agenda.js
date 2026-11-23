import { hasEnded, toMinutes } from './clock.js';
import { assessTravel } from './travel.js';

/**
 * The attendee's own agenda, derived — never stored.
 *
 * `/users/:id/schedule` is fetched once, but the store, not that payload, is
 * the source of truth for what the attendee still holds (CLAUDE.md § There is
 * exactly one action). So every day is re-filtered through `reservationFor`
 * here: that is what makes a session dropped on the page leave the list, and
 * the flags that named it, without a refetch.
 *
 * Pure on purpose — the rules are the point of the page, and they are worth
 * proving without a browser.
 */

/** The days left, in order, each with only what is still held and has not ended. */
export function upcomingDays(days, reservationFor, clock) {
  return days
    .map((day) => ({
      date: day.date,
      sessions: day.sessions
        .map((s) => ({ ...s, reservation: reservationFor(s.id) }))
        .filter((s) => s.reservation && !hasEnded(s, clock))
        .sort((a, b) => toMinutes(a.startsAt) - toMinutes(b.startsAt) || a.id - b.id),
    }))
    .filter((day) => day.sessions.length)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Every pair of sessions that overlap in time, keyed by session id, so a row
 * can name the one it clashes with.
 *
 * Both a seat and a waitlist place count. The seat rules block two *confirmed*
 * seats in one slot, so what usually surfaces here is a waitlist place that
 * overlaps a seat you hold — still worth telling them about.
 */
export function clashesFor(sessions) {
  const byId = new Map();
  const add = (id, other) => {
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(other);
  };

  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i];
      const b = sessions[j];
      if (a.day !== b.day) continue;
      if (toMinutes(a.startsAt) < toMinutes(b.endsAt) && toMinutes(b.startsAt) < toMinutes(a.endsAt)) {
        add(a.id, b);
        add(b.id, a);
      }
    }
  }
  return byId;
}

/**
 * The cross-town hops that will not fit, keyed by session id.
 *
 * Consecutive *confirmed* seats only: a waitlist place may never come good, and
 * you cannot miss a chair you never held. The gap runs from the end of one
 * confirmed session to the start of the next, and it is too short when even the
 * fastest non-walking route plus the walk to the room does not fit
 * (`assessTravel(...).impossible`).
 */
export function hopsFor(sessions, travel) {
  const confirmed = sessions
    .filter((s) => s.reservation === 'confirmed')
    .sort((a, b) => toMinutes(a.startsAt) - toMinutes(b.startsAt) || a.id - b.id);

  const byId = new Map();
  for (let i = 0; i + 1 < confirmed.length; i++) {
    const from = confirmed[i];
    const to = confirmed[i + 1];
    const assessment = assessTravel({
      travel, from, to,
      gapMinutes: toMinutes(to.startsAt) - toMinutes(from.endsAt),
    });
    if (!assessment?.impossible) continue;

    const hop = {
      from, to,
      gapMinutes: assessment.gapMinutes,
      tripMinutes: assessment.fastest.total,
    };
    for (const session of [from, to]) {
      if (!byId.has(session.id)) byId.set(session.id, []);
      byId.get(session.id).push(hop);
    }
  }
  return byId;
}
