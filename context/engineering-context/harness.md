---
area: harness
summary: The factory — a GitHub issue to a reviewed, merged and deployed pull request, as one durable Vercel Workflow running Claude Code in a Vercel Sandbox — and the scripts it runs.
read_when: changing how tickets are built, gated, audited or reviewed; the webhook; a run that stopped; the scripts the gate uses; the context docs themselves
files:
  - factory/workflows/ship.ts
  - factory/workflows/schemas.ts
  - factory/lib/jobs.ts
  - factory/lib/sandbox-steps.ts
  - factory/lib/github-steps.ts
  - factory/lib/triage.ts
  - factory/lib/policy.ts
  - factory/lib/constants.ts
  - factory/lib/start.ts
  - factory/lib/phases.ts
  - factory/app/api/github/route.ts
  - factory/app/api/ship/route.ts
  - context/engineering-context/harness/index.md
  - context/engineering-context/harness/github.md
  - context/engineering-context/harness/quickstart.md
  - context/engineering-context/harness/code-review-playbook.md
  - context/engineering-context/harness/qa-playbook.md
  - scripts/gate.mjs
  - scripts/test-map.mjs
  - scripts/coverage-agent.mjs
  - factory/lib/select.ts
  - factory/lib/testrun.ts
  - scripts/red-check.mjs
  - scripts/qa-facts.mjs
  - scripts/pr-media.mjs
  - scripts/context.mjs
  - factory/workflows/review.ts
  - factory/workflows/qa.ts
  - factory/workflows/respond.ts
  - factory/workflows/verify.ts
  - factory/workflows/warm.ts
  - factory/lib/kit.ts
  - factory/lib/models.ts
  - factory/lib/review-policy.ts
  - factory/app/api/cron/warm/route.ts
  - .claude/settings.json
  - context/engineering-context/index.md
  - specs/README.md
tests:
  - factory/test/policy.test.ts
  - factory/test/phases.test.ts
  - factory/test/agent.test.ts
  - factory/test/models.test.ts
  - factory/test/qa.test.ts
  - factory/test/review-policy.test.ts
  - factory/test/select.test.ts
  - tests/unit/gate.test.js
  - tests/unit/test-map.test.js
  - tests/unit/red-check.test.js
  - tests/unit/qa-facts.test.js
  - tests/unit/context.test.js
  - tests/unit/winnow-pin.test.js
  - tests/unit/readme.test.js
  - tests/unit/tracker-context.test.js
  - tests/unit/demo-transcript.test.js
  - tests/unit/winnow-record.test.js
related: [testing]
---

# Harness

The factory lives in `factory/`, a small Next.js app deployed as its own
Vercel project (`nam-2026-factory`). CLAUDE.md § *What happens to a ticket*
says what it does and why; this is the machinery.

## How it works

**Trigger.** `factory/app/api/github/route.ts` is the repository's webhook
(HMAC-verified with `GITHUB_WEBHOOK_SECRET`; any other repository is refused):
the `ready-for-ai` label on an issue, or `@claude …` / `/ship …` in an issue
comment from someone with write access, calls `lib/start.ts:startShip`, which
`start()`s the `ship` workflow holding the token `ship:<repo>#<n>` — a second
trigger while a run lives gets that run's id, not a second run. A closed pull
request resumes the hook `pr:<repo>#<pr>` the run is waiting on. By hand:
`POST /api/ship {issue, base?, size?, notes?}` and `GET /api/ship?runId=` with
`Authorization: Bearer $FACTORY_TRIGGER_SECRET`.

**The run** (`factory/workflows/ship.ts`, `"use workflow"`):

| Phase | What happens | Who |
| --- | --- | --- |
| Triage | read the issue; `ship:full` / `ship:fast` labels win, else Jev picks fast, small or full; under 60% sure → `sized` | step + Jev (`lib/triage.ts`) |
| Plan | a sandbox `ship-<n>-<run>`, a branch `issue-<n>-<slug>` from `origin/<base>`, then the planner writes `specs/<n>-<slug>.md` as the first commit and reports facts; a `sized` run is sized from them (`profileFor`) | command + agent |
| Plan audit | full, or ≥ 2 open questions: auditors, a skeptic per blocker, revise; only `scope` goes to a person | agents |
| Build | the failing test committed red, then the change, docs kept true | agent |
| Gate | `select`: merge `origin/<base>`, push the commit to `refs/factory/gate/<sha>` (not the branch), `scripts/qa-facts.mjs`, then the test selection (*Test selection*, never weaker than `GATE_SCOPE=branch`); then `runDesktop` ∥ `runMobile`: `scripts/gate.mjs` on each project in its own sandbox (`<box>-gd`, `<box>-gm`), npm test and `scripts/red-check.mjs` on desktop — their JSON merged by the script | command |
| Audit | at the same time as the gate, in ship's own sandbox: lenses in parallel (browser alone, after), a skeptic per blocker. Green gate → the confirmed blockers go to the fixer; red gate → the failing tests and the confirmed blockers go to one fix round (only a green round counts toward the audit budget); back to Gate; stuck or out of rounds → hand back | agents |
| Pull request | merge the base once more, refuse if code changed after the gate, push, screenshots, compose the body from what the run knows, open it | command + GitHub API |
| Preview | wait for Vercel's preview of the PR's head (a GitHub Deployment "Preview – …"); pin a *Try it* link to the top of the PR — only when the app changed, since a factory or docs change builds the same app | step |
| Review & QA | two child workflows, run as one more audit round: what they find (review's blockers, QA's reproduced bugs, stale docs) ship fixes itself — fresh forked sandbox, fixer, gate, push — and asks them again, two rounds at most; still open → `needs-human`, PR left open | workflows + agents |
| Merge | `createHook`, opened the moment the PR exists (a merge during review is kept, not lost) — the run sleeps, costing nothing, until the PR closes | hook |
| Production | find the Production deployment of the merge commit, then `GET /api/health` on production | steps |

**Profiles.** Every profile gates on the selected tests; verify and main run
more. `fast` (one combined audit, the red-check on unit tests only, a fix
re-gated not re-audited), `small` (combined + a browser audit only when
something visible changed without a browser test), `full` (plan audit,
criteria + rules + browser, four rounds). A small run whose diff touches a
risky path or passes 300 app lines escalates to the full auditors, judged on
the strong tier at least. A profile says how much loop; which model runs each
job is chosen separately (*Models*).

**Models** (`lib/models.ts`). Claude Code reaches models through AI Gateway's
`/claude-code` surface, which routes any gateway model that makes tool calls,
so a job's model is a gateway id, not just opus/sonnet/haiku. Four tiers —
lite, standard, strong, frontier — each a short list of models vetted to drive
Claude Code (`LADDER`: lite Haiku 5.5; standard the open-weights flash models,
which audited as well as Sonnet at a fifth of the price; strong Sonnet 5.5; frontier Opus 5.5). Per run, one `chooseModels` step asks Jev, in one call,
for each job (`JOBS`: spec, implement, fix, audit, skeptic, review lens, QA
plan, QA write…) the least tier that does it right first time, as a
distribution; the script then starts each job at the tier with the least
*expected* cost from AI Gateway's live prices (`/v1/models`): trying it, plus —
weighted by Jev's odds that it is not enough — a climb for a job whose failure
shows (no result, a red gate, probes that do not run), or the job's `miss`
cost for one whose failure is silent (an auditor missing a blocker). Within a
tier the cheapest model for the job's token profile wins, cache reads priced in.
Jev unavailable: each job's fallback tier for the size. A failure climbs one
tier, once (`routedAgent`): no result re-runs the job a tier up; a red gate
sends the fixer above whatever wrote the code; QA probes that do not run send
the writer up; a review lens with low confidence reads again a tier up. Every
attempt is priced from its token counts and the catalog — Claude Code prices a
model it does not know with a guess (`costBasis: unknown`).

**Jobs.** Everything long runs detached in the sandbox
(`lib/sandbox-steps.ts:startJob`), each in `/vercel/.factory/<seq>-<label>/`
(`pid`, `exit`, `out.log`, `result.json`); `lib/jobs.ts:runJob` polls it
across durable `sleep('20s')`s. An agent is a job running `claude -p` with
`--json-schema` (`workflows/schemas.ts`) and `--output-format json`;
`readAgent` takes `structured_output` and the run's token usage
(`modelUsage`), which the factory prices from AI Gateway's catalog —
Claude Code's own `total_cost_usd` guesses for models it does not know. A missing required field is a dead agent.

**Resuming.** The sandbox is persistent: when it hits its timeout (45 minutes
on Hobby) or dies, its disk is kept and the next step resumes it. `pollJob`
then reports the job `lost` and `runJob` starts that one job again (twice at
most). Every finished step returns its recorded result on replay — a redeploy,
a crashed function or a dead sandbox costs only the job that was running.

**Hand-back and resume.** A run that stops opens a **draft** pull request on
its branch with what is open, and labels the issue `needs-human`. A person's
comment on the issue or the draft starts ship with `answer: true`: it finds the
earlier attempt (`findEarlierAttempt`), collects everything people said
(`peopleSaid`), and asks Jev (`judgeAnswers`, P(yes) ≥ 0.6) whether the replies
settle what the draft's *Why this stopped* asked. No: one comment saying what is
still open, and nothing else changes. Yes — or `ready-for-ai` / `/ship`, which
never ask — ship **continues the same branch**: the planner revises the spec to
record each answer as a Decision, the builder keeps what still holds, and the
draft becomes the pull request. Every agent sees what people said as amendments
to the ticket.

**Verify** (`workflows/verify.ts`, CI on every push to a pull request and to
main, status `factory/verify`) runs what the change needs. `classify` sorts
the changed paths (`lib/select.ts:classify`): factory only → the factory's
`tsc` and tests (its dependencies are kept in the warm sandbox, `FACTORY_DEPS`),
no app gate; docs only → `node scripts/context.mjs check` if `context/`
changed, else nothing; anything else is the app; a mix runs both, side by side.
For the app: `select` (*Test selection*), then `runDesktop` ∥ `runMobile`, each
in its own fork of the warm sandbox, npm test with desktop. On a pull request
ship opened, verify reads ship's gate record for that commit and runs only
what its own selection adds. Tests are counted once, each running on both
shards; the status reads like *ran 7 of 92 browser tests (map 2, smoke 5) ·
selected: these reach MyAgendaPage.jsx · unit/API all (330)*. The run's
attributes keep `kind`, `selection`, `selected`, `of`, `breakdown`, `reason`,
`confidence` and `reused`. The `full-suite` label runs everything.

**Test selection** (`lib/select.ts`, pure and tested). With a current map, the
tests are the map's — the ones whose run executed a changed file, picked by
exact title (`GATE_SPECS` + `GATE_GREP`) — plus the **smoke set**, five named
tests (`SMOKE_SET`: the layout shell and Home, the seeded API, a seat that
survives a reload, a clash refused with a swap, a check-in that unlocks a
rating), plus the branch's own specs whole. The import graph is not consulted
then: a shared import "reaches" every page that pulls it in, and ran nothing.
A cheap model (`testSelect`, called from the function through AI Gateway, so
verify's sandbox keeps no credential) reads the diff, the candidates, every
spec and recent escapes, and adds what a map cannot see (CSS, seed data,
helpers, config, routes) or drops a candidate with a reason, with a
confidence. Below 0.7, no map, a map more than 40 app commits behind, or a
changed file the map has never seen: widen to the branch scope
(`affectedSpecs || fastFallback`) and the map's candidate specs, whole — or
everything where that cannot be told. Every selection is broken down by what
brought each test in (`map`, `smoke`, `own`, `added`, `floor`, `widened`).
Ship's gate adds the branch scope as a floor. Main runs everything.

**The test map** (`scripts/test-map.mjs build`) is built on every push to
main that touches the app, in a third sandbox beside verify's shards so the
status never waits: each unit/API file alone under `NODE_V8_COVERAGE`, then
the browser suite one test at a time (`--workers=1`) against an API started
with `scripts/coverage-agent.mjs`, which takes V8's precise coverage between
tests; `tests/fixtures.js` records the browser side with Chromium's JS
coverage. A file counts when one of its functions ran, not when it loaded
(Vite loads every page on every test; its Fast Refresh code is ignored). About
5 minutes for 212 browser tests; ~40 kB of JSON, in the public Blob store
`orbit-pr-media` at `test-map/<sha>.json` with `test-map/latest.json` pointing
at it. **Escapes:** each gate records what it ran at `test-select/<sha>.json`;
when main's full run fails a test the merged pull request's record skipped,
it is appended to `test-map/escapes.json` (last 50) and the run gets an
`escapes` attribute, and the selector reads the recent ones.

**Sandbox hygiene.** Every workflow deletes its sandbox when it ends, fails
or crashes. A run's sandbox keeps one snapshot that expires in a day. Under
that, the `warm` workflow (daily, and on each push to main) sweeps any run
sandbox idle for over three hours, and any snapshot no live sandbox resumes
from — deleting a sandbox does not delete its snapshots (`sweepSandboxes`): Hobby's snapshot
storage filled in one afternoon of crashed runs.

**Out of credit.** A 402 from AI Gateway is not a dead agent: `readAgent`
throws `OUT_OF_CREDIT`, ship's crash guard says so on the issue, and review
and QA set an `error` status with it — never a low-confidence pass.

**Trust and modes.** A sandbox gets only what its workflow needs
(`lib/policy.ts:Mode`, kept on the sandbox's disk and re-applied on every job
start): **none** for verify — no credential at all, so it runs for anyone's
pull request; **read** for review and QA — AI Gateway for Claude Code, no
GitHub token (the repository is public, and the factory posts verdicts from
the function); **push** for ship and respond — the GitHub token too, only on
branches of this repository. Review and QA start by themselves only for a
branch of this repository opened by someone with write access; anyone else's
pull request gets verify until a maintainer comments `/review`.

The mode and the preview hosts live on the sandbox's own disk, which everything
that runs there can write — a pull request's install scripts, an agent reading
an issue. So the factory seals them (`sealPolicy`: an HMAC under a key only the
function holds, bound to the sandbox's name) and `trustedState` believes
nothing else: a mode file edited from inside, a host added, a seal copied from
another sandbox each read as **none**, with no hosts. The same distrust applies
to what the factory reads back from GitHub: a verdict marker
(`<!-- factory-verdict:… -->`) counts only in a comment by someone who can
write to the repository (`markerIn` — the factory posts with such a person's
token), and a commit it names must be a sha. A branch name is its author's to
choose, so `checkoutPr` single-quotes it.

**The network.** `lib/policy.ts:lockedPolicy` is applied before any agent runs
and on every job start: GitHub, npm and AI Gateway only. The agents hold
placeholder tokens (`AGENT_ENV`); the sandbox proxy injects the real GitHub
token and Gateway key on the way out, so no credential exists inside the
sandbox. Anything under `EqualExperts/` on github.com or api.github.com is
answered 403 by the proxy itself. Claude Code reaches models through
`https://ai-gateway.vercel.sh/claude-code`. A preview QA probes is named host
by host, and every request to it carries `x-vercel-skip-toolbar: 1`: a
preview's HTML otherwise loads `vercel.live`'s toolbar script, which the
sandbox cannot reach, and the console error failed every probe that watches
the console.

**Observability.** Three views of every run. **The trace** (the run in the
factory's Workflows tab): each phase is its own durable step — `spec`,
`planAudit`, `implement`, `gate`, `codeAudit`, `skeptic`, `fix`, `learn`,
`pushBranch`, `openPullRequest`, … (`lib/phases.ts:phaseFor` maps a job's label
to its step; an unknown label falls back to `job`) — each starting its job if
needed and waiting up to two minutes, with a durable `sleep` between waits.
**Attributes** on the run: `issue`, `phase`, `size`, `pr`, so runs can be
filtered by ticket or phase, and `models` (`job=model` per job, `↑` a climb),
`est_usd`, `spend_usd` and `climbs`. **The `progress` stream** (the run's
Streams tab): every phase change, after every command its seconds, and after
every agent its model, the tier and Jev's odds behind it, turns, seconds, its
cost priced from the catalog against the estimate, and its own final answer.

**Progress.** One issue comment (`<!-- ship-on-vercel -->`), edited at every
phase: the phases, the profile and why, the branch and spec, each round, the
spend by model against what was expected, a *Models* table (per job: the
model, why, expected and actual cost, climbs), a log, and a link to the run in
the Workflows tab. Review and QA put the same table in their verdict comments.
The comment is a report, never the work: `progress` swallows a failure to
update it, so GitHub refusing an edit cannot end a run — the next phase's
update shows everything the missed one would have. `gh()` itself repeats a
call GitHub answered 502–504 (three more tries, up to ten seconds apart),
except a `POST`, which may have gone through; a step's own retries cover those.

**Time.** `lib/timing.ts` times a ship run by its phases, three ways: *working*
(wall-clock, every phase but the wait for a person's merge), *waiting for you*
(the Merge phase), and *agents ran* (each agent's own running time added up —
agents side by side each count, so it can exceed the working time; review and
QA return theirs as `seconds`). The clock is the workflow's own `Date.now()`:
the time its last step result or hook arrived, the same on every replay. The
progress comment carries a *Time* line; the pull request's spend line adds the
working time by phase; and once the ticket is merged (and, on `main`, live) the
pull request gets one closing line with the money, the work and the wait.

**QA** (`workflows/qa.ts`) splits thinking from typing: a planner (`qaPlan`)
writes an exact probe plan — route, attendee, pinned clock, steps by test id,
expected results — a cheap writer (`qaWrite`) turns it into
`tests/qa-probe.spec.js` and runs it once on desktop to fix its selectors, and
the factory runs the file itself, desktop and mobile in parallel
(`run:desktop`, `run:mobile`). While triage reads the diff, `warm` hits the
preview's pages and API so its function instances seed their SQLite first.
A probe the plan marks `stateful` (or whose steps book, check in or rate —
`isStateful`) runs instead on the branch's own app in the sandbox (`run:app`:
the repository's Playwright config with its webServer, a claimed lane, one
worker), because a preview's instances each keep their own database; its base
comparison runs in a worktree of the base (`/vercel/.factory/qa-base`).
`classify` settles each failure as a bug, pre-existing, the environment's or a
question; the environment's are listed ⚪ apart, never fail the pass and do
not count towards confidence (`coverage`). Everything in the comment has its
terminal colour codes stripped (`stripAnsi`).

## Invariants

- **The gate is a command, never an opinion.** No agent relays its output; the
  script reads `gate.mjs`'s JSON (`readGate`), and anything unparseable is red.
  A gate that finds no unit totals is red too (`unitTotals`).
- **Fail closed on work, open on claims.** A dead auditor is retried once, then hands back; a dead
  builder or fixer hands back. A claim stands only if its own skeptic demonstrates it: a dead or
  unsure skeptic leaves nothing raised (`code-review-playbook.md` §2, `factory/lib/review-policy.ts`).
- **A test gap is never a blocker**, in ship or review: the fixer tightens it as polish when it is
  fixing anyway, and it never hands a ticket back or labels a pull request `harness-escape`.
- Only a confirmed blocker or a red gate costs a fix round. The skeptic judges
  against the spec *as first committed*.
- **Agents do judgement only.** Branching, merging the base, pushing, opening
  the pull request and every label are steps the script takes.
- No `Date.now()`, `Math.random()` or Node API in `ship.ts` — the workflow
  runs in a sandboxed VM and is replayed. Job ids come from a counter, so they
  are the same on every replay.
- The workflow imports only `lib/constants.ts` for values; anything with Node
  imports is a step (`"use step"`) or a helper that calls steps.

## Gotchas

- **The sandbox's clone tracks no branches.** Without
  `remote.origin.fetch = +refs/heads/*:refs/remotes/origin/*` there is no
  `origin/main`, and every `git … origin/<base>` fails (the factory's first
  run handed back at Plan).
- **Node 24 is the sandbox's Node**, and its `node --test` reporter is spec,
  not TAP — `gate.mjs` reads both.
- **Turbopack's dev loader runs on the `node` in PATH.** `next dev` with an
  old system Node fails on the Workflow loader's `import … with`; the factory
  is exercised deployed, not in `next dev`.
- **A pull request's base is where its preview comes from.** Vercel builds the
  PR's head; a base without `vercel.json` and `api/` has no API on its preview.
- **Two Vercel projects, one repository.** `nam-2026-conference` builds the root
  (its ignore command skips commits that only touch `factory/`);
  `nam-2026-factory` has Root Directory `factory` and skips commits that do not
  touch it. Deploying the factory by hand therefore runs from the repo root with
  its ids (`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` from `factory/.vercel/project.json`)
  — from inside `factory/` the CLI cannot find the root directory.
- **Every factory comment carries `<!-- factory -->`.** They are posted with a
  person's token, so the webhook would otherwise read an agent's reply that
  mentions `@claude` as a new request.
- The progress comment and the PR are written by the factory's token from the
  function, never from the sandbox; the agents' `gh` calls go through the
  proxy.

## Where to change…

- A phase, a loop or a profile → `factory/workflows/ship.ts` (`PROFILES`, `profileFor`).
- What an agent returns → `factory/workflows/schemas.ts`.
- What the agents may reach → `factory/lib/policy.ts`.
- How a ticket is sized → `factory/lib/triage.ts` (`SIZES`, Jev's criteria).
- Which models a job may use, what it costs and when it climbs → `factory/lib/models.ts` (`LADDER`, `JOBS`, `TIER_RUBRIC`).
- What review and QA flag → the two playbooks in `harness/`.
