# Better home page: today's reserved sessions

## What this changes
Home is static today. It will open with a "Your day" section listing every session the signed-in attendee holds a **confirmed** seat for on the current conference day (`clock.day`), earliest first. Each entry is a large card: the speaker portrait(s) linking to `/speakers/:id`, title, time, room and venue, and a Remove button that gives the seat back. Nothing else can be done from it. The section reserves its height until its data is ready, and the rest of the page waits for it, so nothing pops in or shifts (follow-up below).

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

## Follow-up: the tiles no longer arrive first and get shoved

Review found the flicker the original "No flicker on load" check missed. The
skeleton holds **one** card, but the section is as tall as the day is long, so
on a day with three seats the page grew by two cards while the attendee watched:
`QuickLinks` was static, so the tiles were on screen instantly and then bumped
down the page as the schedule and the reservations landed. Reserving a height
the section cannot know in advance was the wrong fix; holding the page back is
the right one.

- `src/pages/HomePage.jsx` — the day's `useFetch`, the `waiting` flag
  (`!ready || !reservationsReady || loading`) and the `seats` list move from
  `TodaySeats` up into `HomePage`, which hands them down as props. Everything
  from `QuickLinks` down renders only once `waiting` is false, so nothing that
  is already on screen can move; `TodaySeats` keeps its skeleton and its place.
  It does delay `LatestAnnouncement`'s and `SponsorMarquee`'s own fetches to
  that moment — both are below the fold, and the trade is deliberate.
- The tiles and the day's cards enter with the existing `stagger` utility
  (children `--i`, capped at 12), so the page reads in a beat rather than
  snapping. No new keyframes, and the reduced-motion block already neutralises
  `stagger`, so nothing ends up hidden.
- `tests/home.spec.js` — `the tiles wait for your day, then play in behind it`:
  with the attendee's reservations held back, `quick-links` is absent
  altogether; released, it is there, and both its tiles and the day's cards
  carry distinct animation delays. The original section test is untouched.
