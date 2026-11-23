<!--
The rules a code review follows. Not a command: the factory's `review`
workflow (factory/workflows/review.ts) points its lens agents at the numbered
sections here. The workflow owns the structure — which lenses, the skeptic,
the comment's shape, the marker and the commit status (§5–§6) — so where this
says "you" write the comment or the verdict, the workflow does it for you.
-->

# Review a pull request

You did not write this and have not seen the reasoning that produced it. That
is the point: the agent that built it cannot see its own misreading.

**The default outcome is approve with comments.** Review here runs the way it
does in large engineering organisations: what you find are suggestions the
author can take or leave, and **blocking is rare** — the exception for
something serious that you have *demonstrated*. In the words of the person
who owns this repo: *"the blocker should be a serious thing. It shouldn't just
be like a nitpick, like oh it doesn't work exactly like that. It should really
be serious."* A red check for a finding that turns out not to matter costs
more than the finding was worth: it teaches people to ignore the check.

**You comment. A human merges.** Nothing you do blocks a merge.

**Your verdict is a file** — one line in `/tmp/review-verdict`, nothing else is
read. A verdict written only in prose leaves the check reading *unproven*.

## 1. Form your own view first

Read, in this order:

```bash
gh issue view <issue> --json number,title,body      # the whole body
gh pr diff <pr>
```

Then the branch's `specs/` file, the parts of `CLAUDE.md` the diff touches, and
the `context/engineering-context/` docs that own the changed files
(`node scripts/context.mjs for $(git diff --name-only origin/main...HEAD)`) —
they say how the area works, so you read source only to check a line.
Work out for yourself whether each **Done when:** criterion is met.

**Only then** read the conversation:

```bash
gh api repos/{owner}/{repo}/issues/<pr>/comments --jq '.[] | "\(.user.login): \(.body)"'
```

In that order deliberately. A stated opinion in a thread pulls a reader
towards it, so form your own read before you are exposed to one. Then
reconcile: **a human who said "drop that button, the nav covers it" has
amended the ticket**, and the diff should follow them. What still deserves
raising is a pull request that would close an issue it no longer satisfies.

## 2. Flag only these

- **A Done-when criterion that is not met** — the code does not do it. Quote
  the criterion, and show what should satisfy it and does not. A criterion the
  code meets but no test proves is a *test gap*, below.
- **A CLAUDE.md decision contradicted.** Quote the rule exactly, and the line
  that breaks it. This repo records what was tried and rejected — one action
  rather than bookmark-plus-reserve, no invented external links, no map
  coordinates, nothing claiming to be true that is not.
- **A logic error.** Name an input and the wrong output it produces. Not "this
  looks wrong".
- **A test gap** — a test that proves nothing (it asserts the implementation
  against itself, or would pass before the change), or a criterion no test
  pins. **Never a blocker**: the app works or it does not, and a test gap says
  only that the suite would not notice. It is *worth a look*, and on a ship
  run the fixer tightens it as polish.

The harness is code too, and reviewed as such — the workflow picks these
lenses when the diff touches it:

- **A GitHub Actions defect.** A trigger that cannot fire as intended, an
  `if:` that is wrong for a concrete payload (say which), untrusted text
  reaching a `run:` script or an agent with a token, a permission or token
  broader than the step needs. `context/engineering-context/harness/github.md` is what this repo
  already learned; contradicting it is a finding.
- **A doc that is false** — the workflow does not let it block working code: on a branch of this repository it asks respond to fix the doc on the pull request (docs only) and says so in the comment; on a fork's it is listed for the author. CLAUDE.md, `context/engineering-context/` and the playbooks are
  read *instead of* the code. A claim the code does not bear out, two docs that
  now disagree, or an instruction an agent would follow into a wrong action.
- **An orchestration defect.** A workflow path where a dead agent reads as a
  pass, an unbounded loop, agents sharing a worktree or port at once, a
  prompt contradicting the playbook section it cites.

Every finding cites `file:line`, read from the line. Never inferred from a
name, a docstring, or what a function sounds like it does.

**A blocker is serious, present and demonstrated.** Serious: wrong behaviour
a person hits, a crash, lost or corrupted data, a security hole, or a broken
API or contract something else relies on. Present: `how` is the route through
normal use, *with this code, now*, that reaches it — who does what, where —
and `harm` is what that person loses at the end of it; "if the flags are ever
computed from stale data…" is a hypothetical, not a harm. Demonstrated: you
ran the code, a test or a command that shows it happening, and `evidence`
says what you ran and what it printed — an argument from reading is not
enough. Missing any of the three, it is a **follow-up**: worth a look, not a
reason to stop a merge. So is anything that needs an input nobody gives in
normal use — a hand-edited URL, a forged request — and the skeptic will say
`contrived` if you miss it. The workflow demotes a blocker with a blank `how`
or `harm`, and any test gap, itself. A follow-up never turns the check red;
it is listed in the review comment, folded away — never filed as an issue of
its own: a person decides what is worth a ticket.

**Weigh what else is known.** QA probes the pull request on its preview; when
QA passed there, a concern you only reasoned your way to from the diff is a
follow-up unless you can show it happening anyway.

## 3. Never flag these

- Style, naming, formatting, structure, or how you would have written it
- Anything the linter, the type checker or the test suite already catches
- **As a blocker:** a harm only to the test suite — a test that could flake,
  race another under concurrency, or take a lane or fixture it should not.
  Nobody using the app loses anything, the suite and `tests/unit/lanes.test.js`
  are what catch it, and a rerun costs less than a blocking round. It is a
  follow-up. So is a test that does not prove the change (§2, a test gap).
- **As a blocker:** a nitpick — the change works, just not exactly the way you
  would have read the ticket, and nobody is hurt by the difference
- Anything that is only a problem for some inputs, unless you name one
- A bug that is already on `main` — it is not this pull request's doing
- Anything the code, its tests or its spec show was deliberate
- Anything opening "consider", "might want to", "for future reference"
- Praise

**If you are not certain a finding is real, do not post it.** A false positive
costs more than a missed nit, because it teaches people to skim you.

Requirement-conformance is the category you will get wrong most often — it is
easy to read a criterion too literally and call compliant code non-compliant.
Hold it to the highest bar of the four.

## 4. Verify before you post

For each candidate finding, go back to the cited line and check it says what
you claimed. Drop anything that does not survive that. This catches the
failure that matters most here: a confident finding about code that does not
exist.

**At most three findings, each with a confidence.** More than that means you
stopped reviewing and started listing — keep the three that would change a
merge decision. Precision over recall: the workflow drops anything under 0.8
before anyone checks it, and checks at most six per review.

**Every finding faces its own skeptic** — blockers and suggestions alike: a
fresh agent, on a different model, that sees only the claim, the cited line,
the diff and the ticket, never your reasoning, and must demonstrate it by
running, querying or quoting. What it cannot demonstrate is dropped, not
demoted. A claim about a test is executed: mutate the code the test guards
and run it, or query the seed or API it relies on. **A blocker needs extreme
confidence**: its skeptic executed it, and both of you report at least 0.95
(`BLOCK_CONFIDENCE` in `factory/lib/review-policy.ts`); anything less that
was verified is a suggestion.

**People correct you.** A 👎 on a review comment dismisses its blockers;
`/dismiss 2` under it dismisses finding 2. Every review reads those back
across the repository and never raises the same claim again
(`pastDismissals`; the cases that started this are in
`factory/test/fixtures/review-false-positives.json`).

## 4a. On a re-review, look at the delta

A pull request put back to draft and marked ready again is reviewed again —
as a second look, not a first. Your last comment ended with a marker,
`<!-- orbit-verdict:code-review {…} -->`, naming the commit you reviewed, the
blockers you raised and the follow-ups you filed. The workflow reads it back
(its own marker only — QA leaves one on the same thread) and:

- **re-checks each previous blocker** at the new head: resolved means what was
  claimed can no longer happen. One still there stays a blocker, without a
  second skeptic — it survived one already. One that is gone leaves the
  verdict entirely.
- **hunts for new problems only in what was pushed since**, `git diff <that
  commit> <head sha>` — between two named commits, never `HEAD`, which in
  Actions is the merge commit. After a rebase, that diff limited to the files
  the pull request touches. Something outside it is raised only if it would
  have blocked a first review.

**A re-review whose previous blockers are all resolved and whose delta is
clean is a pass.** That is what makes a review converge: a round that fixed
what it was told ends green. A follow-up already filed is listed, not filed
again.

## 5. Comment

One comment. Open with the callout, then at most three short paragraphs. Each
finding is two lines: what breaks, and when.

```markdown
> [!TIP]
> ### Code review · high confidence &nbsp; `●●●`
> Every criterion traced to what satisfies it. 40 lines, one file.
```

| Verdict | Callout | Meter |
| --- | --- | --- |
| pass, high or medium — approved, with any suggestions below | `> [!TIP]` | `●●●` / `●●○` |
| pass, low | `> [!WARNING]` | `●○○` |
| blocker | `> [!CAUTION]` | *none* |

Every blocker sits inside the callout's quote; follow-ups come after it.

No meter on a blocker — the dots measure how much you could judge, and a
defect is not a claim about coverage.

Follow-ups go after the findings, under their own heading — each one line,
with why it is not a blocker — and the workflow ends the comment with the
marker:

```markdown
#### Follow-ups
Not blockers, so they do not colour the check, and none is filed as an issue.

- `src/pages/SchedulePage.jsx:88` a NaN day index renders an empty grid — *only with a hand-edited ?day=*

<!-- orbit-verdict:code-review {"pass":"code-review","commit":"…","blockers":[],"followUps":["logic|src/pages/SchedulePage.jsx|8"]} -->
```

**"Nothing to flag" is a good review**, and the usual correct outcome for work
that passed a green gate. Say it in one line and stop. It should cost you no
more to write than a full one.

```bash
gh pr comment <pr> --body "<the callout, then anything you found>"
```

## 6. Write the verdict

```bash
echo "PASS high every criterion traced to a test I read; 40 lines, one file" > /tmp/review-verdict
echo "PASS low  change is in the seeded PRNG; I cannot tell from the diff what it produces" > /tmp/review-verdict
echo "FAIL closes #12 but its third criterion is not implemented" > /tmp/review-verdict
```

`PASS <high|medium|low> <what you could judge>` or `FAIL <the blocker>`.

Confidence is **how much of this change you could evaluate**, not how sure you
feel about what you read. High means you traced every criterion and the diff
is within what you can reason about from source. Low means you could not
meaningfully review it — generated output, a timing-dependent path, something
you cannot see into — and **publishes as unproven rather than green**, which
says a person should look rather than implying they need not.

A `FAIL` turns the check red and stops nobody merging. It puts a blocker where
someone skimming will see it. Three findings all worth reading and none of
them a blocker is still a `PASS`.

Never approve, never request changes, never merge.
