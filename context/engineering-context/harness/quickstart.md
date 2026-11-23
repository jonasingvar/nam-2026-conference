# Quickstart — from an idea to a deployed change

## The product harness: a conversation to tickets

In Claude Code, in this repository: `/create-tasks <what you want>` writes one
GitHub issue with a **Done when** list; `/winnow <transcript>` sorts a meeting
into decisions (recorded in `context/`) and tickets. Try
`/winnow context/winnow-transcripts/demo-transcript.txt`.

## The engineering harness: a ticket to production

1. **Label the issue `ready-for-ai`** — or comment `/ship` on it (`/ship --fast`,
   `--small` or `--full` to choose the size yourself; otherwise Jev chooses).
2. **Watch the issue.** One comment fills in as it goes: the size and why, the
   branch and spec, each gate and audit round, the spend.
3. **Review the pull request.** It has the spec, the proof, the audit rounds,
   a link to its Vercel preview, and the review and QA verdicts. Ask for a
   change with `@claude …` on the PR.
4. **Merge it.** The run wakes up, waits for the production deployment, and
   checks `/api/health` — the issue says when it is live.

A ticket that cannot converge comes back as a **draft** pull request labelled
`needs-human`, with what is still open written down.
