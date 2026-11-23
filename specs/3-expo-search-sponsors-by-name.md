# Expo: search sponsors by name

## What this changes
The Expo page (`/expo`) gets a search box above the tiers. Typing part of a sponsor's name (case-insensitive) narrows the cards to matches, still under their tiers; tiers with no match disappear. No match shows an empty state naming the search text. The text lives in the URL (`/expo?q=acme`), so a reload or shared link restores it; clearing it brings every sponsor back.

## Where
- `src/lib/format.js` — new pure `filterSponsors(sponsors, q)` (trimmed, case-insensitive substring on `name`; blank `q` returns all); test in `tests/unit/format.test.js` (plain unit, no lane).
- `src/pages/ExpoPage.jsx` — `ExpoPage`: read `q` from `useSearchParams` (same `set` pattern as `FoodPage.jsx`, `replace: true`, delete key when empty), render `SearchInput` (`data-testid="expo-search"`, full width on phones) from `src/components/FilterBar.jsx`, filter before the `TIERS.map` (existing `if (!tierSponsors.length) return null` hides empty tiers), and when `!loading && !error && filtered.length === 0` render `EmptyState` titled `No sponsors match “${q}”` with a Clear search button (as `SchedulePage.jsx:288`). Keep the header count/hiring text on the full list.
- `tests/expo.spec.js` (new) — uses `visit` and `failOnPageErrors` from `tests/helpers.js`; read-only, so no data lane or `clearAgendaFor` needed. Sponsor names come from `GET ${API}/sponsors`, not hard-coded.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Search box; partial, case-insensitive name match, still grouped under tiers | `filterSponsors` unit cases (mixed case, partial, name-only not blurb); spec: type upper-cased fragment of a sponsor name, only matching cards remain inside their `tier-*` sections | unit + browser |
| Tier with no match hidden while searching | spec: with a query matching one tier, other `tier-*` testids have count 0 | browser |
| Nothing matches → says so, names the text | spec: `?q=zzzz` shows `No sponsors match “zzzz”` | browser |
| Search text kept in URL | spec: typing sets `?q=`; `visit('/expo?q=…')` and a reload show the box filled and list filtered | browser |
| Clearing shows every sponsor in every tier | unit: blank/whitespace `q` returns full list; spec: clear box, card count equals API sponsor count and all five tiers visible | unit + browser |
| Works on phone and laptop | same spec runs in both Playwright projects; asserts the search box is visible and the page has no horizontal overflow (as `smoke.spec.js`) | browser |

## Decisions
- Match on name only (not blurb, perk or booth), as the ticket says "name".
- Filtering is client-side on the already-fetched `/api/sponsors` list; no API change.

## Out of scope
Searching booth numbers or perks, server-side search, highlighting the matched text.
