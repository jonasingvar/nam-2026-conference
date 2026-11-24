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
- `platform.jsx` (new) — the factory floor, and the panels for each Vercel
  piece (webhook, Workflows, Sandbox, AI Gateway and Jev).
- `ship.jsx` (rewritten) — the spine: one ship run on a rail of its eleven
  phases, Triage to Production, each Vercel piece shown at its station.
- `closing.jsx` (new) — receipts, scale, your role.
- `intro.jsx`, `after.jsx` — removed. `apps.jsx` loses Claude Desktop.
- `kit.jsx` — `MODELS` is the factory's ladder; `Vercel`, `box`.
- `tests/presentation.spec.js`, `context/engineering-context/ui.md`,
  `UserSwitcher.jsx` (the talk's name in the menu).

## How it will be proved

| Done when | Check | Layer |
| --- | --- | --- |
| The talk opens on its new title, full screen | `opens full screen on its title` | spec |
| Every beat renders without a page error and is captioned (two bare frames: the title, the closing line) | `every beat renders without errors…` | spec |
| It names Vercel Workflows, Vercel Sandbox, AI Gateway, Jev, the webhook | same test | spec |
| It no longer presents `ship.js`, Claude Desktop, the YAML workflows or worktrees as how it runs | same test | spec |
| Keys, clicker, `?beat=`, chapters, reduced motion, the product talk's hand-off still work | the existing deck tests | spec |

## Decisions

- **The ship run is the spine.** An earlier cut taught the platform in four
  chapters before the walkthrough began, and the talk lost its thread. The
  rail now stays on screen from its first stop to Production, and the webhook,
  Jev, the sandbox, the durable trace, the climb and the merge hook are each
  told where they happen. It opens on "a ticket goes in, a feature comes out"
  and ends on the feature, live.
- **Every claim is the code's.** Phases, round limits, tiers, thresholds, hosts
  and step names were read from `factory/`; the numbers on the receipts are
  real runs in this repository (ticket #38: $0.93; ticket #16: $4.59 on Claude
  models alone, $1.80 routed).
- **The preview gets its own stop**: trying the pull request as a running app
  while you review it is what Vercel adds that the old harness never had.
- **Ticket #140 stays the travelling character**, so the product talk's
  hand-off still lands; in this talk it is a *small* run, so its plan audit is
  shown skipped, as the run's own progress comment shows it.
- **No "now you" lab, and no comparison with the laptop script**: the talk ends
  on the closing line.
- **The route and the hand-off button keep their names** (`/engineering-presentation`,
  "Continue to the engineering harness"); the talk's title is *The software factory*.

## Out of scope

The product talk. Smart test selection (#41) is not in the talk until it is merged.
