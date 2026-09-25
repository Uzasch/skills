---
name: ship-tickets
description: Use when handed a set of tickets from /to-tickets (issue numbers or `.scratch/<slug>/issues/` files) to build end to end in one run — several tickets, some blocked by others, needing build, per-ticket review, whole-branch review, an independent Codex review, and a check in the running app.
argument-hint: "<issue #s | .scratch/<slug>/issues/> [--rounds N] [--reviewer codex|claude|agy] [--reviewer-model <id>]"
disable-model-invocation: true
---

Build a set of tickets in dependency waves — parallel builder per ticket, fresh reviewer per ticket
— then review the whole branch yourself, run the independent review loop, check it in the running
app, and hand the user an artifact with screenshots.

**You — this session — are the orchestrator.** You write the briefs, commit, do the whole-branch
review and triage every finding. Subagents build and review single tickets; nothing else.

**Caveman style for every subagent report and every message to the user**: drop articles, filler,
hedging; fragments fine; code, paths, commands, errors exact. Full sentences only for warnings and
decisions the user must make. Put that line in every brief.

Runs end to end. Stops only for: a gate `SKIP`, a sign-in the user must do, a `blocked` ticket
nothing else can unblock, a review deadlock.

## Skills this calls — use them, don't copy them

| Step | Skill |
|---|---|
| gate + waves | `implement-gate` (this plugin; drives `ponytail:ponytail`) |
| parallel waves | built-in `workflow-authoring` — load it before writing the script |
| builder brief | `references/implementer-prompt.md`; builder follows `mattpocock-skills:tdd` |
| per-ticket review | `references/spec-reviewer-prompt.md`, then `references/code-quality-reviewer-prompt.md` (→ `references/code-reviewer.md`) |
| whole-branch review | `mattpocock-skills:code-review`, `ponytail:ponytail-review` |
| independent loop, drift report | `implement-loop` Phases 2–3 — read that file, follow it |
| triage | `implement-loop` §2.3 |

`references/` holds Superpowers' prompts (Jesse Vincent, MIT — `references/LICENSE-superpowers`).

Resolve skill files relative to installed plugins (`~/.claude/plugins/cache/<marketplace>/<plugin>/<ver>/`),
never the project. A missing one → stop and say which.

## Setup

Same as `implement-loop` *Setup* (`SELF_ROOT`, `REPO`, `BASE` captured before any code,
`RUN="$REPO/.codex-review/<slug>"`, reviewer symlink, git exclude, stage by explicit path, never
`git commit -a`). Then read `CLAUDE.md` / `AGENTS.md` for: interpreter, test/lint commands, lint
baselines, forbidden commands, and any user-testing doc (e.g. `docs/agents/*as-a-user*.md`).

**Pin the tickets.** `gh issue view N --comments` each (a comment may supersede the body) or read
the ticket files. Write `$RUN/spec.md`: per ticket its criteria and its `Blocked by` line verbatim.

## Phase 0 — Gate

Invoke `implement-gate` on `$RUN/spec.md` → `$RUN/gate.md`: build / reuse / skip per criterion, and
**waves** (§3b) with an exclusive file glob per ticket. `SKIP` → stop for the user's yes. Print the
waves in one block and carry on.

## Phase 1 — Waves

Per wave, one Workflow run — this skill is the user's opt-in to call the Workflow tool. Load
`workflow-authoring` first; it owns the API. No Workflow tool in this session → launch the wave's
builders as several Agent calls **in one message** (they run concurrently), then their reviewers
the same way. Never fall back to building a wave one ticket at a time. Shape: one
`pipeline` over the wave's tickets, each ticket a chain **build → review → (fix → re-review) ≤2**:

- **Builder** — fresh agent, brief on disk at `$RUN/wave-<k>/<T>-build.md`, built from
  `implementer-prompt.md`. Carries: the ticket's criteria verbatim; its gate rows (wire every
  `REUSE`, build no `SKIP`); its exclusive glob ("touch anything else → return `blocked` with the
  path"); test first per criterion with the red output pasted; the exact commands from `CLAUDE.md`;
  **run only this ticket's test files, never the full suite** (parallel agents share databases,
  ports, remotes); **no git write command**; caveman report. Status: `done` / `done_with_concerns`
  / `needs_context` / `blocked`, plus `files_written`, `tests_added` (with `red_output`),
  `commands` (cmd, exit, tail).
- **Reviewer** — a **different** fresh agent that never saw the build. Brief:
  `spec-reviewer-prompt.md` (built what was asked, nothing more, nothing less — read the code,
  never trust the report), then only if that passes, `code-quality-reviewer-prompt.md`, **plus**:
  schema change has a migration; old rows / old clients still work; each reviewer ends with
  `VERDICT: yes | no | with-fixes` and issues tagged `Critical` / `Important` / `Minor` with
  `file:line`. It reviews `git diff -- <ticket glob>` plus new files in the glob. Read-only.
- `no` / `with-fixes` with Critical or Important → the **same** builder gets the issues, fixes,
  reviewer re-runs. Two fix rounds, then the ticket returns as-is with its open issues.

Don't let one ticket's failure hold its wave: failed tickets return, the rest carry on.

### After each wave — you, alone

1. **Leak check**: `git status --porcelain` vs the union of the wave's globs. Unclaimed path →
   revert or adopt on purpose.
2. Full suite, typecheck, each linter as a **delta** against the recorded baseline.
3. **Commit one ticket at a time** in ticket order: `feat(T<n>): …`, staged by its glob.
4. **Red-proof replay**, per ticket: put its non-test files back to the pre-wave state —
   `git checkout <pre-wave sha> -- <changed files>`, `rm` the files it created — run its new tests
   (each must fail), then `git checkout HEAD -- <all of them>`. A test that passes
   without the change is dead: rewrite it, amend nothing, commit the rewrite.
5. Ticket still `blocked`, `needs_context`, or with an open Critical/Important → build or fix it
   yourself now, serially; never re-fan it. Its dependants wait for it; unrelated tickets don't.
   `Minor` → log to `$RUN/findings.md`, carry on.

Next wave starts from these commits, never from unverified work.

## Phase 2 — Whole-branch review, you

Read every hunk of `BASE...HEAD` yourself — you wrote none of it, so read cold. Hunt what
per-ticket reviewers cannot see: **seams between tickets** — one name, two meanings; a contract
changed in T1 and read the old way in T3; duplicated helpers two builders each wrote. Then run
`mattpocock-skills:code-review` and `ponytail:ponytail-review` over the range. Triage each finding
per `implement-loop` §2.3, fix accepted ones serially, commit `fix(self-review): …`.

## Phase 3 — Independent review loop

`implement-loop` Phase 2 exactly — fresh reviewer session every round, never resumed, `--reviewer`
default `codex`, min 2 rounds. Round 1 also carries the wave map (`T<n> → files`) and the list of
contracts crossing tickets, with *"treat inconsistency across tickets as a finding even where each
ticket is internally correct."* Withhold every per-ticket review and builder report.

## Phase 4 — Check it as a user

Tests prove the pieces; this proves the thing. Follow the repo's user-testing doc when it has one
(ports, sign-in, dummy-data rules, cleanup) — its rules beat anything here. None → backend and
database checks only, and say so.

- **Run the branch**, never the live app: branch API and frontend on spare ports, per the doc.
- **Sign-in**: once per run, **stop and hand the user the exact command** from the doc to run with
  `!`, then continue. Never type credentials, never script around a refusal.
- **Per ticket that changed a page**: drive it with Playwright the way a user would — the path the
  ticket describes, in order — screenshot after each step to `$RUN/walk/<T>-<nn>-<step>.png`, with
  console errors, page errors, `/api/` responses and WebSocket opens logged.
- **Per ticket that changed the backend**: call what the page calls, read the rows it wrote from the
  store (select by id / marker), grep the branch API's log for tracebacks and new warnings.
- **Never click an answer that does real work** on shared services; mark every row you create;
  delete by marker at the end; stop processes by port. Confirm counts are back where they were.

Anything wrong → it is a finding: triage, fix serially, commit `fix(walk): …`, re-walk that step.
A fix after the last review round is unreviewed — run one more Phase 3 round on it.

## Phase 5 — Drift report + artifact

Drift report per `implement-loop` Phase 3, plus: tickets that changed wave (and why), and per
ticket the gap between what its builder self-reported and what its reviewer found.

Then one artifact, caveman style, for someone who has not read the diff (load `artifact-design`
first if available):

- **Top**: tickets shipped / blocked, review rounds and where it landed, anything needing the user.
- **Per ticket**: what it asked, what now exists, what the gate reused or skipped instead, the
  walk screenshots in flow order with one line each (what user does, what user sees), the database
  proof (row before → after), issues found and what happened to them.
- **Drift**: built beyond the tickets; decided beyond the ADRs — offer to file those as ADRs.
- **Still open**: unfixed findings, deferred items with issue numbers.

Final chat message: three lines and the artifact link.

## Common mistakes

| Mistake | Fix |
|---|---|
| Waves from `Blocked by` alone | Gate's file-overlap check moves tickets |
| Builder runs full suite | Only its test files; you run the suite between waves |
| Reviewer sees the builder's report as truth | Reviewer reads code; report is a claim |
| Starting wave 2 on uncommitted wave 1 | Commit + suite first |
| Skipping Phase 2 because every ticket passed review | Cross-ticket defects are invisible per ticket |
| Walk fixes shipped without review | One more Phase 3 round |
| Screenshots without looking at them | Look at every one against the ticket's words |
