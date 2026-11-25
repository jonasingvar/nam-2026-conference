# Better My Agenda
## What this changes
`/my-agenda` is a "Coming soon" placeholder. It becomes the attendee's day: one large panel per session they hold a confirmed seat for on the current conference day (`clock.day`), in time order. Each panel has a left rail line that draws from top to bottom on load, the speaker portrait(s) linking to `/speakers/:id`, the speaker name and title, the room and venue, and a single **Release seat** action. Home is untouched. No server change: `getToday` already returns hydrated sessions with `speakers`, `room`, `venue`.

## Where
- `src/pages/MyAgendaPage.jsx` — replace the placeholder. Fetch `api.getToday(currentUser.id, clock)` once per `[user, clock.day]` (not per 30 s tick, to avoid reflow); keep `current`, `next`, `finished` confirmed sessions, then filter through `useConference().reservationFor(id) === 'confirmed'` so a release drops the panel at once. Show a skeleton with the final layout height until loaded (no flicker); empty state links to `/schedule`. Release calls `toggleSeat`.
- `src/components/AgendaSessionPanel.jsx` (new, small) — the panel: `GeneratedAvatar`/`imageUrl` wrapped in `Link`, venue/room text, `data-testid="agenda-session-<id>"`, `agenda-release-<id>`, `agenda-rail`.
- `src/index.css` — a `rail-draw` keyframe/utility (`scaleY` 0→1, origin top), disabled under `prefers-reduced-motion`.
- `tests/home.spec.js` — the two `agenda-coming-soon` assertions (lines ~58, ~62) are replaced with agenda-page assertions; `tests/unit/gate.test.js` only uses the id as a fixture string, leave it.
- `tests/agenda.spec.js` (new) using a new lane `agenda.page` added to `LANES` in `tests/helpers.js` (clean day 0 attendee per project, `clean: true`), `visit`, `momentOn`, `bookableFor`, `clearAgendaFor`; check `tests/unit/lanes.test.js` still passes.
- `context/engineering-context/agenda.md` — replace "My Agenda is a placeholder" with the real page; `CLAUDE.md` "Deliberately unbuilt" My Agenda bullet.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| I can see all sessions I have booked for today | lane attendee books two sessions via API, visits `/my-agenda` pinned with `at`; both `agenda-session-<id>` panels show, a waitlisted/other-day one does not | spec `agenda.spec.js` |
| Each session shows the speaker image, clickable to the speaker | panel contains a link `href=/speakers/<id>` with an image/avatar; click lands on speaker page | spec |
| Sessions are large, with speaker and venue details | panel text contains speaker name, job title, room name and venue name; panel height ≥ a set minimum | spec |
| I can unreserve on the page | click `agenda-release-<id>`; panel disappears without reload and API `/users/:id` no longer lists the reservation | spec |
| No flicker on load | skeleton shown first; panel count never goes down→up (no empty-state flash) when a booked agenda loads — assert empty state is never visible | spec |
| Rail animates top to bottom | `agenda-rail` computed `animation-name` is `rail-draw` and transform scaleY starts <1 shortly after load, ends at 1; with reduced motion it is 1 immediately | spec |
| Out of scope: no reserve from here | page has no add/reserve control (`getByRole('button', {name:/reserve|add/i})` count 0) | spec |

## Decisions
- The ticket says "unreserve on the home page" but means My Agenda (and says home is untouched); is release on `/my-agenda` only, Home unchanged, correct?
- "Today" means the simulated `clock.day` (Day 1 unless pinned); is that right rather than the real calendar date?
- Are waitlisted seats left off the page (only confirmed seats shown, per the "hours you hold a chair for" rule)?
- Should sessions already finished today still be listed (shown dimmed) rather than hidden?
- Is the speaker portrait for a multi-speaker session shown as a stack, each linking to its own profile?

## Out of scope
Reserving, check-in, rating, other days, `.ics` export, any change to Home or to the server.

## Amended while building
- **The page reads `/users/:id/schedule`, not `/today`.** `todayFor` returns `current`
  (one), `next` (only the *next* session) and `finished` — the day's later seats are in
  none of them, so "all sessions I have booked for today" is unreachable from that
  payload at 08:00. `/schedule` carries every seat on every day, so it is one fetch per
  attendee with the day picked client-side from `clock.day`.
- **The store needed a `userReady` flag.** The reservations map is empty until
  `GET /users/:id` lands, which is indistinguishable from "nothing booked" and flashed
  the empty state; the page now waits for both responses before drawing.
- **The lane is day index 1, not a clean day 0.** Every attendee with a free day 0 pair
  is already claimed by another lane; abraham (desktop) has seeded waitlist places on
  day 1, which is what the "waitlisted seats are not shown" check needs.
