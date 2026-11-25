# Better home page: today's reserved sessions

## What this changes
Home is static today. It will open with a "Your day" section listing every session the signed-in attendee holds a **confirmed** seat for on the current conference day (`clock.day`), earliest first. Each entry is a large card: the speaker portrait(s) linking to `/speakers/:id`, title, time, room and venue, and a Remove button that gives the seat back. Nothing else can be done from it. The section reserves its height until its data is ready, and holds that height whatever the day turns out to contain, so nothing pops in or shifts (follow-up below).

## Where
- `src/lib/agenda.js` (new, tiny) — pure `todaysSeats(days, day, reservationFor)`: picks the day's sessions from `getSchedule` output, keeps those whose store reservation is `'confirmed'`, sorts by `startsAt`; test in `tests/unit/agenda.test.js` (plain node:test like `tests/unit/format.test.js`).
- `src/pages/HomePage.jsx` — new `TodaySeats` component placed between `HeroBar` and `QuickLinks`; `useFetch(api.getSchedule, [currentUser.id])`, filtered through `reservationFor` from `useConference()` (store is the source of truth, so a removed card disappears at once); portrait via `Avatar` (`imageUrl`) wrapped in `Link`; room/venue via `roomById`/`venueById`; Remove calls `releaseSeat(s.id, s)`. Show a fixed-height skeleton while `useFetch` is loading or `ready` is false, then swap content in place (no `Reveal` on it); render an empty-state line when nothing is booked. Remove `[&>:empty]:hidden` interactions only if needed.
- `tests/home.spec.js` — replace the "nothing on it is personal or live" test (it asserts the old static page; keep it asserting `live-now`, `next-up`, etc. stay absent); add specs using `visit(page, '/', { as, at: momentOn(0, '10:30') })`, `laneFor('home.today', testInfo)`, `bookableFor`, `API` to book via `POST /users/:id/reservations` and release after.
- `tests/helpers.js` — add a `home.today` entry to `LANES` (a day-0 attendee/day pair no other lane shares, per `tests/unit/lanes.test.js`).
- `context/engineering-context/ui.md` (Home section, ~line 155–167) and `agenda.md` (`/schedule` "no UI calls it yet") — update.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| I can see all sessions I have booked for today (reserved seat for) | `todaysSeats` keeps only confirmed seats on the given day, drops waitlisted/other days, sorts by start; spec: book two sessions today as the lane attendee, Home shows exactly those cards (`today-seat`) | unit + Playwright |
| Each session shows the speaker image, clickable to that speaker | spec: card has a link `/speakers/:id` containing the portrait img, click lands on the speaker page | Playwright |
| Each session is on the larger side with speaker and venue details | spec: card shows speaker name, room and venue short name, and its box is at least a set height on desktop and mobile | Playwright |
| I can unreserve on the home page | spec: click Remove on a card, it disappears, `GET /users/:id` no longer lists the reservation, and the card does not reappear after reload | Playwright |
| No flicker on load | spec: after load the section's height never changes once the first card renders (sample bounding box before/after `ready`), and the skeleton's height equals the filled state's min height | Playwright |

## Decisions
- Does "today" mean the simulated conference day (`clock.day`, honouring `?at=`), not the real calendar date?
- Are waitlisted sessions left off the list (only confirmed seats, as "reserved a seat for")?
- Should ended sessions earlier today still be listed (the ticket says "all sessions booked for today"), greyed as finished?
- Should the existing static home test be changed so only the announced-absent ids (`live-now`, `next-up`, …) stay forbidden, since `today-panel` is no longer the intended name?
- Is client-side composition of `getSchedule` plus the store acceptable, with no new endpoint?
- Should the portrait fall back to the generated avatar when `imageUrl` is missing (the existing `Avatar` does this)?

## Out of scope
Reserving, check-in, rating, swapping or any other action from Home; My Agenda; other days.

## Follow-up: the tiles no longer get shoved, and everything plays in

Review found the flicker the original "No flicker on load" check missed. The
skeleton held **one** card, but the section was as tall as the attendee's day is
long, so on a day with three seats the page grew by two cards while they
watched: `QuickLinks` is static, so the tiles were on screen instantly and then
bumped down the page as the schedule and the reservations landed.

- `TodaySeats` — the seats sit in one fixed-height row (a card `h-[14rem]` and
  `w-[min(100%,26rem)]`, the list `h-[14rem] snap-x overflow-x-auto`) instead of
  stacking, so the section is one height whatever the count and nothing below it
  moves. `tests/home.spec.js` adds `loading the page shifts nothing: cumulative
  layout shift stays low` (a `PerformanceObserver` totalling `layout-shift`
  entries, asserted < 0.1). Holding the rest of the page back until the day
  landed was tried and rejected: the page is short enough that the footer is on
  screen while it waits, and then jumps.
- `src/pages/HomePage.jsx` — the tiles of `QuickLinks` and the day's cards enter
  with the existing `stagger` utility (children `--i`, capped at 12), so the
  page reads in a beat rather than snapping into place. No new keyframes; the
  reduced-motion block already neutralises `stagger`, so nothing ends up hidden.
- `tests/home.spec.js` — `the tiles and the day's cards play in, one behind the
  next`: both rows carry `rise-in` with distinct animation delays. The original
  section test is untouched.
