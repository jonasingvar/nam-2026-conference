/**
 * The sessions My Agenda lists: seats you hold (confirmed — a waitlist place is
 * not a chair) on one day, earliest first.
 *
 * `schedule` is `getSchedule(userId).days`; it says which sessions you have ever
 * booked. `statusOf` is the store's `reservationFor`, which decides whether you
 * still hold them — so a seat given back disappears without a refetch.
 */
export function todaysSeats(schedule, statusOf, day) {
  const sessions = (schedule ?? []).find((d) => d.date === day)?.sessions ?? [];
  return sessions
    .filter((s) => statusOf(s.id) === 'confirmed')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id);
}
