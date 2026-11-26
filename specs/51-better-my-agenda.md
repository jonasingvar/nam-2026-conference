# Better My Agenda

## What this changes
`/my-agenda` is a "Coming soon" panel. It becomes the attendee's day: a clock panel and a **Your day** list of the sessions they hold a confirmed seat in on `clock.day`, as in the reference. Home is not touched. Each session is a large card — track-coloured rail that draws top to bottom on load, time · track · status, title, speaker portraits (each links to `/speakers/:id`), names, job title · company, room · venue, and a **Remove** button that asks for confirmation before it gives the seat back. The whole card links to the session; the card lifts and glows on hover.

## The reference
Dark page, the app header (Home / Schedule / … / My Agenda with count badge / user switcher) unchanged. Top to bottom:
1. Full-width rounded panel with a faint violet glow top-left: small cyan dot + mono eyebrow "TODAY"; huge display "Day 1 · 2:26 PM" (dot between); muted "Wednesday, Nov 25" beneath. Right side, bottom-aligned: bold "November 25–28, 2026" and a mono muted "LAS VEGAS, NV".
2. Heading row: "Your day" (medium, left), mono muted uppercase date "WEDNESDAY, NOV 25" (right).
3. A single column of full-width rounded panels, ~16px apart, each ~175px+ tall: a 4px rail on the left edge, full height, rounded with the card, coloured by track (violet for Foundation Models, rose/red for Responsible AI). Inside: a ~96px round portrait at top-left (one per speaker, stacked vertically, so a two-speaker card is taller); to its right a mono uppercase meta line "8:00 AM – 8:45 AM · FOUNDATION MODELS · FINISHED" (time muted, track in the rail colour, status muted); title in large medium-weight display type; speaker names in normal text; job title · company small and muted (first speaker's); at the bottom-left room · venue small muted ("Nebula Main Stage · Aurora"); at the bottom-right a small outlined rose/red button with an × icon and "Remove".
Not there: no filters, no tabs, no reserve/add action, no ratings, no seat counts, no sponsors or links grid.

## Where
- `src/pages/MyAgendaPage.jsx` — replace the placeholder. Fetch `api.getSchedule(currentUser.id)` through `useFetch`, take the entry whose `date === clock.day`, then re-filter through `reservationFor(s.id)?.status === 'confirmed'` (store is the source of truth; see agenda doc *Building on it*), sorted by `startsAt`. Render nothing until the fetch has resolved and show a same-height skeleton, so cards never pop in piecemeal. Empty day → a short empty state. Call `useDocumentTitle('My Agenda')`.
- `src/lib/agenda.js` (new, small) — pure `todaysSeats(days, day, reservationFor)`; test in `tests/unit/agenda.test.js` (plain `node:test`, like `tests/unit/clock.test.js`).
- `src/components/AgendaCard.jsx` (new) — the card: stretched `<Link>` to `/sessions/:id` over the whole card, portraits as `<Link to="/speakers/:id">` raised above it (`relative z-10`), `GeneratedAvatar` fallback when `imageUrl` is missing; rail colour from `track.color` via `src/lib/accents.js`; status text from `hasEnded`/current in `src/lib/clock.js`.
- `src/components/RemoveSeatDialog.jsx` (new) — confirmation modal copying `ConflictDialog` (backdrop button, Escape, focus); Confirm calls `useConference().toggleSeat(id, session)` (toasts with Undo already).
- `src/index.css` — `@keyframes rail-draw` (`scaleY(0)` → `1`, origin top) + a `@utility`, and a hover lift/glow utility; both disabled under `prefers-reduced-motion` (rail fully drawn).
- `tests/home.spec.js` lines ~57–62 assert `agenda-coming-soon`; change them to the new `agenda-day` testid. `data-testid`s: `agenda-day`, `agenda-card-<id>`, `agenda-remove-<id>`, `agenda-remove-confirm`.
- New `tests/agenda.spec.js` using `laneFor('agenda.page', testInfo)`, so add a lane `agenda.page` to `LANES` in `tests/helpers.js` (a `clean` attendee/day pair no other lane uses; also satisfy `tests/unit/lanes.test.js`), `visit(page, '/my-agenda', { as, at: await momentOn(0, '14:00') })`, and `clearAgendaFor` / `bookableFor` to arrange seats via the API.
- Docs: update `context/engineering-context/agenda.md` (placeholder section, testids) and the `ui.md` / `CLAUDE.md` "blank on purpose" lines about My Agenda.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| I can see all session I have booked for today (reserved seat for) | `todaysSeats` keeps only confirmed seats on `clock.day`, drops waitlisted and other days, sorts by start; spec: seats booked via API show one `agenda-card-<id>` each, waitlisted/other-day absent | unit + spec |
| Each session listed should show the image of the speaker that allows us to click and see more about that speaker | spec: card has an `img` per speaker; clicking it lands on `/speakers/:id` | spec |
| Each session should be on the larger side so speaker details and venue details can be presented | spec: card shows speaker name, job title · company, room and venue name; card height ≥ 150px | spec |
| You should be able to unreserve your seat on the session on the home page | spec: Remove → confirm → card disappears, `GET /users/:id` no longer has the reservation | spec |
| There is no weird flickering when the page loads because different elements take different time to load | spec: after navigation, the list container appears with all cards at once (card count never goes 0→n→more; skeleton replaces the coming-soon shell), no `reveal` opacity gating on cards | spec |
| Be creative with animations — line on the left animates top to bottom, colour matches session/speaker | spec: rail has computed `animation-name` `rail-draw` and background matches the track accent; under `reducedMotion: 'reduce'` it is fully drawn | spec |
| Fancy hover effect on a session | spec: hovering changes the card's computed `transform` | spec |
| Entire session card should be clickable | spec: clicking the card's empty area lands on `/sessions/:id` | spec |
| The remove should have a confirmation | spec: Remove opens a dialog and the seat is still held until Confirm; Cancel/Escape keeps it | spec |

## Decisions
- The ticket says "home page" but also "for my agenda — home should not be touched". Is the build on `/my-agenda` only, with Home left exactly as it is?
- The reference shows the clock panel ("TODAY · Day 1 · 2:26 PM", dates, city) above the list. Is it built on My Agenda as drawn (dates from `conference.dates` / `days`, never hard-coded)?
- The reference shows **Remove** on FINISHED sessions too. Keep it on every card as drawn (Undo is not offered for ended sessions, as the store already does)?
- The ticket's colour question: the rail uses the session's track colour (`track.color`), which is what the reference's violet/rose rails follow. OK?
- A two-speaker card stacks both portraits vertically, as drawn; with 3+ speakers do we show all of them?
- Waitlisted sessions are not "booked" (hours-you-hold-a-chair rule), so they are not listed. OK?

## Out of scope
Reserving or any other action from this page; Home; days other than `clock.day`; check-in, rating, `.ics` export.
