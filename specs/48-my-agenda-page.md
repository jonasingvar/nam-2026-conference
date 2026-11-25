# My Agenda page
## What this changes
`/my-agenda` stops being "Coming soon". It lists the signed-in attendee's sessions that have not ended (conference clock), grouped by day in time order, each with time, title, room, venue and seat/waitlist. Overlapping sessions are flagged as a clash naming the other one; two consecutive confirmed sessions at different venues whose gap is shorter than the fastest non-walking route plus the walk are flagged as a cross-town hop that won't fit (trip minutes vs gap minutes). Removing a session updates list and flags at once; nothing upcoming shows an empty state linking to `/schedule`.

## Where
- `src/lib/agenda.js` (new, pure) — `upcomingAgenda({ days, reservationFor, clock, travel })`: re-filter each `getSchedule` day through the store's `reservationFor`, drop `hasEnded` sessions (`clock.js`), sort by `startsAt`, recompute clashes (both statuses, pairwise overlap) and hops (consecutive *confirmed* sessions, `assessTravel` from `travel.js`, `gapMinutes` = next start − previous end, flag when `impossible`), drop empty days; test in `tests/unit/agenda.test.js` (plain objects, like `tests/unit/travel.test.js`).
- `src/pages/MyAgendaPage.jsx` — replace the placeholder: `useFetch`/effect on `api.getSchedule(currentUser.id)` (already in `src/lib/api.js`, no new endpoint), `useConference()` for `reservationFor`, `clock`, `travel`; render via `upcomingAgenda`, with `data-testid`s `agenda-day`, `agenda-session`, `agenda-clash`, `agenda-hop`, `agenda-empty`; empty state `Button to="/schedule"`; stacked single-column rows so it fits a phone. Show a loading state, not the empty state, while fetching.
- `tests/my-agenda.spec.js` (new) — new lane `agenda.page` in `LANES` (`tests/helpers.js`, pick `clean` attendee/day pairs no other lane uses; `tests/unit/lanes.test.js` checks it), `laneFor`, `bookableFor`, `visit(..., { at: await momentOn(...) })`, `API` PUTs to book a cross-town pair with a gap under the trip time, release in `finally`.
- `tests/home.spec.js` — delete "My Agenda is a blank canvas" (asserts `agenda-coming-soon`); keep a nav-link check in the new spec.
- `context/engineering-context/agenda.md` — placeholder section, frontmatter files/tests and "Where to change" updated.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| lists sessions not ended, grouped by day in time order, with seat/waitlist | `upcomingAgenda` groups/sorts/labels; spec visits as a lane attendee with a booked seat and a waitlist place and sees rows with time, title, room, venue, status | unit + spec |
| ended sessions are not listed | unit: session with `endsAt <= clock.time` dropped, day dropped when empty; spec pins clock after Day 1 morning as seeded Jonas (read-only) and sees no row for an attended session | unit + spec |
| overlapping sessions both flagged, naming the other | unit: seat + waitlist overlap → both carry a clash naming the other; spec books the pair via API and sees two `agenda-clash` mentioning each other's title | unit + spec |
| cross-town hop that won't fit flagged with trip and gap minutes | unit: confirmed pair at venues 1→2 with gap < fastest non-walk + walk → hop with minutes; fitting gap, same venue, and waitlisted second session → none; spec books own unfit pair and sees `agenda-hop` text | unit + spec |
| removing a session updates list and flags without reload | unit: flag disappears when `reservationFor` drops one; spec releases via the UI/store and asserts row and flag vanish with no navigation | unit + spec |
| nothing upcoming → empty state with schedule link | spec: clean-lane attendee sees `agenda-empty` with link to `/schedule` | spec |
| works on phone and laptop | spec runs in desktop and mobile projects; asserts no horizontal overflow on mobile | spec |

## Decisions
- Is a cross-town hop judged only between consecutive *confirmed* sessions (waitlisted ones are never "attended", so no hop is claimed for them)?
- Should an attendee's "upcoming" include a session in progress (started, not ended)? Yes per "not ended"; confirm.
- Should the page reuse `SessionCard variant="row"` if it fits, else a small row of its own?
- Is a gap measured end-of-previous to start-of-next, and is a hop flagged even when only a paid mode (rideshare) fits? The ticket says shorter than the *fastest* route, so a fitting rideshare means no flag — confirm.

## Out of scope
Hours totals, free-slot suggestions, calendar export button, Home page, any server change.
