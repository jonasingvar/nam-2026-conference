/**
 * The sessions an attendee holds a confirmed seat for on `day`, earliest first.
 * `reservationFor` is the store's lookup, not the fetched payload: a seat
 * released since the fetch must drop out at once. Waitlist places are not
 * seats, so they are not listed.
 */
export function dayAgenda(schedule, day, reservationFor) {
  const entry = schedule?.days?.find((d) => d.date === day);
  return (entry?.sessions ?? [])
    .filter((s) => reservationFor(s.id) === 'confirmed')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
}
