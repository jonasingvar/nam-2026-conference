# Expo: search sponsors by name
## What this changes
The Expo page (`/expo`) gets a search box. Typing part of a sponsor's name narrows the cards to matching sponsors, still grouped by tier; tiers with no match disappear. No match shows an empty state naming the text; the text lives in `?q=` and survives reload/share. Works at phone width (the box is full width above the tiers).

## Where
- `src/lib/format.js` — add pure `filterSponsors(sponsors, q)` (trimmed, case-insensitive substring on `name`; blank q returns all); test in `tests/unit/format.test.js`.
- `src/pages/ExpoPage.jsx` (exports `ExpoPage`) — read `q` via `useSearchParams` (same `set` pattern as `FoodPage.jsx`, `replace: true`, delete key when empty); render `SearchInput` (`data-testid="expo-search"`) between header and tiers; apply `filterSponsors` before the `TIERS.map` (existing `return null` hides empty tiers); when loaded, no error and zero matches render `EmptyState` titled `No sponsors match “${q}”`. Keep the header count/hiring numbers on the full list.
- `tests/expo.spec.js` (new) — uses `visit` from `tests/helpers.js`; read-only, so no data lane needed. Runs in both desktop and mobile projects.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Typing part of a name (case-insensitive) shows only matching sponsors, grouped under tiers | `filterSponsors` matches substring regardless of case; spec types an upper-case fragment of a sponsor name, asserts non-matching cards gone and matches inside their `tier-*` section | unit + spec |
| A tier with no match is hidden while searching | spec: with a query matching one tier only, other `tier-*` testids have count 0 | spec |
| Nothing matches → page says so and names the text | spec: `/expo?q=zzqx` shows heading `No sponsors match “zzqx”` | spec |
| Search text kept in URL | spec: typing updates URL to `q=…`; `visit('/expo?q=…')` prefills the input and filters | spec |
| Clearing shows every sponsor, every tier | spec: clear input, card count equals `/api/sponsors` length and all five tiers visible; unit: blank q returns input unchanged | spec + unit |
| Works on phone and laptop | the spec runs in both Playwright projects; asserts the input is visible and within viewport width | spec |

## Decisions
- Match on the sponsor name only (not blurb, perk or booth), as the ticket says "by name"?
- The empty state offers a "Clear search" button (added on PR review), like the schedule's "Clear filters".
- Should the header's "N companies" count stay at the total rather than the filtered count?

## Out of scope
Server-side `q` on `/api/sponsors`; searching other fields; sorting.
