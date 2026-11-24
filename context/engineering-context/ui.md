---
area: ui
summary: The shared look and chrome — design tokens, primitives in ui.jsx, icons, accents, toasts, generated art, motion utilities, the header/nav/footer, the attendee switcher, the static home page and the not-found page.
read_when: adding a component or page, styling anything, touching the home page, the nav or footer, the attendee switcher, icons, toasts, generated avatars or covers, animation, formatting times/dates/plurals
files:
  - src/index.css
  - src/lib/accents.js
  - src/lib/format.js
  - src/lib/useDocumentTitle.js
  - src/lib/useInView.js
  - src/lib/useMediaQuery.js
  - src/components/ui.jsx
  - src/components/Layout.jsx
  - src/components/Icon.jsx
  - src/components/Toaster.jsx
  - src/components/Reveal.jsx
  - src/components/CountUp.jsx
  - src/components/GeneratedAvatar.jsx
  - src/components/GeneratedCover.jsx
  - src/components/HeroMedia.jsx
  - src/components/UserSwitcher.jsx
  - src/components/RouteChange.jsx
  - src/pages/HomePage.jsx
  - src/pages/NotFoundPage.jsx
  - src/pages/PresentationPage.jsx
  - src/pages/ProductPresentationPage.jsx
  - src/components/presentation/
  - src/lib/presentation.js
tests:
  - tests/unit/format.test.js
  - tests/unit/presentation.test.js
  - tests/smoke.spec.js
  - tests/home.spec.js
  - tests/switcher.spec.js
  - tests/presentation.spec.js
related: [architecture, speakers, venues, schedule, testing]
---

# UI

## How it works

**Tokens — `src/index.css` `@theme`.** Colours: `ground`, `surface`, `raised`,
`overlay` (the elevation ladder, see CLAUDE.md), `hairline` (borders), `ink`,
`muted`, `faint` (text, strongest → weakest). Fonts: `font-sans` (Inter),
`font-display` (Space Grotesk; `.font-display` also sets weight 700 and tight
tracking), `font-mono`. `--radius-card`. Custom utilities: `card` (surface +
hairline border + card radius — the module panel), `glass` (blurred translucent,
used by the header, toasts, menus), `hide-scrollbar`. Dark only
(`color-scheme: dark`). In SVG use `var(--color-ground)` etc.

**Motion utilities** (all in `index.css`, all neutralised by the
`prefers-reduced-motion` block at the bottom, which also forces `.reveal`
visible): `animate-rise` (dialogs, menus, toasts), `stagger` (list entrance; children
delay by `--i` × 40ms — set `style={{ '--i': i }}`, capped by callers at ~12),
`animate-pulse-dot` (live indicators), `animate-ken-burns`, `animate-slide-in`,
`animate-fade-zoom` and `animate-fill` (the speaker spotlight and its autoplay progress;
duration set inline), `reveal` (scroll-triggered, + `data-visible="true"`),
`animate-marquee` (sponsor logos).
JS-driven motion (`SpeakerSpotlight`, `HeroMedia`, `CountUp`) checks
`matchMedia('(prefers-reduced-motion: reduce)')` itself.

**`src/lib/accents.js`.** `ACCENTS[name]` → `{ chip, dot, ring, grad, text,
glow }` class strings for `violet cyan emerald amber orange rose fuchsia sky
lime teal`. `accent(name)` (unknown → violet). `ACCENT_HEX` / `accentHex(name)`
→ `[light, dark]` hex for SVG. `accentFor(label)` hashes any string to a stable
accent name (used for cuisines). A new colour needs a row in both maps.

**`src/lib/format.js`.** `time('14:05')` → `2:05 PM`; `timeRange(a, b)`;
`dayLabel(iso)` → `Tuesday, Sep 22`; `shortDay(iso)` → `Tue`;
`relativeDate(iso, clock)` → `12m ago` / `3h ago` / `Sep 22`, measured against
the conference clock, not the browser; `plural(n, one, many?)` → `"3 sessions"`;
`agendaSummary(total, bookedOnDay, dayPhrase)` → `"session · 2 today"` /
`"sessions · 2 on Day 1"`, the schedule rail's pluralised agenda line (the
caller builds `dayPhrase`).
Dates are parsed at `T12:00:00Z` with `timeZone: 'UTC'` so they never shift.

**`src/components/ui.jsx` exports:**

| Export | Props |
| --- | --- |
| `cx(...parts)` | joins truthy class strings |
| `Avatar` | `name, initials, accent, size (xs sm md lg xl), imageUrl, className, ring=true, mono=false` — photo if `imageUrl`, else `GeneratedAvatar`, else (`mono` or no name) initials on `accent.grad` |
| `Chip` | `accent?, className, as='span', ...rest` |
| `TrackPill` | `track` (uses `track.color`, `track.name`) |
| `Button` | `variant (primary ghost subtle danger; default ghost), size (sm md lg), to` → `Link`, `href` → `a`, else `button`; `as` overrides |
| `SeatButton` | `status (null confirmed waitlisted), onClick, size (sm md), title, ended` — the one agenda action; stops propagation and sits at `z-10` above card link overlays; `ended` without a `status` disables it as "Session ended" |
| `Rating` | `value, count, showValue` — "Not yet rated" when `count` is 0 |
| `SectionHeader` | `eyebrow, title, description, action, className` — renders an `h2` |
| `Spinner`, `Skeleton` | `className` |
| `EmptyState` | `icon='search', title, description, action` |
| `ErrorState` | `error, onRetry` — an `EmptyState` titled "That did not load" |
| `NotFoundState` | `title, backTo, backLabel` — an `EmptyState` with a link back instead of a retry button, for a 404 that can never succeed on retry (`SessionPage`, `SpeakerPage`) |
| `Stat` | `value` (numbers animate via `CountUp`), `label, accent, testId, note?` — `note` is a quieter line under the label, for a caveat on the number (e.g. `+Nh waitlisted` beside booked hours). No page renders one yet |

**`Icon.jsx`.** `Icon({ name, className='size-5', filled, ...rest })` — stroke
icons, `aria-hidden`; an unknown name renders **nothing** (no error). Names:
`calendar users star pin food sparkle search clock chevronRight chevronLeft
chevronDown close menu check play external building car alert info mic layers
filter ticket globe wifi bookmark grid arrowRight heart bell live route`.
`BrandIcon({ name })`: `x github linkedin` (filled). Add a name = add a 24×24
path to `paths`.

**`Toaster.jsx`.** `<Toaster>` wraps everything in `main.jsx` (outside
`ConferenceProvider`, so the store can toast). `useToast()` returns
`toast({ message, icon='check', action?: { label, onClick }, duration })`;
default 4s, 10s when there is an action; keeps the newest 3. Container is
`data-testid="toaster"`, `role="status"`.

**Generated art.** `GeneratedAvatar({ name })` — SVG face hashed from the name
(12 palettes); only used through `Avatar`. `GeneratedCover({ seed, accent,
variant, className })` — FNV hash of `seed` (same seed, same art on every machine,
which keeps screenshots and tests stable), colours from `accentHex(accent)`;
variants `orbit` (default; keynote cards, session heroes), `mesh` (vendor tiles, the
spotlight backdrop), `strata` (wide banners), `mark` (sponsor logos). SVG ids derive from the hash, so two covers with the same seed on one
page share gradient ids (harmless — same art).

**Hooks and small components.** `useDocumentTitle(title)` → `"<title> · ORBIT '26"`,
falsy leaves the tab alone. `useInView({ threshold, rootMargin })` → `[ref,
visible]`, flips once. `useMediaQuery(q)` → boolean (`SchedulePage`'s grid/list
default). `Reveal({ as, delay })` = `useInView` + `reveal`. `CountUp({ value,
duration })` counts once visible. `HeroMedia` (home hero only) probes
`/images/hero-1..6.jpg`, cross-fades those that load, renders nothing if none.

**`Layout.jsx`** — the route shell (`<Route element={<Layout />}>` in
`App.jsx`). Renders `<RouteChange />`, the global `<ConflictDialog>` (wired to
`conflict` / `resolveConflict` from the store), a skip link to `#main`, the
sticky `glass` header, `<main id="main">`, and the footer.

- `NAV` array (`to, label, icon, end`) drives both the desktop nav (`lg+`,
  `aria-label="Main"`) and the mobile menu (`aria-label="Mobile"`, toggled by
  the "Open menu"/"Close menu" button, closes on navigation, locks body scroll).
  `/my-agenda` shows `reservations.size` as a badge.
- Footer: three `nav` columns (Programme, On site, Conference) built from an
  inline array of `[label, to]`, plus `conference.dates · conference.city` from
  bootstrap and a plain `<a href="/api/bootstrap">`.
- `UserSwitcher` sits in the header once `ready`: a `listbox` of the
  `useConference().users` whose company is `HOST_COMPANY` (Equal Experts: Jonas,
  Andy, Abraham), plus the selected attendee if it is someone else (tests pick
  Kenji, Sofia or Marcus through localStorage, and they must be able to switch
  back). `/bootstrap` still returns all six. Calls `setCurrentUserId`; closes on outside pointer
  or Escape. Under the list, "Workshop talks" (`data-testid="talk-links"`, the
  `TALKS` array) links to both decks, so they are one click from every page
  without taking header space. Each row shows "N on agenda"; every row but the signed-in
  attendee's reads `u.reservedCount` from `/bootstrap` (frozen at load), but
  the active row counts `'confirmed'` entries in `useConference().reservations`
  instead, since that's the only attendee the store keeps reservation state
  for live — so booking or releasing a seat updates your own row without a
  reload, while everyone else's stays as `/bootstrap` had it.
  When `currentUser.isSpeaker`, a `Your speaker profile` link
  (`own-speaker-profile`) sits between the list and the talk links and opens
  `/speakers/<currentUser.speakerId>`, which marks itself "This is you"
  (speakers doc). `tests/switcher.spec.js` covers the switcher and that link.

**`HomePage`** (`/`) — static: nothing on it is about the signed-in attendee or
what is live. It stacks `HeroBar` (`hero`: name, `conference.dates · city`, a
`Day n · time` chip from `clock`, and `Browse today` → `/schedule?day=<clock.day>`
plus `Speakers` buttons) → `QuickLinks` (`quick-links`, a `nav` of the `LINKS`
array: Schedule, Speakers, Venues, Food & drink, Expo) → `LatestAnnouncement`
(`announcements`: the single newest posted one, pinned first, filtered by
`postedAt <= clock`, so nothing appears before it was written) →
`SponsorMarquee` (venues doc). Sections that return `null` would leave their
`<Reveal>` wrapper as a gap, so the container has `[&>:empty]:hidden`.
`tests/home.spec.js` asserts the five links, the announcement cut-off, and that
none of `today-panel`, `live-now`, `speaking-strip`, `followed-sessions`, `next-up`
is on the page — no component renders those ids; a ticket that puts a personal or
live section on Home updates that test. A new home section is a component that
returns `null` when empty, wrapped in `<Reveal>`.

**`RouteChange`** — on `pathname` change only (not search), scrolls to top and
focuses `#main`. **`NotFoundPage`** — the `*` route; its heading "Nothing
scheduled here".

**`/product-presentation` and `/engineering-presentation`** — two talks, the
product harness (a conversation → a ticket) then *The software factory* (the
engineering harness as it runs today: the ticket → production, on Vercel), part
of the app so anyone with the URL can give or watch them. The routes **outside
`<Layout>`**: full screen, no header or footer, so the smoke suite (which
expects a banner and footer) does not list them; `tests/presentation.spec.js`
covers them instead. Both pages are a `components/presentation/Deck.jsx`, which
holds one flat beat index in `?beat=` (1-based, matching the counter;
`src/lib/presentation.js` parses, clamps and maps keys — →/Space/Enter/PageDown
on, ←/PageUp/Backspace back, Home/End, F full screen) and draws a fixed
1600×900 stage scaled to the window. `Deck`'s `next` is the talk that follows:
one press past the last beat navigates there — with `next.delay` the current
scene is first told it is `leaving` (and the stars warp) so a hand-off can
play, except under reduced motion, which navigates at once; a scene also gets
`advance`, so a button on the stage can be the clicker. The product deck hands
over with a button whose name is "Continue to the engineering harness"; the
engineering deck has no `next`.

A chapter is `{ id, name, accent, tone, beats, Scene, enter? }` — one caption
per beat (`null` for none) and a `Scene({ step, leaving, advance })` laid out
in stage pixels. A beat with `hero: true` is a title slide: `Deck`'s caption is
set large mid-stage and the scene only decorates beside it. The chapters either
side of the current one stay mounted so they can fly in and out; a scene
re-mounts each time it becomes current, so its entrance replays. `enter: 'cut'`
swaps the fly-through for a crossfade, for a chapter that continues the scene
before it.

**The engineering talk** (`components/presentation/chapters.js`) is four files.
Its spine is one ship run: after a short opening the rail of the run's eleven
phases stays on screen to the end of the walkthrough, the #140 ticket riding it,
so the room always knows where it is — and each Vercel piece is taught at the
station where it happens, not in a chapter of its own.

- `opening.jsx` — the title (`Orbits`, the seven workflows around the Vercel
  mark, reused behind the closing line), the promise (one label, Vercel picks
  the ticket up, and everything that then happens without you) and the ticket
  with its context docs.
- `platform.jsx` — the factory floor (the map of both projects, the seven
  workflows) as a chapter, and the panels the rail shows: `Switchboard` (the
  webhook), `Sizing` and `Ladder` (Jev, AI Gateway), `Fork` and `Network`
  (Vercel Sandbox), `Durable` and `Asleep` (Vercel Workflows), `Climb`. Each is
  laid out for the rail's 1440×460 panel. `Wf` is a workflow chip.
- `ship.jsx` — the rail. `STOPS` is one entry per beat: the station the ticket
  is at and the panel shown under it (`PANEL`); `LINE_BEATS` is its caption, in
  the same order. The first stop frames it — a ticket goes in, a feature comes
  out — and Production closes it with the feature live. `SHIP` cuts the one
  `LineScene` into a chapter per stretch of the rail (`stretch`), joined by
  `cut`, so the chrome names the station. Plan audit shows as skipped: #140 is
  a small ticket. Needs-human is two stops at Audit.
- `closing.jsx` — on the record (the progress comment's Models table, the
  `/runs` page) and what it costs, ten tickets at once, your role and the
  closing line.

`kit.jsx` has the primitives both talks share (`Show`, `Replay`, `Token` — the
#140 ticket — `Flip`, `Terminal`, `Model` and `MODELS`, the factory's ladder,
`Vercel`, the mark, `box`…); `apps.jsx` draws GitHub, light, as the room sees
it; `Backdrop.jsx` the starfield and aurora. The engineering talk renders
ticket #140 from one constant, `presentation/issue.js` (`ISSUE_140`: title,
why, what, doneWhen, outOfScope).

**The product talk** (`presentation/product/chapters.js`): the workflow first
(`workflow.jsx`: the project context, the two-fold trick, context versus the
task tracker, a chapter slide, the three skills as one possibility), then the
winnow skills built from the bottom (create-tasks, update-context, winnow over
both), the whole flow and the demo, the hand-off. `product/kit.jsx` has its own
primitives (the hosts' faces, `Wave`, `Versus` — by hand against with the
skill — `SkillHead`, a skill's name set large, and the three-step `StepRail`).
It states only what the winnow skills really do (`.claude/skills/winnow`,
`create-tasks`, `update-context`): the bucket names and the ticket shape are
theirs. `listen-to-meeting` is deliberately not in the talk. It keeps its own
copy of the ticket (`product/winnow.jsx`: WhereScene and the Distil buckets),
so a change to the #140 text is made in both.

It is the only place that uses **Motion** (`motion/react`) — springs, the
chapter fly-through, the camera zoom. Inside a beat, sequences are the `pz-*`
keyframes in `index.css`. The page wraps itself in `<MotionConfig
reducedMotion="user">`, and every `pz-*` keyframe ends on its final frame, so
with reduced motion each beat still shows everything it should.

### Dialogs

`ConflictDialog.jsx` is the pattern; a new modal copies its shape rather than
working it out again — three ship runs of #219 each spent minutes rediscovering
it by trial and error.

- **Render it with `createPortal(…, document.body)`** when it is opened from
  anywhere inside the header (the attendee menu, nav): the header is `glass`
  (a backdrop filter), which makes it the containing block for `fixed`
  children, so an unportalled `fixed inset-0` covers the header, not the page.
- **Shape:** an outer `div` — `fixed inset-0 z-[70] grid place-items-end
  sm:place-items-center`, `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` its heading, a `data-testid` — holding first a full-screen
  backdrop `<button type="button" aria-label="Close" className="absolute
  inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />`, then the panel
  (`relative`, `tabIndex={-1}`, focused on open). A click outside lands on that
  button, so there is no event-target arithmetic.
- **On a phone it is a bottom sheet.** Cap the panel — `max-h-[85dvh]` with
  its body `overflow-y-auto` and the actions outside the scroll — so the Save
  button stays on screen and the top of the screen stays backdrop: a sheet that
  grows to the full height leaves nowhere to click outside it.
- **Escape and focus** in one effect keyed on open: remember
  `document.activeElement`, focus the panel, add a `keydown` listener for
  `Escape`, set `body.style.overflow = 'hidden'`; undo all four on close. Read
  the close handler through a ref so the effect does not re-run on each render.
- **Closing without saving is the default.** Cancel, Escape and the backdrop
  all call the same `onCancel`; only the primary button writes.

How to test one: `context/engineering-context/testing.md` § Testing a dialog.

## Invariants

- The smoke test `every link in the footer resolves` visits each footer href
  and fails if "Nothing scheduled here" appears — so a footer link needs a
  route in `App.jsx`, and renaming the not-found title breaks that test.
- The footer must contain `bootstrap.conference.dates` (smoke-tested); never
  hard-code a date there.
- Accent classes must be literal strings in `accents.js`; see CLAUDE.md.
- New motion needs an entry that the reduced-motion block neutralises, and must
  not leave content hidden when it is.
- Motion (`motion/react`) stays inside the two presentations. The app's own motion is CSS.
- The engineering talk states only what the factory really does. Its facts are
  the code's — the phases, round limits, tiers and thresholds in `factory/`
  (see `harness.md`) — and its numbers are real runs in this repository: ticket
  #38's models table and $0.93, ticket #16 at $4.59 then $1.80, and the model
  measurements in `factory/lib/models.ts`. Change the factory, change the talk.

## Gotchas

- `Icon` with a misspelled name, and `useToast` outside `<Toaster>`, both fail
  silently (nothing renders / no-op).
- `SectionHeader` is each page's visible title; the smoke suite finds pages by it.
- `format.time` expects `HH:MM`, not an ISO timestamp.
- A `fixed` modal rendered inside the header covers only the header — it is
  `glass`, a backdrop filter, so it contains `fixed` children. Portal it to
  `document.body` (§ Dialogs).

## Where to change…

- A nav item: `NAV` in `Layout.jsx` (icon must exist in `Icon.jsx`).
- A link on the home page: `LINKS` in `HomePage.jsx`, and the count in `tests/home.spec.js`.
- A footer link: the column array in `Layout`'s footer; add the route first.
- A new primitive used by more than one page: `ui.jsx`.
- A new token or utility: `@theme` / `@utility` in `index.css`.
- A new cover composition: another `variant` branch in `GeneratedCover`.
- A presentation beat: a caption in the chapter's `beats` and the `step` it shows in
  its `Scene`; a new chapter: an entry in that talk's chapter list —
  `components/presentation/chapters.js` (engineering) or `presentation/product/chapters.js` (product).
