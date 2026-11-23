<div align="center">

# ORBIT '26

**A conference app built, checked and shipped by agents — all of it on Vercel**

[▶️ The app](https://nam-2026-conference.vercel.app/) · [🏭 The factory](https://nam-2026-factory.vercel.app/)

</div>

A conference companion app — seats, waitlists, clashing sessions, check-in,
ratings and a clock that runs — wired to an AI factory that turns a GitHub
issue into a reviewed, deployed change.

## ▲ What runs where

| | On Vercel |
| --- | --- |
| **The app** | Vite + React, the Express API as one Vercel Function. `main` is production on Turso; every pull request is a preview with its own fresh database. |
| **The factory** | `factory/` — durable **Vercel Workflows** that run **Claude Code in Vercel Sandboxes**, every model call through **AI Gateway**, every ticket sized by **Jev**. |
| **CI** | the factory's `verify` workflow: the whole test suite in a sandbox on every push, as a commit status. |

There are no GitHub Actions and nothing runs on a laptop.

## 🏭 Ship a ticket

1. Write an issue with a **Done when** list — or let `/create-tasks` or
   `/winnow` (Claude Code skills in this repo) write it from a conversation.
2. Label it **`ready-for-ai`**, or comment `/ship` on it.
3. Watch the issue: Jev sizes it, an agent writes the spec, the failing test
   and the change, a machine gate and independent auditors check it, and a
   pull request opens with its Vercel preview, a review and a QA pass that
   tried to break it on the preview.
4. Merge it. The run wakes up and confirms production is healthy.

`@claude …` on the pull request asks for a change; `/review` asks for another look.
How it works: [the factory](context/engineering-context/harness/index.md) ·
[quickstart](context/engineering-context/harness/quickstart.md).

## 🧑‍💻 Run it locally

```bash
npm install
npm run dev      # seed, then API :3001 + web :5173
npm test         # unit + API, seconds
npm run verify   # Playwright, desktop and mobile
```

Everything the code cannot tell you is in [`context/`](context/index.md).
