# ORBIT '26 — conference companion app

A sample app for a workshop on using AI across the software delivery lifecycle.
Attendees fork this repo, turn requirements into GitHub Issues, and let an
engineering harness implement them. **Read this file before writing code here.**

## Deliberately unbuilt

The personal side of the app is left for workshop teams to build, so it is
blank on purpose — build it when a ticket asks, never as a side effect of
another change:

- **My Agenda** (`/my-agenda`) is a *coming soon* placeholder.
- **Home** is static: a hero, links into the app, the latest announcement and
  the sponsors. Nothing on it is about the signed-in attendee.
- **Following** works on the speaker pages, but nothing shows what you follow
  outside them — that, like your seats, is for My Agenda or Home to use.

Everything underneath is real and tested: seats, the waitlist, clashes,
check-in, ratings, follows, `/users/:id/schedule`, `/users/:id/today`, `/live`
and the `.ics` exports, each with a function in `src/lib/api.js`. A ticket that
only needs a page on top of one of those is small. (how: `context/engineering-context/agenda.md`)

## Run it

```bash
npm install
npm run dev      # seed, then API :3001 + web :5173
npm test         # unit + API, under a second — after every edit
npm run verify   # reseed + Playwright, desktop and mobile — before "done"
```

Every other command and flag: `context/engineering-context/testing.md`.

**Asked to open, try or show a feature in the browser**, run
`npm run show -- <issue | PR | branch>` — never a bare `npm run dev` or
`localhost:5173`, which serve whichever checkout started last, not the
branch being worked on. It finds that branch's worktree (or makes one),
starts the app on its lane and opens the page.

## Stack

Node 22 · Express · libsql (SQLite locally, Turso in production) · React 18 · Vite 6 · React Router 6 ·
Tailwind CSS v4 · Playwright. No state library, no ORM, no component library —
if you are reaching for one, you are probably solving the wrong problem.

## Start from the context docs

`context/` holds what the code cannot tell you, with an `index.md` in every
folder — read the index, then only the documents it points you to.
`product-context/` is who the app is for and why, `engineering-context/` is how
it is built, and `winnow-transcripts/` holds the conversations Winnow works from and a record of each.
`context/index.md` says what goes where.

This file says what was decided and why; `context/engineering-context/` says where it lives
and how it works — files, functions, payloads, test ids, the repo layout.
`node scripts/context.mjs index` lists one doc per area and when to read it;
`show <doc>` prints a doc's outline and `show <doc> Gotchas <part>` just those
parts — read by the piece, since whatever an agent reads it re-reads on every
turn after. They are read *instead of* the code, so a pull request that changes what a doc
describes updates it (`node scripts/context.mjs for <file…>` says which).

## Conventions

**The API boundary is camelCase.** Every snake_case → camelCase translation
happens in the `server/lib/query.js` mappers; a new column goes in its mapper —
React must never see `snake_case`.

**Components never call `fetch`.** A new endpoint is a route in the matching
`server/routes/*.js`, rows mapped with a `toX()` helper, and one function in
`src/lib/api.js`, which is the only caller of `fetch`.

## Area rules

UI and server conventions live in `.claude/rules/` and load when you open a file
in their area — `ui.md` for `src/`, `server.md` for `server/` — so an agent
working elsewhere does not carry them. **Reviewing a change?** Read the rule file
for each area the diff touches: reading a diff does not load them.

## There is exactly one action

Adding a session to your agenda **takes a seat**. There is no separate bookmark,
and there should not be one.

We originally copied AWS re:Invent and Google I/O, which split favouriting from
reserving. Both had to publish FAQ entries explaining the difference, and it
confused people here too. Most of the industry — Sched, EventMobi, and KubeCon
on top of Sched — uses a single action with capacity rules attached, so that is
what this app does.

- `reservations` is the only table. Adding moves `sessions.seats_taken` for
  *everybody*; a full room waitlists you instead; removing a confirmed seat
  promotes whoever has waited longest (skipping anyone who has since taken a seat
  in that slot). All transactional — `server/lib/seats.js`.
- **Hours are hours you hold a chair for.** Anything counting booked time —
  `scheduleFor`'s `totalMinutes` and whatever a page builds on it — counts
  confirmed seats only; queued time is totalled apart (`waitlistedMinutes`,
  `+Nh waitlisted`) rather than folded in or dropped. A waitlist place may never
  come good, so counting it as booked promises a fuller day than the room can give.
- The page is **My Agenda** (`/my-agenda`), which is what Whova, Cvent, EventMobi
  and AWS all call it. `/my-plan` redirects. It is a placeholder for now (above).
- The store (`useConference()`: `toggleSeat`, `reservationFor`, `onAgenda`) is
  the source of truth for your own reservation state — never fall back to the
  payload a page was fetched with, or "removed" stays unreachable until a refresh.

## The attendee chain

Four rules borrowed from real conferences; each writes state and gates the next:

1. **Add a session** → takes a seat, or a waitlist place. **You cannot hold two
   seats in overlapping slots** — the API returns 409 with the clashing session,
   and the UI offers a swap. Every real system blocks this rather than warning.
   Nor can you take a seat in a session that has already ended (also a 409).
2. **Check in** → opens 15 minutes before the session starts, closes when it
   ends. You cannot check in to something that has not happened.
3. **Rate it** → only if you checked in, only once it is over. One rating per
   person, editable. Ratings roll up onto `sessions.avg_rating` immediately.
4. **Export** → `/api/users/:id/agenda.ics` and `/api/sessions/:id.ics`.

A clash is a **choice, not an error**: the 409 carries both sessions and the UI
opens `<ConflictDialog>` side by side with Keep / Swap. Do not demote that to a
toast — a toast disappears while the decision is still open.

The rules run in transactions in `seats.js` and `attendance.js`, taking the
clock from the *client*, because conference time is simulated. (how:
`context/engineering-context/seats.md`, `attendance.md`)

### Writing tests against this

That state is real, and Playwright tests all run concurrently. Give each
**test, per project,** its own attendee and day (a data lane), release what you
book, and never reuse an attended session — a check-in cannot be undone. (how:
`context/engineering-context/testing.md`)

## The conference clock

**Day 1 is the day you seed** (`ORBIT_START_DATE` overrides it), and its
morning, to 12:15, has already been attended — the only seeded check-ins and
ratings. Tests ask the API for the dates (`conferenceDays()`), never hard-code them.

"Now" is simulated: the viewer's real time of day projected onto Day 1, ticking
every 30 seconds, clamped to a lively mid-morning outside 08:00–22:30. Read it
from `useConference().clock` (`{ day, time }`) — never `new Date()` in a
component. Pin it with `?at=YYYY-MM-DDTHH:MM`; a value without the time part is
ignored. **Any test that touches live state must pin the clock**, otherwise it
passes or fails depending on the hour it runs. (how: `context/engineering-context/clock.md`)

## Nothing may claim to be true when it is not

The seed generates a *live* conference, so anything that implies elapsed time
has to be earned:

- **Ratings and reviews only exist for sessions that have already finished.**
  Seeding a 4.5 onto a talk three days away was the clearest possible tell that
  the data was fake, and it poisoned the "highest rated" ranking. The seed only
  rates Day 1 morning sessions, and only from attendees it checked in, by the
  same rules as the API; `speakers.avg_rating` is derived from those session
  ratings, never invented.
- **Never hard-code a date, month or weekday.** Day 1 moves with the seed, so
  the footer, announcements and body copy all derive from `conference.dates`
  and `days[n]`. A footer reading "Oct 12–15" under a September hero is the
  fastest way to lose an attendee's trust.
- **No invented external links.** Speaker socials show the handle but do not
  link, and sponsor websites are not shown, because the domains do not exist.

## Verifying a change

Three layers, fastest first: `npm test`, `npm run verify` (the gate for
"done"), `npm run shot` if visual. **If a rule can be proven without a browser,
prove it without one** — an agent can afford `npm test` after every edit, not
Playwright. Pure functions → unit; rules needing the database → API; what the
attendee sees → spec. (how: `context/engineering-context/testing.md`)

**Claim a lane before you run anything** in a worktree
(`eval "$(node scripts/lane.mjs claim 42)"`). Without one, Playwright reuses any
app on the web port — another worktree's — and your specs pass against the
*other* branch's code. CI — the factory's `verify` workflow — runs the same gate in a sandbox.

## Where work is tracked

**Tickets are GitHub Issues of `jonasingvar/nam-2026-conference`** — this
repository, never the workshop's original (`EqualExperts/nam-2026-conference`),
which nothing here writes to: the factory refuses any other repository, and its
sandboxes' network answers anything under `EqualExperts/` with a 403.

Reach issues with the authenticated `gh` CLI (`gh issue list`, `gh issue view 42`),
a GitHub MCP server or the REST API; none is preferred. To confirm access, probe
read-only — never create a test ticket to find out.

Labels, the webhook and the commit statuses: `context/engineering-context/harness/github.md`.

## Data model

Four days from the day you seed, ~140 sessions, 110 speakers, **two venues 6.2
miles apart**, no authentication. Schema: `context/engineering-context/data-model.md`; the seeded
attendees: `context/engineering-context/seed.md`.

## Where it runs

**Everything runs on Vercel.** The app: project `nam-2026-conference`, `main` →
production (https://nam-2026-conference.vercel.app, Turso), every branch → a
preview whose function instances each seed their own SQLite file — so on a
preview, a seat taken can be missing on a request another instance serves;
"moves `seats_taken` for everybody" holds in production, not across a
preview's instances. The factory: project `nam-2026-factory`
(`factory/`), whose Vercel Workflows build, check and review this repository in
Vercel Sandboxes. There are no GitHub Actions. (how:
`context/engineering-context/architecture.md` § On Vercel, `context/engineering-context/harness.md`)

## What happens to a ticket

1. **Ship** — the `ready-for-ai` label, or `/ship` / `@claude` on the issue,
   starts the factory's `ship` workflow. Jev sizes it (`fast`, `small`, `full`;
   a `ship:fast` / `ship:full` label or `--fast`/`--small`/`--full` in the
   comment is a person's call and wins), a sandbox forks the warm one, and every
   phase is a fresh agent: spec (the first commit) → failing test → change →
   gate ⇄ independent audit with a skeptic on every blocker → pull request. No
   pull request until the gate is green and no blocker survives; one that will
   not converge — or meets a failure that is also on the base — goes to a
   person as a **draft** labelled `needs-human`. Progress is one comment on the
   issue; every step is in the factory's Workflows tab.
2. **Preview** — Vercel builds the pull request; the run waits for it.
3. **Review and QA** — two more workflows, in parallel: review reads the diff
   with lenses picked by what it touches; QA probes the gaps the PR's own tests
   leave, **on its preview**, desktop and mobile. Each posts a verdict with a
   **confidence** meaning coverage, not feeling, and a commit status; a low one
   reads *unproven*. A plain comment on the PR or on its ticket asks for a change or an
   answer — Jev tells a request from a remark (`/fix …` says so outright); `/review` asks again.
4. **A human merges.** Nothing is a required check. The ship run, asleep since
   the pull request opened, wakes on the merge, waits for production, and checks
   `/api/health` before it calls the issue done.

**Asked in a chat to ship an issue**, do not build it here: label it
`ready-for-ai`, or comment `/ship` on it (`gh issue comment <n> --body "/ship"`),
and give the person the issue link — the factory takes it from there.

## Every change starts with a spec

`specs/<issue>-<slug>.md`, written before the code and pushed as the first
commit on the branch. A reviewer reads the intent before the diff, and a
misreading of the ticket surfaces while it is still cheap.

They are kept: `specs/` records how the code got this way — what each change
was for, what the ticket left open, and what was deliberately left undone.

## Commits

**Conventional Commits.** `type(scope): subject` — the subject in the
imperative, lower case, no full stop, under about 70 characters.

```
fix(seats): release a waitlist place when the seat ahead is dropped
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`. The scope is optional and names the area, not the file.

The subject says what changed; **the body says why.** A diff already shows
what you did, so a body that restates it earns nothing — the reason, the
alternative you rejected, and the thing that will look wrong to whoever reads
this in six months are what is worth writing down. Skip the body when the
subject genuinely covers it.

## House rules

- Good engineering, no over-engineering. Match the surrounding code.
- Prefer editing an existing file over adding a new abstraction layer.
- Keep `seed.js` deterministic — it seeds its own PRNG so everyone's database is
  identical apart from the dates. Never use `Math.random()` there.
- Do not commit `data/orbit.db`, `.screenshots/`, or Playwright artefacts.
- Do not introduce a state management library, an ORM, or a UI kit.
- **Merge, never rebase, a pushed branch, and never force-push.** To bring a
  branch up to date, `git merge origin/main` into it, resolve, commit and push
  — ship does exactly this before every gate. A rebase rewrites what is already
  pushed and needs `--force-with-lease`, which the permission check may refuse
  one time and allow the next.
- **Merging a pull request is the person's click.** Asked to merge, give the
  link and the button (*open #8 and click **Squash and merge***), not
  `gh pr merge` — the merge is the review, and the permission check does not
  allow it reliably. Anything else the check blocks: say in one sentence what
  was blocked and hand the person the exact step; do not retry it or route
  around it.
