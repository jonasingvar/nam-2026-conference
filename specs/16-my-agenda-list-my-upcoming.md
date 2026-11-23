# My Agenda: list my upcoming sessions and flag clashes and impossible cross-town hops

## What this changes
`/my-agenda` stops being a "coming soon" placeholder. It lists the signed-in attendee's sessions that have not ended (by the conference clock), grouped by day in time order, each with time, title, room, venue and a Seat / Waitlist badge. Overlapping sessions are both flagged, naming the other one. Two consecutive confirmed sessions at different venues whose gap is too short (`assessTravel(...).impossible`) are flagged with the trip time and the gap. Removing a session updates the list and flags at once; an empty agenda shows a link to `/schedule`.

## Where
- `src/lib/agenda.js` (new, pure) — `upcomingDays(days, reservationFor, clock)` drops ended sessions, re-filters through store reservations, sorts by start, groups by day; `clashesFor(sessions)` returns pairs with the other session; `hopsFor(sessions, travel)` runs `assessTravel` over consecutive confirmed sessions (gap = next.startsAt − prev.endsAt via `toMinutes`); test in `tests/unit/agenda.test.js`.
- `src/pages/MyAgendaPage.jsx` — fetch `api.getSchedule(currentUser.id)`, take `reservationFor`, `clock`, `travel` from `useConference()`, render rows, flags, empty state; reuse `hasEnded` from `src/lib/clock.js`. Testids: `agenda-day`, `agenda-row-<id>`, `agenda-clash`, `agenda-hop`, `agenda-empty`.
- `tests/agenda.spec.js` (new) — Playwright, desktop+mobile, clock pinned with `visit(..., { at })`; `laneFor('agenda.page', testInfo)`, `clearAgendaFor`, `bookableFor`, `conferenceDays`.
- `tests/helpers.js` — add LANES `'agenda.page'` with attendee/day pairs no other pane holds (`tests/unit/lanes.test.js` enforces it).
- `tests/home.spec.js` lines ~57-62 — asserts `agenda-coming-soon`; update to the new page's heading/testid. `tests/unit/gate.test.js` uses it only as a fixture string.
- `context/engineering-context/agenda.md`, `venues.md` ("No UI calls it yet") — update.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Lists sessions not yet ended, grouped by day in time order, with seat/waitlist | `upcomingDays` ordering/grouping/status in `tests/unit/agenda.test.js`; row content in `tests/agenda.spec.js` | unit + spec |
| Ended sessions not listed | `upcomingDays` with a clock after a session's end (unit); spec pins clock after Day 1 morning and expects seeded morning rows absent | unit + spec |
| Overlapping sessions both flagged, naming the other | `clashesFor` unit (seat + waitlist overlap); spec books a seat and a waitlisted overlap via API and sees `agenda-clash` naming the other | unit + spec |
| Cross-town hop flagged with trip time and gap | `hopsFor` unit with seeded-shaped travel rows (fits / doesn't fit / same venue / waitlisted ignored); spec books an Aurora→Foundry pair with a 30-min gap and sees `agenda-hop` text | unit + spec |
| Removing updates list and flags without reload | spec removes a flagged session via the row's remove control; row and flag vanish, no reload | spec |
| Empty state with schedule link | spec on a cleared lane (`clean` day, clock after the rest or attendee with nothing upcoming) sees `agenda-empty` and a `/schedule` link | spec |
| Works on a phone | the spec runs in both projects; asserts no horizontal overflow on mobile | spec |

## Decisions
- Is the hop gap measured between consecutive *confirmed* sessions only (waitlisted ones are skipped, since no chair is held)?
- Does a waitlisted session take part in clash flagging (yes, per the ticket) but not in hop flagging?
- Is a session in progress now (started, not ended) still listed as upcoming?
- Does each row get a remove button (needed to prove "removing updates straight away"), using `toggleSeat` from the store?
- Is `travel` taken from the store (`useConference().travel`) rather than a new endpoint?

## Out of scope
Hours totals, free-slot suggestions, calendar export button, Home page.
