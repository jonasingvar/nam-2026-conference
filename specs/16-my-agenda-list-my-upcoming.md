# My Agenda: list my upcoming sessions and flag clashes and impossible cross-town hops

## What this changes
`/my-agenda` stops being a "Coming soon" panel. The signed-in attendee sees the sessions they hold that have not ended yet, judged by `useConference().clock`. They are grouped by day, in time order. Each row shows the time, title, room, venue and a **Seat** or **Waitlist** badge. When two sessions overlap, both are flagged as a clash, and each flag names the other session. Two consecutive confirmed seats at different venues are flagged as a hop that won't fit when the gap between them is shorter than the fastest non-walking route plus the walk to the room. The flag states both durations, e.g. "Rideshare + walk takes 31 min, you have 30". Removing a row updates the list and its flags straight away. An attendee with nothing upcoming sees an empty state with a link to `/schedule`.

## Where
- `src/lib/agenda.js` (new: pure, no React): `upcomingAgenda({ sessions, reservationFor, clock, travel })` → `[{ date, sessions: [{ ...s, status, clashesWith: [session], hop: null | { mode, tripMinutes, gapMinutes } }] }]`.
  - Keep a session only if `reservationFor(s.id)` is set and `!hasEnded(s, clock)` (`src/lib/clock.js`).
  - Sort by day, then `startsAt`, then id. Drop days left empty.
  - Clashes: pairwise overlap over both statuses, the same rule as `server/lib/agenda.js:clashesIn`.
  - Hops: between consecutive **confirmed** seats on a day, via `src/lib/travel.js:assessTravel`, flagged when `impossible`. `tripMinutes` = `fastest.total`.
- `src/pages/MyAgendaPage.jsx`: replace the placeholder.
  - Fetch with `useFetch(() => api.getSchedule(currentUserId), [currentUserId])` and flatten the days' `sessions`.
  - Pass them through `upcomingAgenda` with `reservationFor`, `clock` and `travel` from `useConference()`. The store is the source of truth, so a removal re-renders with no refetch (agenda.md § Building on it).
  - Each row's remove button calls `toggleSeat(s.id, s)`.
  - Test ids: `agenda-day`, `agenda-item` (`data-session-id`), `agenda-status`, `agenda-clash`, `agenda-hop`, `agenda-empty`.
  - On a phone the rows stack, with no horizontal overflow.
- `tests/unit/agenda.test.js` (new): camelCase session fixtures, with travel built the way `tests/unit/travel.test.js` builds it.
- `tests/agenda.spec.js` (new): uses `visit`, `momentOn`, `bookableFor`, `laneFor('agenda.hop', testInfo)`, `ATTENDEES` and `failOnPageErrors`.
- `tests/helpers.js:LANES`: add `'agenda.hop': { desktop: { user: andy, day: 1 }, mobile: { user: abraham, day: 1 } }`. No other lane uses either pair; `tests/unit/lanes.test.js` checks that.
- `tests/home.spec.js`: rename "My Agenda is a blank canvas" to "My Agenda is in the nav and /my-plan redirects". It asserts the heading, not `agenda-coming-soon`.
- Docs: `context/engineering-context/agenda.md` (§ placeholder, Where to change…), the MyAgendaPage doc comment, and CLAUDE.md § Deliberately unbuilt (My Agenda is no longer a placeholder).

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| lists not-ended sessions grouped by day in time order, with time/title/room/venue and seat vs waitlist | `agenda.test.js` "groups by day in start order, with status". `agenda.spec.js` "lists what I hold" (Jonas, `at` = `momentOn(0, '12:30')`): every `agenda-item` shows a time, title, room, venue name and a Seat/Waitlist badge, and the `agenda-day` dates ascend | unit + browser |
| ended sessions are not listed | `agenda.test.js` "drops sessions that have ended by the clock" (an earlier day, and the same day with `endsAt` ≤ time). In the spec above, none of Jonas's Day 1 sessions that end by 12:30 appear | unit + browser |
| overlapping pair both flagged, each naming the other | `agenda.test.js` "a seat and a waitlist place that overlap both carry clashesWith the other". The spec asserts that an `agenda-clash` contains the other session's title | unit + browser |
| a cross-town hop that won't fit is flagged with the trip and gap times | `agenda.test.js`: flagged when gap < fastest non-walk + walk. Not flagged when the trip fits, at the same venue, or when one side is waitlisted. `agenda.spec.js` "flags a hop that won't fit" on lane `agenda.hop`: from `bookableFor`, it books via the API seats in two consecutive slots at different venues (both `seatsLeft > 3`), picking the first pair where gap < 18 + second room's `walkMinutes`, computed from bootstrap `travel`. `agenda-hop` shows both minute values. Both seats are released in `finally` | unit + browser |
| removing updates the list and flags without a reload | Same spec: click remove on one of the pair. That row and `agenda-hop` disappear, with no `page.reload()` and no navigation | browser |
| nothing upcoming → empty state linking to the schedule | `agenda.spec.js` "empty state": `at` = `momentOn(3, '23:00')`, by which time everything has ended; read-only. `agenda-empty` is visible and its link goes to `/schedule` | browser |
| works on a phone and a laptop | Every spec runs under both `desktop` and `mobile`. On mobile, it asserts `scrollWidth <= clientWidth` | browser |

Every row is false on main: the page renders only `agenda-coming-soon`, and `src/lib/agenda.js` does not exist.

## Decisions
- The flags are computed client-side from the store rather than taken from `/schedule`'s `conflicts`, so a removal clears them with no refetch.
- A hop is checked only between consecutive confirmed seats on the same day. A waitlist place never occupies a slot.
- The hop text names the fastest non-walking mode and its total including the walk. It does not list every mode.
- Remove uses the existing `toggleSeat` with its undo toast. There is no confirmation dialog.
- Rows link to `/sessions/:id`. No check-in or rating controls are added.

## Out of scope
Hours totals, free-slot suggestions, the .ics button, the Home page.
