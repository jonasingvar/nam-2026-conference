# Improve the README — the engineering presentation first

## What this changes
The first thing a reader sees becomes two links: **the deployed engineering
presentation**
(`https://nam-2026-conference.vercel.app/engineering-presentation`) — first, the
highlight — and the app it belongs to. Under them, a couple of lines on what the
repo is (a conference app, and the factory that ships it) and the three commands
that run it. That is the whole page, about thirty lines: the `What runs where`
table and the four-step *Ship a ticket* walkthrough duplicate
`context/engineering-context/harness/`, so they go.

Someone who opens the repo on GitHub, or after forking, can see how the harness
works without cloning it — the talk is part of the deployed app, not a slide deck
on a presenter's laptop.

## Where
- `README.md` — the whole file. The hero `<div align="center">` keeps its shape:
  `# ORBIT '26`, the one-line tagline, then the links in this order — the
  engineering presentation, the app, then the factory. Below it one short
  paragraph and a three-line *run it* block. `## ▲ What runs where` and
  `## 🏭 Ship a ticket` are removed; `## 🧑‍💻 Run it locally` keeps the commands and
  loses the prose that repeats `CLAUDE.md`. **Any `/command` left in the copy must
  be a deployed skill or a factory command** — `tests/unit/winnow-pin.test.js`
  reads `README.md` and fails on anything else, so name fewer, not more.
- `tests/unit/readme.test.js` — new: `node:test`, reading `README.md` and
  `src/App.jsx` with `readFileSync` from the repo root. No lane, no clock, no
  browser, nothing from `tests/helpers.js` (that file is Playwright's).
- `src/App.jsx:37` — read, not changed: `path="engineering-presentation"` is the
  route the link has to point at.
- No context doc: `node scripts/context.mjs for README.md` names none — the
  README is unowned, so nothing else is updated.

## How it will be proved
| Done when | Check | Layer |
| --- | --- | --- |
| The engineering presentation is the highlight: the first link in the README, in the hero above the first `##` | `readme.test.js` — "the first link in the hero is the deployed engineering presentation" | unit |
| The deployed app and the presentation are both linked, as absolute https URLs on the production origin | `readme.test.js` — "the hero links the app and the presentation" | unit |
| The link goes somewhere real — its path is a route the app has | `readme.test.js` — "the presentation URL's path is a `path=` in `src/App.jsx`" | unit |
| The README is short — the two links and a little about the repo | `readme.test.js` — "the README is at most 35 lines, with at most 3 `##` sections" | unit |

Each is false on main today: main's first link is the app, it has no
`engineering-presentation` link anywhere, and the file is 49 lines with three
`##` sections. The route's own behaviour — full screen, on the talk's title
without `?beat=` — is already covered by `tests/presentation.spec.js` and is not
re-proved here.

## Decisions
- Cut the `What runs where` table and the *Ship a ticket* steps, leaving the two
  links, a short paragraph and the run-it block (main is 49 lines; target ≈30)?
- Pin "fairly short" to a hard budget of ≤35 lines and ≤3 `##` sections in the
  test, rather than leaving the length to a reviewer's eye (today: 49)?
- Links are absolute production URLs, the presentation ahead of the app and the
  factory kept as a third link — not the repo-relative `/engineering-presentation`,
  which 404s on GitHub, and no mention of `/product-presentation` beyond what the
  tagline already says?
- Add `tests/unit/readme.test.js`, which makes the factory classify this as an
  app change (unit plus the smoke suite on desktop and mobile) rather than a
  docs-only one that runs no tests at all — so the assertions above actually run?

## Out of scope
The presentation's content (`src/pages/PresentationPage.jsx`, the chapters), the
factory and its docs, and any app, server or seed code. Whether production
actually serves the route is not machine-checked — the route is on `main`, which
deploys to production, and the ship run's `/api/health` check is what confirms
production is up.
