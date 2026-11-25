# Better home page: today's booked sessions
## What this changes
Home gains a "Your day" section listing every session the signed-in attendee holds a confirmed seat for on the current conference day (`clock.day`), earliest first. Each is a large card: title, time, room and venue, and the speaker's portrait linking to `/speakers/:id` with name and company. Each card has one action, **Remove seat**, which releases the seat and drops the card at once. Nothing else can be done from Home (no reserving, no check-in).

## Where
- `src/pages/HomePage.jsx` — new `TodaySessions` component (`data-testid="home-today"`, one `home-session-<id>` per card, `home-unreserve-<id>` button), inserted after `HeroBar`, wrapped in `<Reveal>`, returns `null` when empty. Fetch `api.getSchedule(currentUser.id)` (already in `src/lib/api.js`), take the `clock.day` entry, then filter through `reservationFor(s.id)?.status === 'confirmed'` from `useConference()` so the store, not the payload, decides (agenda.md "Building on it"). Unreserve calls `releaseSeat(s.id, s)` from the store. Speaker portrait: `Avatar` from `ui.jsx` with `imageUrl` inside a `Link`; venue/room via `venueById` / `roomById`.
- `tests/home.spec.js` — new describe for the section; add a lane `home.today` to `LANES` in `tests/helpers.js` (an attendee/day pair no other lane uses; check `tests/unit/lanes.test.js`), use `laneFor`, `visit(..., { at: momentOn(...) })`, `bookableFor`, `clearAgendaFor`/release in cleanup.
- `context/engineering-context/ui.md` (HomePage paragraph: no longer static; new ids) and `agenda.md` (getSchedule now has a UI); remove "Home is static" wording in `CLAUDE.md`.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| I can see all session I have booked for today (reserved seat for) | book two sessions on the lane day via API, open `/` pinned to that day; `home-session-<id>` visible for both and absent for a session on another day | Playwright spec (home.spec.js) |
| Each session listed should show the image of the speaker that allows us to click and see more about that speaker | card contains a link to `/speakers/<speakerId>` with the speaker's avatar image; click lands on that speaker page | Playwright spec |
| Each session should be on the larger side so speaker details and venue details can be presented | card shows room, venue name and speaker name/company text; card height is larger than a schedule row (bounding box assertion, desktop and mobile) | Playwright spec |
| You should be able to unreserve your seat on the session on the home page | click `home-unreserve-<id>`; card disappears and `GET /users/:id` reservations no longer holds the session | Playwright spec |
| Out of scope: only action is unreserve | the card has no reserve/check-in controls (only one button) | Playwright spec |

## Decisions
Waitlisted sessions: the ticket says "reserved seat for", so only confirmed seats are listed and waitlist places are not shown.
Sessions already finished today stay listed (the ticket says all booked for today) and keep Remove; the store drops Undo for ended sessions.
The existing test "nothing on it is personal or live" is amended: it keeps the ids it forbids, which the new section does not use.

## Out of scope
Reserving, check-in, rating, My Agenda, and any live "now/next" logic.
