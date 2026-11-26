/**
 * The sessions an attendee holds a confirmed seat in on `day`, earliest first.
 *
 * `days` is the `/users/:id/schedule` payload; `reservationFor` is the store's.
 * The store decides, not the payload, so a seat just given back disappears at
 * once. Waitlist places are not booked time and are left out.
 */
export function todaysSeats(days, day, reservationFor) {
  const entry = (days ?? []).find((d) => d.date === day);
  return (entry?.sessions ?? [])
    .filter((s) => reservationFor(s.id) === 'confirmed')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
}
