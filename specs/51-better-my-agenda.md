# Better My Agenda
## What this changes
`/my-agenda` is a "Coming soon" panel. It becomes the attendee's day: a "Today" hero bar, then "Your day" — one large clickable card per session they hold a **confirmed** seat for today (finished ones included), each with speaker portraits (linking to the speaker), time, track, status, title, speaker names and role, room · venue, and a **Remove** button that asks for confirmation before giving the seat back. Home is untouched.

## The reference
Dark page under the normal header (Home / Schedule / … / My Agenda with count badge). Top to bottom:
1. **Hero panel**, full content width, rounded, hairline border, soft violet glow top-left. Left: tiny cyan dot + mono caps "TODAY"; huge display "Day 1 · 2:26 PM" (the dot between is muted); below it muted "Wednesday, Nov 25". Right, bottom-aligned: bold "November 25–28, 2026" over mono caps muted "LAS VEGAS, NV".
2. **Section header** row: "Your day" (display, ~20px) left; mono caps muted weekday + date ("WEDNESDAY, NOV 25") right.
3. **Session cards**, stacked, small gap, full width, rounded-xl, hairline border, surface fill. Each has a **3–4px rail on the left edge, full card height**, coloured per session. Inside: a column of round speaker portraits (~96px) at the left, stacked vertically for multiple speakers (the card grows to fit them); then text: mono caps muted "8:00 AM – 8:45 AM · TRACK (track colour) · FINISHED"; the title (large, medium weight); speaker names (muted, comma-joined); role · company (smaller, fainter); at the bottom "Room · Venue" (small, faint). Bottom-right: a **Remove** button — small, red/rose outline, tinted fill, ✕ icon. Three cards shown: 8:00 (one speaker, violet rail), 9:00 (two speakers, red rail), 10:15 (two speakers, red rail, cut off).
Not there: no filters, no reserve/other buttons, no totals, no day tabs, no sponsors.

## Where
- `src/pages/MyAgendaPage.jsx` — replace placeholder: hero (clock from `useConference().clock`, `days`, `conference`), `getSchedule` via `useFetch`, list re-filtered through `reservationFor(id)?.status === 'confirmed'` for `clock.day`; skeleton of final height so nothing flickers; remove `agenda-coming-soon`.
- `src/lib/agenda.js` (new, pure) — `todaysSeats(schedule, reservationFor, day)`: confirmed sessions of the day, sorted by start; unit test in `tests/unit/agenda.test.js`.
- `src/components/AgendaCard.jsx` (new) — whole-card `Link` to `/sessions/:id`, portraits as links to `/speakers/:id` (sibling to the card link, not nested), animated rail (`scaleY` 0→1, top→bottom, in session/track accent via `src/lib/accents.js`), hover lift/glow; Remove opens a confirm dialog (match `ConflictDialog` pattern) then `releaseSeat(id, session)` from the store.
- `src/index.css` — `@utility` keyframes for rail grow and any hover effect.
- `tests/home.spec.js` (lines ~57–62) — drop the `agenda-coming-soon` assertions; new `tests/agenda.spec.js` using a data lane (`tests/helpers.js` lane helper, pinned clock via `?at=` / `momentOn(0,'14:26')`, book via API `POST /users/:id/reservations`, release afterwards).
- Docs: `context/engineering-context/agenda.md` (placeholder section) and `ui.md`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| All confirmed sessions for today listed (not waitlisted, not other days) | `todaysSeats` filters/sorts | unit |
| Same list on page after booking via API | `agenda.spec.js` count of `agenda-card` equals bookings | Playwright |
| Speaker image links to speaker | portrait `href` = `/speakers/:id` clicked → profile | Playwright |
| Cards large enough to show speaker + venue | card contains speaker name, role, room and venue text | Playwright |
| Unreserve with confirmation | Remove → dialog; Cancel keeps card; Confirm removes card and API reservation gone | Playwright |
| No flicker on load | skeleton/placeholder has no layout shift: cards appear in one render, `agenda-card` rails start at scaleY 0 | Playwright |
| Animated rail in session colour | rail `data-accent`/colour matches session accent; animation present | Playwright |
| Hover effect | hover changes card transform/border | Playwright |
| Entire card clickable | click card body → `/sessions/:id` | Playwright |
| Matches reference | `npm run shot -- /my-agenda --like=<image> --user=1 --at=…` compared by eye | shot |

## Decisions
- The reference's hero is a Home-style bar; the ticket says Home must not change. Add the hero to My Agenda only — right?
- "Today" = the simulated clock's day (Day 1 outside the pinned clock), and finished sessions stay listed, as in the image — right?
- Rail colour: the session's track accent (`session.accent`), not the speaker's — right?
- Waitlisted sessions are not shown (not "reserved seat for") — right?
- Remove confirmation is an in-page dialog, not `window.confirm` — right?

## Out of scope
Reserving, check-in, rating, other days, Home changes.
