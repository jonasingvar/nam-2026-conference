# 16 — My Agenda: list my upcoming sessions and flag clashes and impossible cross-town hops

## What this changes

`/my-agenda` stops being a "Coming soon" panel. It lists the signed-in
attendee's sessions that have not ended by the conference clock, grouped by day
(`agenda-day-<date>`) in start-time order. Each row (`agenda-item-<id>`) shows
time range, title, room and venue, and a *Seat* or *Waitlist* badge, plus a
Remove button that calls the store's `toggleSeat`. Two sessions that overlap are
both flagged `agenda-clash` — "Clashes with <other title>". Two consecutive
confirmed seats at different venues whose gap is shorter than the fastest
non-walking route plus the walk to the room get `agenda-hop` on the second one:
"Cross-town hop won't fit — <N> min by <mode>, <M> min gap". If nothing is
upcoming, an `agenda-empty` panel links to `/schedule`. `/my-plan` still
redirects.

## Where

- `src/lib/agenda.js` (new, pure) — `planDays(days, { reservationFor, clock, travel })`:
  takes `getSchedule`'s `days`, keeps sessions whose `reservationFor(s.id)` is
  non-null and `!hasEnded(s, clock)`, sets `reservation` from the store, drops
  empty days, sorts by `startsAt`; attaches `clashesWith` (overlap test as in
  `server/lib/agenda.js:clashesIn`, both statuses) and `hop` (`travel.js:assessTravel`
  on consecutive **confirmed** pairs, kept only when `impossible`). Test in
  `tests/unit/agenda.test.js` with fixtures shaped like `tests/unit/travel.test.js`.
- `src/pages/MyAgendaPage.jsx` — replace the placeholder: `useFetch(() => api.getSchedule(currentUser.id), [currentUser.id])`,
  then `useMemo` over `planDays(..., { reservationFor, clock, travel })` from
  `useConference()`, so a removal re-renders without a refetch. Rows as above;
  stack to one column under `sm`.
- `tests/home.spec.js` — replace "My Agenda is a blank canvas" with a nav +
  `/my-plan` redirect check that waits for `agenda-day-*` or `agenda-empty`.
- `tests/agenda.spec.js` (new) — browser checks below; `tests/helpers.js`
  `LANES` gains `'agenda.remove': { desktop: { user: andy, day: 1 }, mobile: { user: abraham, day: 1 } }`
  (no other lane writes those pairs); use `laneFor`, `bookableFor`, `momentOn`, `visit`.
- `context/engineering-context/agenda.md` (and `ui.md` if it lists the
  placeholder), `CLAUDE.md` § Deliberately unbuilt — My Agenda is no longer a placeholder.
- `context/engineering-context/seed.md` — step 8 and the Jonas row of the attendee
  table: his cross-town pairs are not traps (Day 1's Foundry 11:30 slot does not exist,
  Day 4's 30 min gap covers 18 min rideshare + 9 min walk), so stop calling them that.
  `server/seed.js` is not changed.

## How it will be proved

| Done when | Check | Layer |
| --- | --- | --- |
| Lists upcoming sessions, grouped by day, time order, time/title/room/venue, seat vs waitlist | `planDays` groups and sorts, carries `reservation`; spec: Jonas pinned at `momentOn(0,'08:00')`, each `agenda-day-<date>` matches his `/schedule` days, rows in start order, a row shows room, venue and *Seat*/*Waitlist* | unit + spec |
| Ended sessions not listed | `planDays` drops `hasEnded` sessions (earlier day, and same day `endsAt <= time`); spec: Jonas at `momentOn(0,'12:30')` shows no Day 1 morning row | unit + spec |
| Overlaps both flagged, naming the other | `planDays`: seat + waitlist place overlapping → each `clashesWith` the other; spec `agenda.remove` asserts both rows' `agenda-clash` name the other title | unit + spec |
| Impossible cross-town hop flagged with trip and gap | `planDays`: Aurora→Foundry confirmed pair with gap < fastest+walk → `hop` with minutes and gap; fitting gap (e.g. 30 min vs 18+9), same venue, or a waitlisted leg → no hop; spec `agenda.remove` books its own cross-town pair on the lane day whose gap is under fastest+walk and asserts `agenda-hop` on the arriving row reads "<N> min by <mode>, <M> min gap", none on the departing row. Jonas's seeded pairs are not asserted | unit + spec |
| Removal updates list and flags without reload | unit: `reservationFor` returning null drops the session and its partner's `clashesWith`; spec `agenda.remove`: book a seat and an overlapping waitlist place via API on the lane day, visit pinned to Day 1, click Remove on one, assert it is gone and the other's `agenda-clash` disappears with no navigation; release in `finally` | unit + spec |
| Empty state with schedule link | spec: any attendee at `momentOn(3,'23:30')` (after the Closing Party) sees `agenda-empty` with a link to `/schedule` | spec |
| Works on a phone | every spec above runs on the `mobile` project; plus no horizontal overflow (`scrollWidth <= clientWidth`) on `/my-agenda` | spec |

All rows are red on main: `src/lib/agenda.js` does not exist and the page
renders only `agenda-coming-soon`.

## Decisions

- **Answered by jonasingvar on PR #18 ("loosen the rule. the seed data don't need to show this"):** the ticket's parenthetical — Jonas has two non-fitting hops seeded on Day 1 and Day 4 — is dropped as an acceptance requirement. On a fresh seed neither pair trips the rule (Day 1 has no Foundry 11:30 session; Day 4's 30 min gap fits 18 + 9), and the seed is left alone. The hop rule itself stays as the ticket words it (gap < fastest non-walking route + walk to the room); it is proved by unit fixtures and by a pair the spec books itself, and a reviewer opening Jonas's agenda should expect no hop flags.

- Each row gets its own Remove button (via `toggleSeat`, so the undo toast and store stay in charge) rather than sending the attendee to the session page to remove.
- The hop flag sits on the second (arriving) session only; the clash flag sits on both, as the ticket asks.
- A hop is judged only between consecutive confirmed seats on the same day, ignoring waitlist places in between, per the ticket's "consecutive confirmed sessions".
- "Fastest non-walking route" uses `assessTravel(...).impossible` (no non-walking mode fits once the room walk is added), and the message quotes `fastest.total` and its mode.
- A session in progress counts as not ended, so it is listed.

## Out of scope

Hours totals, free-slot suggestions, the calendar export button, Home.
