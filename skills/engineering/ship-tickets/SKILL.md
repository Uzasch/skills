---
name: ship-tickets
description: Use when handed a set of tickets from /to-tickets (issue numbers or `.scratch/<slug>/issues/` files) to build end to end in one run — several tickets, some blocked by others, needing build, per-ticket review (reads right + runs right), whole-branch review, an independent Codex review, and a check in the running app.
argument-hint: "<issue #s | .scratch/<slug>/issues/> [--rounds N] [--reviewer codex|claude|agy] [--reviewer-model <id>] [--codex-runs]"
disable-model-invocation: true
---

Plan the whole run on paper first, then hand every piece of hands-on work to fresh subagents and read
only what they report back. Build tickets in dependency waves; every ticket passes a two-leg review —
**reads right** (spec + quality reviewers read the code) and **runs right** (a verifier drives the
real app); the branch gets both legs again as a whole, plus the independent Codex loop; the user gets
an artifact with screenshots.

## You are the orchestrator — the hard line

Your context is the scarcest thing in the run. Every file you open, test you run or diff you read
stays in it for the rest of the run.

| You may | You may not (hand it to an agent) |
|---|---|
| read `CLAUDE.md` / `AGENTS.md`, the tickets (`gh issue view N --comments`) | Read / Grep / graft source files |
| write `$RUN/*.md` — the plan, briefs, findings | run tests, suites, linters, typecheck, builds |
| launch Agent / Workflow, read their **structured reports** | start servers, run Playwright, query databases |
| decide triage verdicts from those reports | edit source, even one line |
| `git status`, `git log --oneline`, create the branch | read a diff hunk to "just check" |
| talk to the user | reproduce a finding yourself |

A report too thin to decide on → send a fresh agent a sharper question; never go look yourself. This
overrides any line in `implement-loop` that says *you* read, run, reproduce or fix — in this skill
those are agent jobs.

**Caveman style for every report and every message to the user**: drop articles, filler, hedging;
fragments fine; keep uncertainty and evidence explicit, drop only filler; code, paths, commands, errors exact. Full sentences only for warnings and decisions
the user must make. Put that line in every brief.

**Models — Sonnet wherever it can do the job.** Sonnet 5.5 is a strong coding agent and much
cheaper and faster; you (the orchestrator) are usually Opus, and every agent inherits your model
unless told otherwise. So set `model` on **every** agent and workflow call. Default `sonnet`: scout,
gate, baseline, closer, builder, fixer, triage, verifier, artifact. Use `opus` only when the step is
genuinely hard and you write the reason into `orchestration.md`:

- whole-branch reads-right review (seams across tickets)
- a ticket touching sign-in, permissions, money, concurrency / race windows, or live publishing —
  its builder and its reviewers
- a ticket a Sonnet builder or fixer already failed twice
- a design call across many files the gate couldn't settle

Effort (Workflow `agent()` and Agent take `effort`): builders, closers, verifiers, artifact —
`medium`; fixers, whole-branch reviewer, risk-tier tickets — `high`; `xhigh`/`max` only when a run
showed it was needed. A Sonnet agent that stops early with work left: re-prompt it naming the open
items (max 2), before escalating to Opus.

Runs end to end. Stops only for: a gate `SKIP`, a sign-in the user must do, a `blocked` ticket
nothing else can unblock, a review deadlock.

## Skills and briefs this uses — reference them, don't copy them

| Step | Source |
|---|---|
| gate + waves | `implement-gate` (this plugin; drives `ponytail:ponytail`) |
| Workflow scripts | built-in `workflow-authoring` — load before writing a script |
| builder brief | `references/implementer-prompt.md`; builder follows `mattpocock-skills:tdd` |
| reads-right review | `references/spec-reviewer-prompt.md`, then `references/code-quality-reviewer-prompt.md` (→ `references/code-reviewer.md`) |
| runs-right review | `references/verifier-prompt.md` |
| wave scripts | `references/wave.js` (build + reads-right), `references/close.js` (close + runs-right) |
| whole-branch reads-right | `mattpocock-skills:code-review`, `ponytail:ponytail-review` |
| independent loop, drift report | `implement-loop` Phases 2–3 |
| triage rules | `implement-loop` §2.3 |

`references/` holds Superpowers' prompts (Jesse Vincent, MIT — `references/LICENSE-superpowers`).
Resolve skill files relative to installed plugins (`~/.claude/plugins/cache/<marketplace>/<plugin>/<ver>/`),
never the project. A missing one → stop and say which.

## Phase 0 — Orchestration plan (the only phase you think in detail)

1. **Branch.** Current branch already merged into trunk (`git merge-base --is-ancestor HEAD
   origin/<trunk>`), or trunk itself, or tracked files dirty → make `issues-<n>-<m>` off
   `origin/<trunk>`, say so in one line. Untracked noise stays. Check no other worktree/branch
   already holds these tickets (`git worktree list`, `git branch`).
2. **Setup** as `implement-loop` *Setup*: `SELF_ROOT`, `REPO`, `BASE` captured before any code,
   `RUN="$REPO/.codex-review/<slug>"`, reviewer symlink, git exclude. Read `CLAUDE.md` / `AGENTS.md`
   for interpreter, test/lint commands, lint baselines, forbidden commands, user-testing doc.
   Note the repo's **verify recipe**: `.claude/skills/verify/SKILL.md` if present (the same file
   Claude's `/verify` reads), else the user-testing doc. Setup links it for Codex too, so Claude
   verifiers and Codex reviewers follow one recipe. None → the first verifier writes it (see
   `verifier-prompt.md`).
3. **Pin the tickets.** `gh issue view N --comments` each (a comment may supersede the body) or read
   the ticket files. Write `$RUN/spec.md`: per ticket its criteria and `Blocked by` line verbatim,
   and `$RUN/issue-<n>.md` per ticket.
4. **Scout + gate + baseline — two agents, one message.**
   - **Gate agent** (Sonnet): runs `implement-gate` on `$RUN/spec.md` → `$RUN/gate.md` (build /
     reuse / skip per criterion, waves §3b, exclusive glob per ticket), **plus** per ticket its
     *surface* — where a user meets it (page + path, API route, worker, CLI) — and the smallest way
     to drive it. Returns the wave table and surfaces only.
   - **Baseline agent** (Sonnet): each full suite once, **one at a time** (parallel suites on one box
     fake timeouts; red → check `uptime`, re-run quiet with fewer workers before believing it), each
     linter → `$RUN/baseline.md` with counts. Returns counts only.
   `SKIP` from the gate → stop for the user's yes.
5. **Write `$RUN/orchestration.md`** — the run's contract; every later step follows it, and a resumed
   session can pick it up cold:
   - tickets, waves, glob per ticket, what blocks what
   - per ticket: surface + how to drive it, risk tier (Sonnet / Opus reviewer), commit message
   - roster: each role → model → brief path → report shape
   - baseline counts; stop conditions; where Codex runs (end, and between waves for a big run —
     roughly more than 6 tickets or 3 waves)
   - checkpoint list: after which step the user hears what
6. Print the waves + surfaces in one block. Carry on.

**From here you do no hands-on work.** Every step below is: write brief → launch → read report →
decide.

## Phase 1 — Waves

Per wave, two Workflow runs — this skill is the user's opt-in to call the Workflow tool. No Workflow
tool → the same agents via several Agent calls **in one message** for the parallel parts, one at a
time for the serial ones. Never build a wave one ticket at a time.

### 1a. Build + reads-right — `references/wave.js`, parallel

Write per ticket `$RUN/wave-<k>/<T>-build.md` from `implementer-prompt.md`, plus
`review-spec.md` and `review-quality.md` next to them. Launch with `{wave, run, tickets:[{id, glob}]}`.
Per ticket: **build → spec review → quality review → (fresh fixer → fresh re-review) ≤2**.

- **Builder** — fresh. Brief carries: criteria verbatim; its gate rows (wire every `REUSE`, build no
  `SKIP`); its exclusive glob ("touch anything else → return `blocked` with the path"); test first per
  criterion, red output pasted; exact commands from `CLAUDE.md`; **only its own test files, never the
  full suite**; **no git write**; caveman. Status `done` / `done_with_concerns` / `needs_context` /
  `blocked`, plus `files_written`, `tests_added` (`red_output`), `commands` (cmd, exit, tail).
- **Reads-right reviewer** — a **different** fresh agent that never saw the build. Spec template
  first (built what was asked, nothing more or less — read the code, the report is a claim), quality
  template only if that passes, **plus**: schema change has a migration; old rows / old clients still
  work. Reviews `git diff -- <glob>` + new files in the glob. Read-only; trusts only tests inside its
  glob. Never starts the app — that is the other leg.
- Critical / Important → fresh fixer (builder's brief + issues) → fresh reviewer. Two rounds, then
  the ticket returns with its open issues. One ticket failing never holds the wave.

### 1b. Close + runs-right — `references/close.js`, serial

Write `$RUN/wave-<k>/close.md` and `$RUN/wave-<k>/verify.md`, launch with the same args.

- **Closer** (one agent, `close.md`): leak check — `git status --porcelain` vs the union of the wave's
  globs; full suites one at a time and each linter as a **delta** vs `baseline.md`; **commit one
  ticket at a time** in ticket order, staged by glob, message from `orchestration.md`; **red-proof
  replay** per ticket — its non-test files back to the pre-wave sha (`git checkout <sha> -- …`, `rm`
  files it created), its new tests must fail, then `git checkout HEAD -- …`. A test passing without the
  change is dead → listed in `blocking`. Never `git commit -a`.
- **Verifier** per ticket, fresh, **one at a time** (`verify.md` = `verifier-prompt.md` + the repo's
  user-testing doc path + ports + marker): drives the ticket at its surface on the branch's own API,
  tries to break it (≥1 🔍 probe), cleans up. `FAIL` → fresh fixer commits `fix(T<n> verify): …` →
  fresh verifier. Two rounds.

### 1c. You, after both runs — decide only

From the two reports: leak or new red → fresh fixer agent with the report; `BLOCKED` verify → read
where it stopped, fix the environment through an agent or ask the user (sign-in); open Critical /
Important or ticket `blocked` / `needs_context` → fresh fixer agent, **serially**, never re-fan.
Its dependants wait; unrelated tickets don't. `Minor` and every verifier finding that is not a FAIL →
`$RUN/findings.md`. Big run → one Codex round now on the wave's commits (Phase 3 rules).

Next wave starts from committed, closed, verified work only.

## Phase 2 — Whole-branch review, both legs

One Opus agent, fresh, **reads right** over `BASE...HEAD` — it wrote none of it and neither did you.
Brief: hunt what per-ticket reviewers can't see — **seams between tickets** (one name, two meanings; a
contract changed in T1 read the old way in T3; duplicated helpers two builders each wrote) and every
`Minor` in `$RUN/findings.md` re-read against its ticket's own words (a per-ticket reviewer can
under-rate a real gap). Then it applies both `mattpocock-skills:code-review` and `ponytail:ponytail-review`
checklists itself, in one pass over the range; no nested sub-agents. Returns findings `file:line — what — scenario`.

Then **runs right** on the whole: one fresh verifier (`verifier-prompt.md`) walks the flows that
cross tickets end to end — the order a user would hit them — not each ticket again.

Triage per `implement-loop` §2.3, with one change: steps 0–1 (read cold, reproduce) are done by a
fresh **triage agent** you send the findings to; it returns per finding *reproduced y/n + evidence*.
You decide ACCEPT / REJECT from that. Accepted → one fresh fixer agent, serially, commits
`fix(self-review): …`, runs its touched tests; the closer brief runs again for suite + lint delta.

## Phase 3 — Independent review loop

`implement-loop` Phase 2 — fresh reviewer every round, never resumed, `--reviewer` default `codex`,
min 2 rounds. `--codex-runs` passes through: Codex may drive the branch via the verify recipe.
Without it, a Codex `needs-run` finding goes to a fresh verifier to run its repro steps before
triage. Round 1 also carries the wave map (`T<n> → files`) and the contracts crossing tickets,
with *"treat inconsistency across tickets as a finding even where each ticket is internally
correct."* Withhold every per-ticket review and builder report. Launching the reviewer and reading
`handoff.md` are yours; triage and fixes go through agents exactly as in Phase 2. Fixes that touched
a surface → one fresh verifier on that surface before the next round.

## Phase 4 — Artifact

Drift report per `implement-loop` Phase 3, plus: tickets that changed wave (and why), and per ticket
the gap between its builder's self-report, its reviewer's findings and its verifier's verdict.

One Sonnet **artifact agent** (load `artifact-design` if available) gets `orchestration.md`, every
report, the drift report and the screenshot folder, caveman style, for someone who hasn't read the
diff:

- **Top**: tickets shipped / blocked, review rounds and where it landed, anything needing the user.
- **Per ticket**: what it asked, what now exists, what the gate reused or skipped, verifier steps
  in flow order with screenshots (what user does, what user sees), probes and what held, database
  proof (row before → after), issues found and what happened to them.
- **Drift**: built beyond the tickets; decided beyond the ADRs — offer to file those as ADRs.
- **Still open**: unfixed findings, deferred items with issue numbers.

Final chat message: three lines and the artifact link.

## Sign-in and the walk

Verifiers run sign-in and the walk themselves — sign-in lives in the same browser session, so it is
part of the walk script. Script at a short path (`/tmp/claude-<uid>/walk-<T>.mjs`). Only if the
harness **refuses** it (auto mode refuses credential-shaped scripts) does the verifier return
`BLOCKED` with that path; you hand the user one line, `!node /tmp/claude-<uid>/walk-<T>.mjs`, then a
fresh verifier reads its output and screenshots. Never type credentials into chat, never script around
a refusal. Never click an answer that does real work on shared services.

## Common mistakes

| Mistake | Fix |
|---|---|
| Launching agents before `orchestration.md` exists | Plan first; it is the run's contract |
| You read a diff / run a suite "just to check" | Fresh agent with a sharper question |
| You fix a finding by hand, even one line | Fresh fixer agent, serially |
| Waves from `Blocked by` alone | Gate's file-overlap check moves tickets |
| Builder runs full suite | Only its test files; the closer runs the suite |
| Reviewer sees the builder's report as truth | Reviewer reads code; report is a claim |
| Reads-right pass called "reviewed" | Ticket is reviewed only after the verifier's PASS too |
| Verifier runs tests / imports the function | Drive the surface the user touches |
| Verifiers in parallel | One at a time — shared box, ports, database |
| Verifier PASS with no 🔍 probe | Happy-path replay; send it back |
| Starting wave 2 on unclosed wave 1 | Close + verify first |
| Skipping Phase 2 because every ticket passed | Cross-ticket defects are invisible per ticket |
| Walk / Codex fixes shipped unreviewed | One more Phase 3 round |
| Screenshots nobody looked at | Verifier checks each against the ticket's words |
