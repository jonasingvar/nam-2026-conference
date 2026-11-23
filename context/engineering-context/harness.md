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
  - factory/lib/review-policy.ts
  - factory/app/api/cron/warm/route.ts
  - .claude/settings.json
  - context/engineering-context/index.md
  - specs/README.md
tests:
  - factory/test/policy.test.ts
  - factory/test/phases.test.ts
  - factory/test/agent.test.ts
  - factory/test/review-policy.test.ts
  - tests/unit/gate.test.js
  - tests/unit/red-check.test.js
  - tests/unit/qa-facts.test.js
  - tests/unit/context.test.js
  - tests/unit/winnow-pin.test.js
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
| Gate | merge `origin/<base>`, `scripts/gate.mjs`, `scripts/red-check.mjs` if green, `scripts/qa-facts.mjs` — one command job, its JSON read by the script | command |
| Audit | lenses in parallel (browser alone, after), a skeptic per blocker, a fixer, back to Gate; stuck or out of rounds → hand back | agents |
| Pull request | merge the base once more, refuse if code changed after the gate, push, screenshots, compose the body from what the run knows, open it | command + GitHub API |
| Preview | wait for Vercel's preview of the PR's head (a GitHub Deployment "Preview – …") | step |
| Review & QA | two child workflows, run as one more audit round: what they find (review's blockers, QA's reproduced bugs, stale docs) ship fixes itself — fresh forked sandbox, fixer, gate, push — and asks them again, two rounds at most; still open → `needs-human`, PR left open | workflows + agents |
| Merge | `createHook`, opened the moment the PR exists (a merge during review is kept, not lost) — the run sleeps, costing nothing, until the PR closes | hook |
| Production | find the Production deployment of the merge commit, then `GET /api/health` on production | steps |

**Profiles.** `fast` (Sonnet, one combined audit, `GATE_SCOPE=branch`, a fix
re-gated not re-audited), `small` (Sonnet, combined + a browser audit only
when something visible changed without a browser test), `full` (Opus, plan
audit, criteria + rules + browser, four rounds). A small run whose diff touches
a risky path or passes 300 app lines escalates to the full auditors on Opus; a
gate red twice moves the fixer to Opus.

**Jobs.** Everything long runs detached in the sandbox
(`lib/sandbox-steps.ts:startJob`), each in `/vercel/.factory/<seq>-<label>/`
(`pid`, `exit`, `out.log`, `result.json`); `lib/jobs.ts:runJob` polls it
across durable `sleep('20s')`s. An agent is a job running `claude -p` with
`--json-schema` (`workflows/schemas.ts`) and `--output-format json`;
`readAgent` takes `structured_output` and the run's real cost
(`total_cost_usd`, `modelUsage`). A missing required field is a dead agent.

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

**The network.** `lib/policy.ts:lockedPolicy` is applied before any agent runs
and on every job start: GitHub, npm and AI Gateway only. The agents hold
placeholder tokens (`AGENT_ENV`); the sandbox proxy injects the real GitHub
token and Gateway key on the way out, so no credential exists inside the
sandbox. Anything under `EqualExperts/` on github.com or api.github.com is
answered 403 by the proxy itself. Claude Code reaches models through
`https://ai-gateway.vercel.sh/claude-code`.

**Observability.** Three views of every run. **The trace** (the run in the
factory's Workflows tab): each phase is its own durable step — `spec`,
`planAudit`, `implement`, `gate`, `codeAudit`, `skeptic`, `fix`, `learn`,
`pushBranch`, `openPullRequest`, … (`lib/phases.ts:phaseFor` maps a job's label
to its step; an unknown label falls back to `job`) — each starting its job if
needed and waiting up to two minutes, with a durable `sleep` between waits.
**Attributes** on the run: `issue`, `phase`, `size`, `pr`, so runs can be
filtered by ticket or phase. **The `progress` stream** (the run's Streams
tab): every phase change, and after every agent its model, turns, seconds,
cost and its own final answer.

**Progress.** One issue comment (`<!-- ship-on-vercel -->`), edited at every
phase: the phases, the profile and why, the branch and spec, each round, the
spend by model, a log, and a link to the run in the Workflows tab.

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
- What review and QA flag → the two playbooks in `harness/`.
