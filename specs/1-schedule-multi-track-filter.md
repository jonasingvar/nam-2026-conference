# Schedule: filter by more than one track

## What this changes
On `/schedule` the Track chips become a multi-select. Clicking a second chip keeps the
first lit (both `aria-pressed="true"`); a session shows if it is in any selected track.
Clicking a lit chip drops only that track; dropping the last one, or clicking **All**,
shows every track again. The selection lives in the URL, so reload and shared links
restore it, and an old `?track=ai` link still works. The speakers page is untouched.

## Where
- `server/routes/sessions.js` — `GET /` (line ~38): split `trackSlug` on commas and
  emit `t.slug IN (?, ?)`; one value is the same query as today. Test in
  `tests/api/endpoints.test.js` (or a new case beside it) using the throwaway-database
  harness in `tests/api/harness.js`.
- `src/pages/SchedulePage.jsx` — derive `selectedTracks` from `params.get('track')`
  (split on `,`, drop empties); the chip `onClick` (line ~174) adds or removes its slug
  and writes `?track=a,b` (delete the key when empty); `active` becomes
  `selectedTracks.includes(t.slug)`; **All** is lit when none selected; add
  `aria-pressed` to each chip. `filters.track` stays a string (the joined value) so the
  fetch deps, `BLOCKERS` and `activeKeys` (one active filter whatever the count) need no change.
  Test in `tests/schedule.spec.js` (read-only, no data lane needed) using `visit`,
  `waitForResults` and the `result-count` test id from `tests/helpers.js`.
- `src/lib/api.js` — no change: `qs()` passes the comma string through.
- `context/engineering-context/schedule.md` — note that the track filter is multi-valued.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| Second chip keeps the first selected, both active | click two chips, both `aria-pressed=true` | spec |
| Two or more tracks show every session in any, and no others | `trackSlug=a,b` returns exactly the union of a and of b; `result-count` equals that union's size | API + spec |
| Clicking an active chip deselects only that track | click b, then b again: `result-count` returns to a's count, a still pressed | spec |
| Deselecting the last track, or All, shows all tracks | clear last chip and click All: count equals the unfiltered count, no `track=` in the URL | spec |
| Selection kept in URL; single-track link still works | load `?track=a,b` directly: both pressed, union count; load `?track=a`: one pressed, a's count | spec |
| Combines with other filters | union under `day=` equals the API's `day` + `trackSlug=a,b` result | API + spec |
| Speakers page unchanged | existing `tests/speakers.spec.js` and `/speakers?trackSlug=` case in `tests/api/endpoints.test.js` stay green | spec (existing) |

## Decisions
- Store the selection as one comma-separated key (`?track=ai,frontend`) per the schedule
  doc's convention for multi-value filters, rather than the repeated `?track=ai&track=frontend`
  the ticket gives as an example — OK?
- Count the track filter as one active filter in "Clear filters" and the Filters badge,
  however many tracks are selected — OK?

## Out of scope
The speakers page track filter; the other filters (day, venue, level, format, tag).
