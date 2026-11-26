# Better My Agenda
## What this changes
`/my-agenda` is a "Coming soon" placeholder. It becomes "Your day": a list of large session cards, one per **confirmed** seat the signed-in attendee holds on the conference's current day (`useConference().clock.day`), in time order. Home is not touched.

## The reference
Image (`reference-1.png`) is the Home page of another build; only the "Your day" section is the design for My Agenda (the nav, "Today · Day 1 · 2:26 PM" hero and the date panel are NOT built — Home/header stay as they are).
- Section heading "Your day" (display font, ~20px, left) and, right on the same line, the day's date in small uppercase mono muted text ("WEDNESDAY, NOV 25") — derived from the day, never hard-coded.
- Below, a single full-width column of panels, one per session, ~12px gap, rounded ~12px corners, 1px hairline border, dark surface, no shadow.
- Each panel is ~175px+ tall with a 3–4px full-height vertical rail on its left edge, rounded with the panel; colour differs per card (violet for Foundation Models, red/pink for Responsible AI) = the session's track/topic accent.
- Left of panel body: speaker portraits, circular ~96px, stacked vertically (one per speaker; two speakers = two stacked portraits, so the panel grows taller).
- Right of the portraits, top to bottom: a mono, uppercase, small muted meta line "8:00 AM – 8:45 AM · FOUNDATION MODELS · FINISHED" (time range muted; track name in the rail's accent colour; status — here "Finished" — muted); the title (~20px, medium weight, light); speaker names comma-separated (~14px, lighter); the first speaker's "Role · Company" (~12px, muted); at the bottom, room and venue "Nebula Main Stage · Aurora" (~12px, muted).
- Bottom-right of each panel: a small outlined "Remove" button, red/rose text with an × icon, rose-tinted dark fill and rose border, rounded ~6px.
- NOT there: no reserve/add action, no rating/check-in, no filters, no second button, no totals.

## Where
- `src/pages/MyAgendaPage.jsx` — replace the placeholder: fetch `getSchedule(currentUserId)` (`src/lib/api.js`), keep sessions where `day === clock.day` and `reservation`/status is `confirmed`, sort by `startsAt`; render cards; remove the `agenda-coming-soon` panel. Build the card as a local component (or `src/components/AgendaCard.jsx`). Whole card is a `<Link>` to `/sessions/:id`; portraits are a separate `<Link>` to `/speakers/:id` (no nested anchors — overlay-link pattern); Remove is a button outside the link's click path with `stopPropagation`.
- Remove opens a small confirm dialog (Keep / Remove, `role="dialog"`) rather than acting at once; on confirm call `releaseSeat` from the store (`useConference()` — `releaseSeat`/`toggleSeat`, never `fetch`), and drop the card from the list from store state (`reservationFor`), not the fetched payload.
- Load without flicker: render a fixed-height skeleton list until data and `clock` are ready, then reveal all cards at once (no per-element pop-in); portraits `GeneratedAvatar` fallback with fixed size.
- Rail animation in `src/index.css` — a `scaleY` 0→1 keyframe (`transform-origin: top`) on the rail, colour from `accent(session.track accent)` in `src/lib/accents.js`; honour `prefers-reduced-motion`. Card hover: lift, border/rail glow in the accent colour, portrait scale. Check `Reveal.jsx`/existing motion utilities in `context/engineering-context/ui.md` first.
- Update `context/engineering-context/agenda.md` and the "Deliberately unbuilt" line in `CLAUDE.md` (My Agenda no longer a placeholder); `tests/smoke.spec.js` My Agenda heading still `/agenda$/i`-compatible or updated.
- Tests: new `tests/my-agenda.spec.js` using a new lane `my-agenda` in `LANES` (`tests/helpers.js`, check `tests/unit/lanes.test.js`), `laneFor`, `bookableFor`, `momentOn(0, …)` to pin the clock via `visit(page, '/my-agenda', { as, at })`; seats are released after.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| I can see all session I have booked for today (reserved seat for) | spec: book two sessions today + one on another day + one waitlisted via API; page lists exactly the two confirmed ones, time-ordered | Playwright (`my-agenda.spec.js`) |
| Each session shows speaker image, clickable to the speaker | spec: portrait link `href` = `/speakers/:id`, click navigates | Playwright |
| Sessions are large enough for speaker and venue details | spec: card shows title, speaker name/role/company, room and venue; card height ≥ 150px | Playwright |
| Unreserve on the page | spec: Remove → confirm → card gone, `GET /users/:id` shows no reservation | Playwright |
| No flicker on load | spec: skeleton shown, then cards appear together; no layout shift of the list after first card render (heights stable between two samples) | Playwright |
| Rail animates top to bottom, coloured by the session | spec: rail element has the accent colour of the session's track and animation `scaleY`; `--like` screenshot compare | Playwright + `npm run shot -- /my-agenda --like=…` |
| Hover effect | spec: hover changes the card's transform/border-colour | Playwright |
| Entire card clickable | spec: click on card body (title area) navigates to `/sessions/:id` | Playwright |
| Remove has a confirmation | spec: Remove alone does not release; Keep leaves the seat | Playwright |

## Decisions
- "Today" is the simulated conference day from the clock (`clock.day`), not the real date — is that right?
- Does "Finished" status also show for sessions still ahead (as "Upcoming"/"Live now") using the clock, with the same meta-line style as the reference?
- Should a finished session's seat still be removable (the image shows Remove on finished sessions)? The release API allows it; assumed yes, per the image.
- The reference's Home hero and nav are out of scope (ticket: "home should not be touched") — confirm only the "Your day" list is built?
- Rail colour: the session's track accent (violet = Foundation Models, red = Responsible AI) — the ticket was unsure what the colour encodes; confirm?

## Out of scope
Reserving or any other action from this page; Home, its hero or nav; waitlisted sessions (not shown — they hold no chair).
