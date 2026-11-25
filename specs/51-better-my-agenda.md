# Better My Agenda

## What this changes
`/my-agenda` is a "Coming soon" placeholder. It becomes the attendee's day: a hero bar (TODAY, `Day N · time`, weekday and date left; conference date range and city right) over a "Your day" list of the sessions they hold a **confirmed seat** for on the current simulated day. Each row is a large, fully clickable card (to the session page) with a speaker portrait that links to the speaker, plus time, track, status, title, speakers, role, room · venue and a Remove button that asks for confirmation. Home is untouched.

## The reference
`/vercel/.factory/reference/reference-1.png` (1329×933, dark theme), top to bottom:
- Header chrome (logo, nav with a count badge on My Agenda, user switcher) — already in the app.
- Hero panel, full content width, rounded, 1px border, soft violet glow top-left: tiny mono "• TODAY" (cyan dot); huge display "Day 1 · 2:26 PM" (dot muted); beneath it muted "Wednesday, Nov 25". Right, bottom-aligned: "November 25–28, 2026" (semibold) over tiny mono caps "LAS VEGAS, NV".
- Section row: "Your day" (display, ~22px) left; right tiny mono caps muted weekday/date ("WEDNESDAY, NOV 25").
- A vertical stack of full-width cards (~175px tall for one speaker, taller for two), ~12px gap, rounded, 1px border, surface background. No filters, no tiles, no second button.
- Each card: a 4px full-height rail on the left edge, colour per session (violet for Foundation Models, red/rose for Responsible AI — the track colour). Portraits (round, ~96px) in a column at left, stacked vertically, one per speaker. To the right: line 1 tiny mono caps muted "8:00 AM – 8:45 AM · TRACK NAME (track colour) · FINISHED"; line 2 title (display, ~20px, semibold, white); line 3 speaker names comma-separated (muted-light, 14px); line 4 first speaker's "Role · Company" (small, muted); at the bottom-left small muted "Room · Venue" (e.g. "Nebula Main Stage · Aurora"). Bottom-right: a "✕ Remove" button — small, rose text, rose border, dark-rose fill.
- The reference shows finished sessions in the list, so the day includes ended sessions with a FINISHED label.

## Where
- `src/pages/MyAgendaPage.jsx` — replace the placeholder. Read `useConference()` for `clock`, `reservationFor`, `toggleSeat`; fetch `getSchedule(userId)` via `useFetch`, then filter the clock's day by `reservationFor(s.id) === 'confirmed'` (store is the truth, so a removal drops the row immediately). Render skeleton/hero synchronously, one fade-in for the whole list once loaded (no pop-in flicker); empty-day state links to `/schedule`. Keep `data-testid`s: `agenda-hero`, `agenda-session-<id>`, `agenda-remove-<id>`, `agenda-remove-confirm`, `agenda-empty`.
- `src/components/AgendaSessionCard.jsx` (new, one component) — whole-card `<Link>` stretched over the card; portrait links to `/speakers/:id` above it (z-index) and Remove button likewise (must not navigate); accent rail from `session.track.color` via `src/lib/accents.js`; confirm step is an inline/dialog confirm (not a toast), Remove then calls `toggleSeat`.
- `src/index.css` — keyframes for the rail grow (scaleY 0→1 from top, track colour), card hover lift/glow, honoured under `prefers-reduced-motion`.
- `src/components/ui.jsx` / `src/lib/api.js` — reuse only; no new endpoint.
- `tests/home.spec.js:58-62` — replace the `agenda-coming-soon` assertions; `tests/agenda.spec.js` (new) using the data-lane helpers in `tests/helpers.js` (own attendee/day, `?at=` clock pin, release what is booked); `tests/unit/` for any pure filter helper (e.g. `src/lib/agenda.js:dayAgenda`) with `node:test`.
- `tests/unit/gate.test.js` references `agenda-coming-soon` only as fixture text; leave.
- `context/engineering-context/agenda.md` and `ui.md` — update "My Agenda is a placeholder"; `CLAUDE.md` "Deliberately unbuilt" line for My Agenda.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| I can see all session I have booked for today (reserved seat for) | unit: `dayAgenda(schedule, day, reservationFor)` keeps only confirmed seats for the day, sorted by start, drops waitlisted | unit |
| (same, in the page) | spec: book two sessions in own lane, pinned clock, `/my-agenda` shows exactly those cards and not a waitlisted or other-day one | Playwright |
| Each session listed should show the image of the speaker that allows us to click and see more about that speaker | spec: card shows a portrait per speaker; clicking it lands on `/speakers/:id` | Playwright |
| Each session should be on the larger side so speaker details and venue details can be presented | spec: card contains speaker names, role · company, room and venue text and its height ≥ 150px | Playwright |
| You should be able to unreserve your seat on the session on the home page | spec: Remove → confirm; row disappears, API `/users/:id/schedule` no longer holds the seat, nav badge decrements | Playwright |
| The remove should have a confirmation | spec: first click on Remove shows the confirm, Cancel keeps the seat; only Confirm releases | Playwright |
| Entire session card should be clickable | spec: clicking an empty part of the card navigates to `/sessions/:id` | Playwright |
| No weird flickering on load | spec: from first paint the hero is present and the list container height never shrinks once cards render (no placeholder-to-content swap; skeletons match card size) | Playwright |
| Line animates top to bottom in the session/speaker colour | spec: rail's computed `animation-name` is set, its background equals the track colour, and the rail's final height equals the card's | Playwright |
| Fancy hover effect | spec: hovering a card changes its computed transform/box-shadow (disabled for reduced motion) | Playwright |

## Decisions
- The ticket says "home page" in several places but the title and image caption say My Agenda and "home should not be touched": is it right to build all of this on `/my-agenda` and leave Home as is?
- "Today" is the simulated clock's day (`useConference().clock.day`), and the reference's finished morning sessions show on it: is listing already-ended sessions (labelled FINISHED) right?
- Waitlisted seats are not "booked", so they are left off the list: confirm?
- The ticket asks for a line colour matching "the session/speaker" and is unsure what colours mean: is using the session's track colour for rail and track label acceptable?
- The reference shows Remove for finished sessions too, yet the API may refuse nothing there (`92-undo-ended-seat`): keep Remove on ended sessions?
- The reference's top header shows "Home" active and the hero with "Day N · time": is the hero a new bar on My Agenda (not shared with Home)?

## Out of scope
Reserving or any other action from this page; changing Home; multi-day views; check-in, rating, export.
