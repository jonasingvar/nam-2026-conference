/**
 * Your own conference, composed on the client.
 *
 * `server/lib/agenda.js` builds the payloads (`/users/:id/schedule` and
 * `/today`); this is the little bit of reading that belongs in the browser,
 * where the store — not the payload a page was fetched with — is the source of
 * truth for your own reservations (CLAUDE.md § There is exactly one action).
 */

/**
 * The sessions `reservationFor` still holds as `'confirmed'` on `day`, earliest
 * first.
 *
 * Only confirmed seats: a waitlist place may never come good, so it is not an
 * hour you hold (the same rule `totalMinutes` follows). A day with nothing on it
 * is empty, not the rest of the plan. The payload is copied before sorting, so
 * the caller's array is left as it was.
 */
export function todaysSeats(days, day, reservationFor) {
  const onDay = (days ?? []).find((d) => d.date === day);
  return [...(onDay?.sessions ?? [])]
    .filter((s) => reservationFor(s.id) === 'confirmed')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
}
