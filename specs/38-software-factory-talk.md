# The engineering talk tells the factory's story (#38)

## What this changes

`/engineering-presentation` described the harness as it used to run: a script
(`ship.js`) started from Claude Desktop or a GitHub Actions runner, review and
QA as YAML workflows, three Claude models picked by hand. None of that exists
any more. The talk is rewritten as **The software factory**: the same way of
working, on Vercel — and written to sell what running it there buys.

## Where

- `src/components/presentation/chapters.js` — the order.
- `opening.jsx` (new) — title, the promise, the ticket.
- `platform.jsx` (new) — the map, the webhook, the seven workflows, Vercel
  Workflows, Vercel Sandbox, AI Gateway and Jev.
- `ship.jsx` (rewritten) — one ship run, eleven phases, Triage to Production.
- `closing.jsx` (new) — receipts, scale, your role, *Now you*.
- `intro.jsx`, `after.jsx` — removed. `apps.jsx` loses Claude Desktop.
- `kit.jsx` — `MODELS` is the factory's ladder; `Vercel`, `box`.
- `tests/presentation.spec.js`, `context/engineering-context/ui.md`,
  `UserSwitcher.jsx` (the talk's name in the menu).

## How it will be proved

| Done when | Check | Layer |
| --- | --- | --- |
| The talk opens on its new title, full screen | `opens full screen on its title` | spec |
| Every beat renders without a page error and is captioned (three bare frames) | `every beat renders without errors…` | spec |
| It names Vercel Workflows, Vercel Sandbox, AI Gateway, Jev, the webhook | same test | spec |
| It no longer presents `ship.js`, Claude Desktop, the YAML workflows or worktrees as how it runs | same test | spec |
| Keys, clicker, `?beat=`, chapters, reduced motion, the product talk's hand-off still work | the existing deck tests | spec |

## Decisions

- **Every claim is the code's.** Phases, round limits, tiers, thresholds, hosts
  and step names were read from `factory/`; the numbers on the receipts are
  real runs in this repository (ticket #38: $0.93; ticket #16: $4.59 on Claude
  models alone, $1.80 routed).
- **Ticket #140 stays the travelling character**, so the product talk's
  hand-off still lands; in this talk it is a *small* run, so its plan audit is
  shown skipped, as the run's own progress comment shows it.
- **The route and the hand-off button keep their names** (`/engineering-presentation`,
  "Continue to the engineering harness"); the talk's title is *The software factory*.

## Out of scope

The product talk. Smart test selection (#41) is not in the talk until it is merged.
