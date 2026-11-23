# Update /engineering-presentation to reflect the Vercel stack

## What this changes
A presenter who opens `/engineering-presentation` today tells the *old* story: the
label starts a **GitHub Actions runner**, `ship.js` runs on it, review and QA are
"two runners" with `agent-code-review.yml` / `agent-qa.yml`. After this change
every beat describes the factory as it is now, in CLAUDE.md and
`context/engineering-context/harness.md`: `ready-for-ai` on the issue reaches the
repository webhook, which starts one **durable, resumable Vercel Workflow**;
every job — planner, builder, auditors, review, QA — runs Claude Code in a
**Vercel Sandbox**; **Jev** sizes the ticket and picks each job the cheapest model
tier from AI Gateway's live catalog; and the whole thing is **two Vercel projects**
— the conference app and the factory — with branch previews and a production
health check after the merge. Same length, same navigation.

## Where
- `src/components/presentation/chapters.js` — `CHAPTERS`: register the Vercel chapter.
- `src/components/presentation/vercel.jsx` — **new**: a `VERCEL` chapter + scene: the
  webhook → Workflow → Sandbox run, Jev's sizing and per-job model tiers, and the
  two Vercel projects / previews / health check.
- `src/components/presentation/intro.jsx` — `INTRO` (~372) and `TwoWaysScene` (~159):
  drop "a fresh GitHub runner … ship.js" for the label → webhook → Vercel Workflow
  opening; `MapScene`'s `NODES` subs (~258: "a runner").
- `src/components/presentation/ship.jsx` — `SHIP_BEATS` (~476: setup, sizing and
  round-limit bodies, "isolated worktree on its own ports"), `SetupDetail`'s `Row`
  "Its own worktree" (~106) → sandbox + branch, `SizeDetail` (~554) → Jev's pick.
- `src/components/presentation/after.jsx` — `ReviewScene` (~142) `Runner` files and
  "two workflows start", `REVIEW_BEATS` (~238 "two more agents, on their own
  runners"), `MERGE_BEATS` (~321) production health, `SCALE_BEATS` (~381), `LAB_BEATS`
  (~673 "no Actions key in a fork").
- `src/components/presentation/apps.jsx` — the `GitHub` mock's `github-actions` bot and
  the two-door copy, if the opening keeps a second door.
- `context/engineering-context/ui.md` — the `/engineering-presentation` paragraph
  (~174) and the "its numbers are harness/index.md's" rule (~268).
- `tests/presentation.spec.js` — the `The harness presentation` describe; helper
  `failOnPageErrors` from `tests/helpers.js`; **no data lane** (the deck reads no
  attendee state, so it needs none).

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| The deck names the Vercel factory: `ready-for-ai` → a webhook → a durable Vercel Workflow → Claude Code in a Vercel Sandbox | a new **"every beat tells today's story…"** test walks every beat of `/engineering-presentation` and the page's text matches `/webhook/i`, `/vercel workflow/i`, `/sandbox/i` | Playwright (`tests/presentation.spec.js`) |
| No beat still claims a GitHub runner, GitHub Actions or `ship.js` | the same walk; the page's text matches none of `/GitHub Actions/i`, `/GitHub runner/i`, `/ship\.js/`, `/agent-qa\.yml/` | Playwright |
| The talk explains Jev: it sizes the ticket and picks each job's model tier from AI Gateway's live prices | the same walk; the page's text matches `/Jev/` | Playwright |
| The talk explains both the app and the factory on Vercel: two projects, branch previews, a production health check | the same walk; the page's text matches `/preview/i` and `/health/i` | Playwright |

Every row is false on main today, by reading: no beat contains "Vercel", "Jev",
"webhook" or "preview" (`grep` over `src/components/presentation/`), while
`intro.jsx:211` says "A fresh GitHub runner picked it up.", `intro.jsx:247` and
`ship.jsx:456` say "ship.js", and `after.jsx:642` says "Normally GitHub Actions
runs these." The browser is the cheapest layer that can prove this — the stale
copy lives in scene JSX, not in the importable `beats` arrays, and Node cannot
import the `.jsx` chapters.

## Decisions
- **The length criterion already holds on main.** The ticket asks for a similar
  length; main is 29 beats, so a length row would pass before any change and is
  not in the table. The build must keep the total within ±4 of 29 (the walk reads
  the counter) and proves the four content rows instead.
- New chapter file (`presentation/vercel.jsx`), or fold the Vercel material into
  the existing opening chapters? *(yes = new file)*
- Keep a second "ask Claude on your laptop" door beside the label path, or make
  the talk label-only? *(yes = keep a laptop path)*
- In a fork nothing runs the factory — the webhook is this repository's only. Keep
  the lab's "ask Claude in your fork" path, reworded away from Actions? *(yes = keep)*

## Out of scope
- `Deck.jsx` and `src/lib/presentation.js`: the beat mechanics are unchanged and
  already unit- and spec-tested.
- The product deck and the product presentation spec.
