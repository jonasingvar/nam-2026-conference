# My Agenda: list my upcoming sessions and flag clashes and impossible cross-town hops

## What this changes
`/my-agenda` stops being "coming soon". It lists the signed-in attendee's sessions that have not ended by the conference clock, grouped by day in time order. Each row shows time, title, room, venue and a Seat / Waitlist badge. Two overlapping sessions are each flagged as a clash that names the other. Two consecutive confirmed sessions at different venues are flagged when the gap is shorter than the fastest non-walking route plus the walk to the room; the flag gives trip minutes and gap minutes. Removing a session updates rows and flags at once. With nothing upcoming, an empty state links to `/schedule`.

## Where
- `src/lib/agenda.js` (new, pure) — `upcomingDays({ days, reservationFor, clock })` re-filters `getSchedule` days through the store's `reservationFor` and `hasEnded`, drops empty days, and returns per-session `clashesWith` (overlap, either status) plus per-pair hop warnings (consecutive **confirmed** sessions, `assessTravel` with `gapMinutes = start − previous end`; flag when `impossible` or no option fits, reporting `fastest.total` and gap). Test in `tests/unit/agenda.test.js` (no helpers).
- `src/pages/MyAgendaPage.jsx` — replace the placeholder: `api.getSchedule(currentUser.id)` via `useFetch`, `useConference()` for `clock`, `reservationFor`, `travel` (bootstrap data); `SessionCard variant="row"` or a simple row; empty state keeps a `Browse the schedule` link; test ids `agenda-row-<id>`, `agenda-clash-<id>`, `agenda-hop-<id>`, `agenda-empty`. Responsive stacking on a phone (see `.claude/rules/ui.md`).
- `src/lib/api.js` — `getSchedule` already exists, no change.
- `tests/agenda.spec.js` (new) — Playwright, pins the clock with `?at=` via `visit(page, '/my-agenda', { as, at })`, books via the API, using `laneFor('agenda.page', testInfo)` and `bookableFor`; new `LANES['agenda.page']` entry in `tests/helpers.js` (must satisfy `tests/unit/lanes.test.js`).
- `tests/home.spec.js` lines ~58-62 and `tests/unit/gate.test.js` fixtures — the `agenda-coming-soon` assertions move to the new page (`agenda-empty` / heading); update the doc `context/engineering-context/agenda.md` ("My Agenda is a placeholder", "no UI calls it yet").

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Lists not-ended sessions grouped by day, time order, with a seat/waitlist status | `upcomingDays` groups, orders and carries status; spec sees each row's time, title, room, venue and badge | unit + spec |
| Ended sessions are not listed | `upcomingDays` with a clock past a session's end drops it (and its empty day) | unit |
| Overlapping sessions both flagged, naming the other | `clashesWith` on both ids (seat + waitlist pair) in unit; spec shows both flags with the other title | unit + spec |
| Cross-town hop that won't fit is flagged with trip and gap minutes | unit with the travel table from `travel.test.js` (gap 30 vs fastest + walk; fits → no flag; waitlisted neighbour → no flag); spec books a real pair at different venues in adjacent slots | unit + spec |
| Removing a session updates list and flags without reload | spec clicks remove on a clashing row; row and flags vanish with no navigation | spec |
| Nothing upcoming shows an empty state linking to the schedule | spec with the clock pinned after the attendee's last session / clean-day attendee; `agenda-empty` has the `/schedule` link | spec |
| Works on a phone | the same spec runs in the `mobile` project; assert no horizontal overflow | spec |

## Decisions
- `/schedule`'s `conflicts` and the client recompute give the same answer on load; the page uses the client recompute only (needed for live removal) — OK?
- A hop is only checked between consecutive confirmed seats; a waitlisted neighbour never triggers one (a waitlist place may never come good) — OK?
- "Consecutive" means adjacent in start order among the day's remaining confirmed sessions, including across a session that has ended? We assume ended sessions are ignored, so the first remaining session has no hop in — OK?
- Sessions in progress (started, not ended) count as upcoming, per `hasEnded` — OK?

## Out of scope
Hours totals, free-slot suggestions, calendar export, Home page.
