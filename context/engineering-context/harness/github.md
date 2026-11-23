# The factory and GitHub

GitHub holds the issues and pull requests; everything that acts on them runs
on Vercel. There are no GitHub Actions in this repository.

## The webhook

`https://nam-2026-factory.vercel.app/api/github` receives `issues`,
`issue_comment`, `pull_request` and `push` events, signed with
`GITHUB_WEBHOOK_SECRET` (HMAC SHA-256, checked before anything is parsed).
Anything not from `jonasingvar/nam-2026-conference` is refused. Comments count
only from `OWNER`, `MEMBER` or `COLLABORATOR`, and never the factory's own (its
comments carry `<!-- factory…` or `<!-- ship-on-vercel` markers).

| Event | Starts |
| --- | --- |
| issue labelled `ready-for-ai` · `/ship` or `@claude` on an issue | ship |
| any pull request opened, reopened or pushed to | verify — no credential, so safe for anyone's |
| …on a branch of this repository, by someone with write access, not a bot (and not one ship opened, which runs its own) | review + QA too |
| `/review` on a pull request, by someone with write access | verify, review + QA — a fork's pull request too: its head is fetched as `pull/<n>/head`, and review and QA hold no GitHub token |
| `@claude …` on a pull request of a branch in this repository | respond |
| a comment on a ticket in `needs-human`, or on its draft (by someone with write access) | ship resumes **if** Jev judges the replies settle everything the hand-back asked; otherwise one reply saying what is still open |
| `ready-for-ai` or `/ship` on a pull request ship opened | the label is put on its issue too, and ship resumes, no questions asked |
| pull request closed | wakes the ship run waiting on it; a merge clears its issue's labels |
| push to `main` | verify, and warm |

Each start holds a token for the life of its run (`ship:<repo>#<n>`,
`verify:<repo>@<sha>`…), so a redelivered webhook or a second label is told
which run already has it.

## Secrets (on the `nam-2026-factory` Vercel project)

| Name | What |
| --- | --- |
| `GITHUB_TOKEN` | the `jonasingvar` account's token: the factory's API calls, and injected by the sandbox proxy for the agents' `git` and `gh` |
| `AI_GATEWAY_API_KEY` | injected by the proxy for Claude Code; the functions use OIDC |
| `JEV_API_KEY` | Jev through AI Gateway, bring-your-own-key |
| `GITHUB_WEBHOOK_SECRET` | the webhook's signature |
| `PREVIEW_BYPASS_SECRET` | the app project's *Protection Bypass for Automation*, injected for the one preview QA tests |
| `FACTORY_TRIGGER_SECRET` | `POST /api/ship` and `GET /api/ship?runId=` by hand |
| `CRON_SECRET` | the daily warm |

## Labels and statuses

Labels: `ready-for-ai` (start), `ai-working`, `needs-human`, `ready-for-human`,
`ship:fast` / `ship:full` (a person's sizing, read before Jev's), `follow-up`
(filed by review), `harness-escape`. Statuses on a commit, beside Vercel's
own: `factory/verify`, `factory/review`, `factory/qa` — each links to its run.
Machines gate, agents advise: none of them is a required check.

## Deploying

Both projects deploy from Git through Vercel's integration: `nam-2026-conference`
(the app) builds every branch as a preview and `main` as production;
`nam-2026-factory` is the factory. A run in flight finishes on the deployment
it started on.
