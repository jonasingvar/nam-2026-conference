---
area: agenda
summary: The attendee's own conference — the My Agenda page (what is still to come, with clashes and impossible cross-town hops) and the endpoints it is built on (/users/:id/schedule and /today, the speaker's own sessions, the .ics exports).
read_when: touching My Agenda, an attendee's day or schedule, suggestions, clashes or booked-hours totals, a speaker's own sessions, or calendar export
files:
  - server/lib/agenda.js
  - server/lib/ical.js
  - src/lib/agenda.js
  - src/pages/MyAgendaPage.jsx
tests:
  - tests/agenda.spec.js
  - tests/home.spec.js
  - tests/api/agenda.test.js
  - tests/api/calendar.test.js
  - tests/unit/agenda.test.js
  - tests/unit/ical.test.js
related: [seats, attendance, clock, venues, schedule, speakers, ui]
---

# Agenda

**My Agenda is the attendee's own conference.** `/my-agenda` (`MyAgendaPage`, in
the nav; `/my-plan` redirects there) lists the sessions they still have ahead of
them, day by day, each saying seat or waitlist place — and flags the two ways the
plan can fall apart: two sessions at once, and a cross-town hop that will not fit.
It is built on `GET /api/users/:id/schedule`, re-filtered through the store on
every render, so removing a seat updates the rows *and* their flags at once.
Deliberately not there: hours totals, free-slot suggestions, the calendar export
button. Everything underneath is built and tested: adding a session takes a seat
(seats doc), and the payloads below are served, with matching functions in
`src/lib/api.js`. What a day is made of is decided in `server/lib/agenda.js`;
routes in `server/routes/users.js` only validate and call it.

## How it works

**`GET /api/users/:id/schedule`** → `{ user: toUser(row), days: scheduleFor(id) }`.
Client: `api.getSchedule(userId)` — its one caller is `MyAgendaPage`.
`agenda.js:scheduleFor` returns one entry per day that has any reservation:
`{ date, sessions (each with reservation, checkedIn, myStars), conflicts, totalMinutes,
waitlistedMinutes, venuesVisited }`. `checkedIn` (bool) and `myStars` (number or `null`)
are this attendee's attendance on *every* day, not just today. The two minute totals split by status — `totalMinutes` counts
**confirmed seats only**, `waitlistedMinutes` the queued time — because hours
mean hours you hold a chair for.
`clashesIn` is an O(n²) pairwise overlap test over that day's sessions (both
statuses) → `{ type: 'overlap', sessionIds: [a, b] }`. `venuesVisited` is venue
`shortName`s.

**What the page is made of — `src/lib/agenda.js:upcomingDays({ days, reservationFor,
clock, travel })`.** Pure; proved in `tests/unit/agenda.test.js` with no helpers.
It drops a session the store no longer holds (`reservationFor(s.id)` — the store,
not the fetched payload, is the source of truth for your own reservations, CLAUDE.md
§ There is exactly one action) and one that has ended (`hasEnded`), drops a day left
empty, and sorts each day by start time. Each session comes back with `reservation`
from the store, plus two flags:

- `clashesWith` — ids of that day's other sessions it overlaps in time, seat or
  waitlist place. The seat rules refuse two confirmed seats in one slot, so what
  turns up is a waitlist place beside something you hold.
- `hop` — `{ fromId, gapMinutes, travelMinutes }`, on the session you are travelling
  *to*, when `travel.js:assessTravel` between it and the previous **confirmed** seat
  is `impossible`. `travelMinutes` is `fastest.total` (quickest non-walking route
  plus the walk to the room). A waitlisted neighbour never triggers one — it may
  never come good — and the day's first confirmed seat has no hop into it.

**`MyAgendaPage`** renders that with `useFetch(() => api.getSchedule(currentUserId))`
and `useConference()` for `clock`, `reservationFor` and `travel`, recomputing
`upcomingDays` in a `useMemo`. Test ids: `agenda-day-<date>`, `agenda-row-<id>` (time,
title, room, venue, a `SeatButton`, and `agenda-status` reading "Seat" or "Waitlist"),
`agenda-clash-<id>` and `agenda-hop-<id>` (both naming the session they are about,
looked up among that day's), and `agenda-empty` with a link to `/schedule`. Hours,
suggestions and export are not on it. A page that also wants booked hours re-filters
for `totalMinutes`/`waitlistedMinutes` (keep the two apart) or shows attendance with
`SessionCard variant="row"`'s `attendance` prop (`{ ended, checkedIn, myStars }`,
schedule doc); booked hours under a waitlist caveat fit `Stat`'s `note` (ui doc);
export is `api.agendaCalendarUrl`.

**`GET /api/users/:id/today?day=&time=`** → `users.js` checks the user exists (404)
and `day` is present (400), then `agenda.js:todayFor(userId, { day, time })`.
`time` defaults to `'00:00'`. Client: `api.getToday(userId, clock)` — no UI
calls it yet. Key a fetch on `[currentUser.id, clock.day, clock.time]` and it
refetches on every clock tick.

Payload, field by field (sessions are `hydrateSessions` output — full
`toSession` plus `speakers` and `tags`):

| field | computed as |
| --- | --- |
| `day`, `time` | echoed from the query |
| `current` | first **confirmed** session on `day` with `startsAt <= now < endsAt`, else `null` |
| `next` | first confirmed session with `startsAt > now`, else `null` |
| `finished` | confirmed sessions with `now >= endsAt` |
| `unrated` | `finished` where `checkedIn && !rated` |
| `waitlisted` | the day's sessions whose reservation is `'waitlisted'` |
| `openSlot` | first `starts_at` from `SELECT DISTINCT starts_at FROM sessions WHERE day=?` that is `> now` and not the exact `startsAt` of a confirmed seat; else `null` |
| `suggestions` | `suggestionsFor(userId, day, openSlot)`, or `[]` |

Confirmed/waitlisted rows are `decorate`d with `reservation`, `checkedIn`, `rated`
(from `reservations`, `check_ins`, `ratings`). "Now" is `toMinutes(time)` from `server/lib/query.js`.

**Suggestion ranking** — `agenda.js:suggestionsFor`: `myTopics` takes the user's
top 8 topic-tag slugs by count across *all* their reservations (any day, either
status). Candidates are `openInSlot`: same day and start, `is_keynote = 0`,
`format != 'Social'`, `seats_taken < capacity`. Each gets `affinity` = number of
its topic tags in that set; sort `affinity` desc then `avgRating` desc; top
`SUGGESTION_COUNT` (3). `users.interests` is never read here.

**Speaker data.** `GET /api/users/:id` adds `speaker` and `speakingSessions`
(`users.js:speakingSessions`, via `presenting` + plain `toSession`, so no
`speakers`/`tags` on them; `fillRate` is there). The only speaker-facing UI is the
"This is you" marker on the speaker's own profile (speakers doc).

**.ics** — `ical.js`: `sessionCalendar(id, baseUrl)` (route `sessions.js`
`/:id.ics`) and `agendaCalendar(userId, baseUrl)` (route `users.js`
`/:id/agenda.ics`, **confirmed seats only**), both passed `baseUrlFor(req)`.
Both return `null` for a missing id → route 404. `event()` emits floating
local `DTSTART`/`DTEND`, `UID:orbit-session-<id>@orbitconf.dev`, LOCATION
`room, venue`, DESCRIPTION `track · format\n\nabstract`; every line goes through
`fold` (75 octets, byte-aware) and text through `escape`. `wrap()` adds
`METHOD:PUBLISH` and `X-WR-CALNAME`, CRLF-joined with a trailing CRLF.

## Invariants

- `current`/`next`/`finished`/`openSlot` consider **confirmed** seats only; waitlist
  places never occupy a slot.
- Hours count confirmed seats only; queued time is `waitlistedMinutes`, totalled
  apart (`api/agenda.test.js`). A UI showing hours must keep the two apart.
- Agenda feed = confirmed only; `calendar.test.js` asserts waitlist places are absent.
- Anything "today" keys off `clock.day`/`clock.time` (`useConference().clock`),
  never `days[0]` or `new Date()`.
- What is on the agenda is derived, never stored: the page keeps no copy, so it
  cannot disagree with `reservationFor` after a swap, an undo or a promotion.

## Gotchas

- `openSlot` matches exact start times, not overlap, and `slotsOnDay` includes
  keynote/social slots. If the first free slot is a keynote slot, `openInSlot`
  returns nothing and `suggestions` is empty.
- `reservationFor(...)` is truthy for a **waitlisted** session too; filter on
  `=== 'confirmed'` for anything that means holding a chair.
- `scheduleFor`'s `conflicts` include waitlisted sessions (both statuses), unlike
  the totals.
- `ical.js` prepares its statements per call (not module scope); `DTSTAMP` uses
  real `new Date()`. `URL:` comes from `baseUrlFor(req)` — `ORBIT_PUBLIC_URL`
  if set, else the first entry of `X-Forwarded-Proto`/`X-Forwarded-Host` or
  the direct connection's own protocol/host. The Vite proxy (`changeOrigin`)
  rewrites Host, so `vite.config.js` sets those headers itself — prove a link
  through the web port (`attendance.spec.js`), not by calling the API directly.
- `speakingSessions` lack `speakers`/`tags` — do not hand them to a component that reads those.

## Where to change…

- The My Agenda page: `MyAgendaPage.jsx` and, for what it shows, `src/lib/agenda.js:upcomingDays`
  (`tests/unit/agenda.test.js` for the rules, `tests/agenda.spec.js` for the rows and flags —
  the spec books its own clashing, cross-town pair, from the `agenda.page` lane).
- A new field on the day payload → `agenda.js:todayFor`; prove it in `tests/api/` with `startApi()`.
- Suggestion ranking → `agenda.js:suggestionsFor` / `myTopics` / `openInSlot`.
- Clash or total rules → `agenda.js:scheduleFor`/`clashesIn`, and any client
  recomputation a page does (`src/lib/agenda.js`).
- Calendar fields → `ical.js:event`; escaping/folding tests in `tests/unit/ical.test.js`.
