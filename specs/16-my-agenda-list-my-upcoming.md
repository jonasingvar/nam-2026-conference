# My Agenda: list my upcoming sessions and flag clashes and impossible cross-town hops

## What this changes
`/my-agenda` stops being a "Coming soon" panel. The signed-in attendee sees the sessions they hold that have not ended yet (by `useConference().clock`), grouped by day and in time order. Each row shows the time, title, room, venue and a **Seat** or **Waitlist** badge. Two sessions that overlap are both flagged as a clash, and each flag names the other session. Two consecutive confirmed seats at different venues whose gap is shorter than the fastest non-walking route plus the walk to the room are flagged as a hop that won't fit, e.g. "Rideshare takes 31 min, you have 30". Removing a row updates the list and its flags straight away. An attendee with nothing upcoming sees an empty state that links to `/schedule`.

## Where
- `src/lib/agenda.js` (new, pure, no React): `upcomingAgenda({ sessions, reservationFor, clock, travel })` → `[{ date, sessions: [{ ...s, status, clashesWith: [s], hop: null | { mode, tripMinutes, gapMinutes } }] }]`. It keeps only sessions where `reservationFor(s.id)` is set and `!hasEnded(s, clock)` (`src/lib/clock.js`), drops empty days, and sorts by day, then `startsAt`, then id. It finds clashes by pairwise overlap (the same rule as `server/lib/agenda.js:clashesIn`, both statuses). It finds hops between consecutive **confirmed** seats on a day using `src/lib/travel.js:assessTravel`, flagging the pair when `impossible`. `tripMinutes` is `fastest.total`.
- `src/pages/MyAgendaPage.jsx`: replace the placeholder. `useFetch(() => api.getSchedule(currentUserId), [currentUserId])`, flatten the days' `sessions`, then pass them through `upcomingAgenda` with the store's `reservationFor`, `clock` and `travel` from `useConference()`. The store is the source of truth, so a removal re-renders without a refetch. Each row's remove button calls `toggleSeat(s.id, s)`. Test ids: `agenda-day` (one per date), `agenda-item` (`data-session-id`), `agenda-status`, `agenda-clash`, `agenda-hop`, `agenda-empty`. Rows stack on a phone with no horizontal overflow.
- `tests/unit/agenda.test.js` (new): fixtures built in the camelCase session shape, with travel as in `tests/unit/travel.test.js`.
- `tests/agenda.spec.js` (new): uses `visit`, `momentOn`, `bookableFor`, `laneFor('agenda.hop', testInfo)`, `ATTENDEES` and `failOnPageErrors`.
- `tests/helpers.js:LANES`: add `'agenda.hop': { desktop: { user: andy, day: 1 }, mobile: { user: abraham, day: 1 } }`. No other pane uses these pairs; `tests/unit/lanes.test.js` checks that.
- `tests/home.spec.js`: the "My Agenda is a blank canvas" test becomes "My Agenda is in the nav and /my-plan redirects". It asserts the heading, not `agenda-coming-soon`.
- Docs: `context/engineering-context/agenda.md` (§ placeholder, Where to change), the MyAgendaPage doc comment, and CLAUDE.md § Deliberately unbuilt (My Agenda is no longer a placeholder).

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| lists not-ended sessions grouped by day, time order, with time/title/room/venue and seat vs waitlist | `agenda.test.js` "groups by day in start order, with status"; `agenda.spec.js` "lists what I hold" (Jonas, `at` = Day 1 12:30): every `agenda-item` shows a time, title, room, venue name and a Seat/Waitlist badge, and the days are in order | unit + browser |
| ended sessions are not listed | `agenda.test.js` "drops sessions that have ended by the clock" (an earlier day, and the same day with `endsAt` ≤ time); the spec above asserts that none of Jonas's Day 1 morning sessions (ended by 12:15) appear | unit + browser |
| overlapping pair both flagged, each naming the other | `agenda.test.js` "a seat and a waitlist place that overlap both carry clashesWith the other" | unit |
| cross-town hop that won't fit is flagged with trip and gap times | `agenda.test.js`: flagged when gap < fastest non-walk + walk, not flagged when it fits, same venue, or one side waitlisted. `agenda.spec.js` "flags a hop that won't fit" on lane `agenda.hop`: book via the API a seat in slot N at one venue and a seat in slot N+1 at the other venue, in a room with `walkMinutes` ≥ 13 (18-min rideshare + 13 > the 30-min gap), both from `bookableFor` with `seatsLeft > 3`. `agenda-hop` shows both minute values. The test releases both seats in `finally` | unit + browser |
| removing updates list and flags without reload | same spec: click remove on one of the pair. That row and `agenda-hop` disappear with no `page.reload()`, and there is no navigation | browser |
| nothing upcoming → empty state linking to the schedule | `agenda.spec.js` "empty state": `at` = last day 23:00 (everything has ended, read-only). `agenda-empty` is visible and its link goes to `/schedule` | browser |
| works on a phone and a laptop | every spec runs under both `desktop` and `mobile`; on mobile, assert `document.documentElement.scrollWidth <= clientWidth` | browser |

Every row is false on main: the page renders only `agenda-coming-soon`, and `src/lib/agenda.js` does not exist.

## Decisions
- The flags are computed client-side from the store, not taken from `/schedule`'s `conflicts`, so a removal clears them without a refetch (agenda.md § Building on it).
- A hop is checked only between consecutive confirmed seats on the same day. A waitlist place never occupies a slot, so it is not checked.
- The hop text names the fastest paid-or-free mode and its total including the walk ("Rideshare + walk 31 min, gap 30 min"). It does not list every mode.
- Removing a seat from the row uses the existing `toggleSeat`, with its undo toast. There is no confirmation dialog.
- Rows link to `/sessions/:id`. Check-in and rating controls are not added.

## Out of scope
Hours totals, free-slot suggestions, the .ics button, the Home page.
