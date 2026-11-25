---
area: agenda
summary: The attendee's own conference — the My Agenda page, and the endpoints an agenda is built on (/users/:id/schedule and /today, the speaker's own sessions, the .ics exports).
read_when: touching My Agenda, an attendee's day or schedule, suggestions, clashes or booked-hours totals, a speaker's own sessions, or calendar export
files:
  - server/lib/agenda.js
  - server/lib/ical.js
  - src/lib/agenda.js
  - src/pages/MyAgendaPage.jsx
tests:
  - tests/my-agenda.spec.js
  - tests/unit/agenda.test.js
  - tests/api/agenda.test.js
  - tests/api/calendar.test.js
  - tests/unit/ical.test.js
related: [seats, attendance, clock, venues, schedule, speakers, ui]
---

# Agenda

**My Agenda** (`/my-agenda`, `MyAgendaPage`, in the nav; `/my-plan` redirects
there) is the attendee's own plan: their sessions that are not over yet, by day
in time order, each with its time, title, room, venue and seat-or-waitlist
place, with rows that clash or will not fit a cross-town hop flagged, and an
empty state pointing at `/schedule`. The rules are `src/lib/agenda.js`
(pure, unit-tested) and the page is a thin render on top. What is deliberately
*not* there yet: hours totals, suggestions for free slots and the export button.
Adding a session takes a seat (seats doc); what a day is made of is decided in
`server/lib/agenda.js`, and routes in `server/routes/users.js` only validate and
call it.

## How it works

**`GET /api/users/:id/schedule`** → `{ user: toUser(row), days: scheduleFor(id) }`.
Client: `api.getSchedule(userId)`, called once by `MyAgendaPage`.
`agenda.js:scheduleFor` returns one entry per day that has any reservation:
`{ date, sessions (each with reservation, checkedIn, myStars), conflicts, totalMinutes,
waitlistedMinutes, venuesVisited }`. `checkedIn` (bool) and `myStars` (number or `null`)
are this attendee's attendance on *every* day, not just today. The two minute totals split by status — `totalMinutes` counts
**confirmed seats only**, `waitlistedMinutes` the queued time — because hours
mean hours you hold a chair for.
`clashesIn` is an O(n²) pairwise overlap test over that day's sessions (both
statuses) → `{ type: 'overlap', sessionIds: [a, b] }`. `venuesVisited` is venue
`shortName`s.

**Building on it — `src/lib/agenda.js:upcomingAgenda`.** The store, not the fetched
payload, is the source of truth for the attendee's own reservations (CLAUDE.md §
There is exactly one action), so the page hands this function the payload, the
store's `reservationFor`, the clock and the travel table, and it does the rest:
re-filter each day (dropping what is no longer held, and each day left empty),
drop sessions `hasEnded` (clock doc), sort days by date and sessions by `startsAt`,
then work out both flags for itself: the payload's `conflicts` are ignored, and
the same pairwise overlap runs again on what is left. Each session comes back as
`{ ...session, reservation, clash, hop }`: `clash` is `{ id, title }` of the other
session on an overlap (**both** statuses, so a waitlist place beside a seat is
flagged), and `hop` is on the *later* of two consecutive **confirmed** seats at
different venues whose gap is shorter than `assessTravel`'s quickest non-walking
option plus the walk to the room (`{ fromId, fromTitle, gapMinutes, minutes, mode }`).
A row is the page's own, not `SessionCard variant="row"`: it has to name the venue
even for the home site, and carry the flags. Booked hours under a waitlist caveat
fit `Stat`'s `note` (ui doc); export is `api.agendaCalendarUrl`.
`MyAgendaPage` keys the fetch on `currentUser.id` and shows a loading state until
the payload lands — never the empty state, which would claim a full plan is bare
(seen: `agenda-loading`, `agenda-day`, `agenda-session`, `agenda-clash`,
`agenda-hop`, `agenda-empty`).

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
- On the page, a hop is claimed only between two **confirmed** seats — a waitlist
  place is not a chair, so no travel claim hangs on it. A clash is the opposite:
  both statuses count.
- Anything "today" keys off `clock.day`/`clock.time` (`useConference().clock`),
  never `days[0]` or `new Date()`.

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

- What the My Agenda page lists, sorts or flags: `src/lib/agenda.js:upcomingAgenda`
  (unit-tested on plain objects in `tests/unit/agenda.test.js`); how it looks:
  `MyAgendaPage.jsx` (`tests/my-agenda.spec.js`).
- A new field on the day payload → `agenda.js:todayFor`; prove it in `tests/api/` with `startApi()`.
- Suggestion ranking → `agenda.js:suggestionsFor` / `myTopics` / `openInSlot`.
- Clash or total rules → `agenda.js:scheduleFor`/`clashesIn`, and any client
  recomputation a page does (`upcomingAgenda`'s clash is the client's own, so the
  two must agree on what an overlap is).
- Calendar fields → `ical.js:event`; escaping/folding tests in `tests/unit/ical.test.js`.
