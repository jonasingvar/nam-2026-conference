# Better My Agenda

## What this changes
`/my-agenda` is a "Coming soon" placeholder. It becomes the attendee's day, built as the reference image draws it: the "Today" hero bar (Day N · clock time, weekday, conference dates and city), then **Your day** with the weekday on the right, and one large full-width card per **confirmed** seat on `clock.day`, in time order. Each card has a left accent line, a column of round speaker portraits (each links to `/speakers/:id`), a mono line `time – time · TRACK · FINISHED|LIVE|…`, the title (links to the session), speaker names, the first speaker's role · company, `room · venue` at the bottom, and a **Remove** button (the only action) at the bottom right. Removing gives the seat back through the store (toast with Undo as elsewhere). Home is untouched.

## The reference
- Header/nav are the app's own. Page body below it, top to bottom:
- Hero panel: rounded bordered dark panel, full width. Small cyan dot + mono caps "TODAY"; big display "Day 1 · 2:26 PM" (the dot between is muted); beneath it muted "Wednesday, Nov 25". Right-aligned and bottom-aligned: bold "November 25–28, 2026" over small mono caps "LAS VEGAS, NV". Faint violet glow top-left.
- Section header row: "Your day" (display, ~20px) left; right mono caps muted "WEDNESDAY, NOV 25".
- Stack of cards, ~12px apart, each a full-width rounded panel (`bg-surface`, hairline border) with a ~4px accent bar down its left edge, rounded with the card. Card 1 bar violet, cards 2–3 rose: the colour is the **track** colour.
- Inside a card: left, a column of 96px circular portraits (one per speaker, stacked vertically, ~8px gap), so a two-speaker card is taller. Right of it: mono caps line "8:00 AM – 8:45 AM · FOUNDATION MODELS · FINISHED" (time muted, track name in the track colour, status muted); title in display ~20px semibold; speaker names comma-separated (muted-light, 14px); under it a smaller muted "Senior Research Engineer · Aperture Media" (first speaker); at the bottom-left of the card, small muted "Nebula Main Stage · Aurora" (room · venue short name). Bottom-right: a small outlined rose "× Remove" button on a dark rose tint.
- Absent: no stats, no clashes, no suggestions, no export, no check-in/rating controls, no reserve or any other action.

## Follow-up (PR review)
The whole card is a link to the session (stretched title link; portraits and Remove sit above it). Remove on a session that has ended asks "Give up this seat?" inline (Yes, remove / Keep) because a finished session cannot be re-booked, so Undo is impossible; other sessions remove at once with the toast's Undo.

## Where
- `src/pages/MyAgendaPage.jsx` — replace the placeholder. Fetch `getSchedule(currentUser.id)` with `useFetch`; take the entry for `clock.day`; filter its sessions through the store's `reservationFor(s.id) === 'confirmed'` (never the payload, so a removed card leaves at once); render nothing but a skeleton of fixed-height cards until data is in (no pop-in), then an empty state with a link to `/schedule` when none. Drive from `clock.day`, never `days[0]`. Hero reuses the `HeroBar` look from `HomePage.jsx` (extract nothing Home depends on changing; copy or share without altering Home's output). `useDocumentTitle('My Agenda')`.
- `src/components/AgendaSessionCard.jsx` (new, or inline) — the card above. Portraits via `Avatar` (`imageUrl`, wrapped in `<Link to=/speakers/:id aria-label=name>`), accent from `accent(session.track.color)`; Remove calls `useConference().toggleSeat(id, session)` (→ `releaseSeat`, Undo toast). Status from `hasEnded`/clock helpers in `src/lib/clock.js`.
- `src/index.css` — `animate-line-grow` (accent bar `scaleY(0→1)`, `transform-origin: top`, ~0.9s, staggered by `--i`), a hover lift/glow/portrait-zoom effect on the card; both under the existing `prefers-reduced-motion` block so nothing stays hidden.
- `tests/agenda.spec.js` (new) using a new `LANES['agenda.page']` entry in `tests/helpers.js` (own attendee+day per project; `visit(page, '/my-agenda', { as, at: momentOn(0,'14:00') })`, `bookableFor`, release in `finally`).
- `tests/home.spec.js` lines ~58 and ~62 — the `agenda-coming-soon` assertions become assertions on the new page (`agenda-day`); `tests/unit/gate.test.js` only uses that id as fixture text, leave it.
- `context/engineering-context/agenda.md` — placeholder section becomes a description of the page (`node scripts/context.mjs for src/pages/MyAgendaPage.jsx`); `.claude/rules/ui.md` and `CLAUDE.md` "Deliberately unbuilt" drop My Agenda.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Booked sessions for today are listed (confirmed seats only, time order, not other days, not waitlisted) | `agenda.spec.js`: book two sessions on the lane day + pin clock; cards `agenda-session-<id>` present in order; waitlisted/other-day absent | Playwright |
| Each card shows speaker portraits that link to the speaker page | same spec: `agenda-speaker-<sid>` is an `img` link with href `/speakers/<sid>`; click lands on profile | Playwright |
| Cards are large and carry speaker role/company and room · venue | spec asserts card text contains company and `room · venue`, and box height ≥ 160px (desktop) | Playwright |
| Remove gives the seat back on this page | spec: click `agenda-remove-<id>`; card disappears without reload; `GET /users/:id` no longer lists it; nav count drops | Playwright |
| No load flicker | spec: skeleton `agenda-loading` shows then is replaced; no card ever detaches/reorders after first paint (cards count never decreases while loading; no layout-shift of hero) | Playwright |
| Accent line animates top→bottom in track colour | spec: `agenda-line-<id>` has class for the track accent and a running `animation-name` `line-grow`; with reduced motion it is fully scaled | Playwright |
| Hover effect | spec: hover card → computed `transform` differs from none | Playwright |
| Reserve not possible / Home untouched | spec: page has no "Add"/"Reserve" control; `home.spec.js` unchanged assertions for Home still pass | Playwright |
| Matches the reference | `npm run shot -- /my-agenda --user=1 --at=…` compared with reference | manual |

All are false on main (placeholder page, no cards).

## Decisions
- Does the reference's hero ("Today · Day N · time", dates, city) belong on My Agenda too, as drawn, rather than only the "Your day" list? (Planned: yes — the image is the design.)
- Should waitlisted sessions be left off the page (only seats you hold a chair for)? (Planned: yes, the ticket says "reserved seat for".)
- Should sessions already finished today stay listed, labelled FINISHED, as in the reference? (Planned: yes.)
- Is the left line coloured by track colour (the reference shows violet for Foundation Models, rose for Responsible AI) rather than the speaker's accent? (Planned: yes.)
- When the speaker count is high, should the portrait column cap at 3 with "+N"? (Planned: no — show all, as the reference stacks them.)

## Out of scope
Reserving, check-in, rating, clashes, suggestions, export, other days, and any change to Home.
