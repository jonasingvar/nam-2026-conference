<div align="center">

# The factory

**A GitHub issue to a deployed change, as durable Vercel Workflows**

</div>

Everything that builds, checks and reviews this app runs on Vercel: one
Next.js project (`factory/`, deployed as `nam-2026-factory`) whose workflows
run Claude Code in Vercel Sandboxes, route every model call through AI
Gateway, and size each ticket with Jev. No GitHub Actions, no laptop.
[`harness.md`](../harness.md) is the map for changing it.

**In this folder:**

- [`quickstart.md`](quickstart.md) — label an issue, get a pull request. Start here.
- [`github.md`](github.md) — the webhook, the secrets, the labels and commit statuses.
- [`code-review-playbook.md`](code-review-playbook.md) — how review judges a pull request, and what it never flags.
- [`qa-playbook.md`](qa-playbook.md) — how QA probes a pull request on its preview.

## 🧩 The workflows

| | Workflow | Starts when | What it does |
| --- | --- | --- | --- |
| 🏭 | **ship** | `ready-for-ai` on an issue, or `/ship` / `@claude` on it | Jev sizes it → spec → failing test → change → gate ⇄ audit → pull request → preview → review & QA → waits for your merge → checks production |
| 🔍 | **review** | a pull request opens or is marked ready, `/review` on it, or ship | Lenses picked by what the diff touches; every blocker must name a path to harm and survive a skeptic; a re-review looks only at what changed |
| 🧪 | **qa** | with review | Probes the gaps the PR's own tests leave, in a browser, **on the PR's Vercel preview**, desktop and mobile; a failure counts only if it reproduces there and not on the base's deployment |
| 💬 | **respond** | `@claude …` on a pull request | Makes the change asked for, nothing else; gate; push; reply |
| ✅ | **verify** | every push to a pull request, and to main | CI: the gate in a sandbox, as the commit status `factory/verify` |
| 🔥 | **warm** | every push to main, and daily | Rebuilds the sandbox every run forks: installed, with Chromium |

Each is a **script, not a prompt**: loops, round limits and who judges what
are code; agents only judge. Every agent is a fresh context that never sees
the reasoning of the one before it — that is what makes an audit an audit.

## ⚡ Fast, and resumable

- **Warm sandboxes.** A run forks `orbit-warm` — the repository installed and
  Chromium in place — and only fetches its base. No minute of `npm ci`.
- **Nothing waits on a function.** Agents and the gate run detached in the
  sandbox; the workflow polls between durable `sleep()`s. Thinking for ten
  minutes costs the platform nothing.
- **Durable.** Every step's result is in the run's event log. A redeploy, a
  crashed function or a sandbox that hit its timeout costs only the job that
  was running: on resume, finished steps return their results and the
  sandbox comes back from its snapshot.
- **Parallel.** Auditors, skeptics, review and QA run side by side.
- **Agents judge; commands decide.** The gate, the red-check, merging the
  base, pushing, opening the PR and every label are plain steps.

## 🔒 Nothing secret in the sandbox

The agents hold placeholder tokens. The sandbox's network proxy injects the
real GitHub token and AI Gateway key on the way out, for those hosts only, and
the preview bypass for the one preview a QA run tests. The network reaches
GitHub, npm, AI Gateway, the app's fonts and that preview — nothing else.
Anything under `EqualExperts/` is refused by the proxy itself.

## 🧾 What it costs

Every agent's tokens are priced from AI Gateway's live catalog (Claude Code's
own `total_cost_usd` guesses for models it does not know). The issue's
progress comment shows the spend as it grows, and the pull request gets a line
splitting it by phase. A first small ticket: about **$1** to a pull request.

## 🚑 When it goes wrong

| You see | It means | Do this |
| --- | --- | --- |
| `needs-human` on the issue | Ship could not converge, or met a failure that is also on the base, or the ticket itself is in question | **Just reply**, on the issue or the draft PR. When Jev reads your replies as settling what was open, ship resumes on the same branch and turns the draft into the pull request |
| `harness-escape` on a PR | Review found a blocker ship's own loop missed | Worth a lesson in the docs: which lens would have caught it? |
| `factory/verify` red | The gate failed on that commit | The status links to the run; every step's output is there |
| Anything else | — | The Workflows tab of `nam-2026-factory` has every run, step by step |
