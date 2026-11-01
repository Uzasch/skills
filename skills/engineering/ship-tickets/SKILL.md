---
name: ship-tickets
description: Use when handed a set of tickets from /to-tickets (issue numbers or `.scratch/<slug>/issues/` files) to build end to end in one run — several tickets, some blocked by others, needing build, a per-ticket app check (runs right), a cross-ticket walk in the running app, and an independent two-reviewer review (Codex on Spec, agy on Standards) of the whole branch.
argument-hint: "<issue #s | .scratch/<slug>/issues/> [--decide] [--rounds N] [--spec-reviewer codex|claude|agy] [--standards-reviewer agy|codex|claude] [--reviewer <both>] [--reviewer-model <id>] [--no-codex-runs]"
disable-model-invocation: true
---

Plan the whole run on paper first, then hand every piece of hands-on work to fresh subagents and read
only what they report back. Build tickets in dependency waves; every ticket's tests must fail
without its change (the closer proves it), and every ticket a user can see is **run right** by a
verifier driving the real app. The code is **read** once, over the whole branch, by the independent
review loop — Codex on Spec and agy on Standards, in parallel. Only risk-tier tickets also get a
per-ticket reader (agy `gemini-3.8-flash-high`; Claude if agy is down). The user gets an artifact with screenshots.

**Why no per-ticket Claude reviewers:** each fresh agent re-reads the repo rules, the ticket and the
code, so a reviewer, a fixer and a re-reviewer per ticket was most of the run's tokens — and the
whole-branch loop reads the same code again with a different model. One read, by the independent
reviewers, is the cheaper and stronger check.

## You are the orchestrator — the hard line

Your context is the scarcest thing in the run. Every file you open, test you run or diff you read
stays in it for the rest of the run.

| You may | You may not (hand it to an agent) |
|---|---|
| read `CLAUDE.md` / `AGENTS.md`, the tickets (`gh issue view N --json title,body,comments < /dev/null`) | Read / Grep / graft source files |
| write `$RUN/*.md` — the plan, briefs, findings | run tests, suites, linters, typecheck, builds |
| launch Agent / Workflow, read their **structured reports** | start servers, run Playwright, query databases |
| decide triage verdicts from those reports | edit source, even one line |
| `git status`, `git log --oneline`, create the branch | read a diff hunk to "just check" |
| talk to the user | reproduce a finding yourself |

A report too thin to decide on → send a fresh agent a sharper question; never go look yourself. This
overrides any line in `review-loop` that says *you* read, run, reproduce or fix — in this skill those
are agent jobs.

**Caveman style for every report and every message to the user**: drop articles, filler, hedging;
fragments fine; keep uncertainty and evidence explicit, drop only filler; code, paths, commands, errors exact. Full sentences only for warnings and decisions
the user must make. Put that line in every brief.

**Models — Sonnet wherever it can do the job.** Sonnet 5.5 is a strong coding agent and much
cheaper and faster; you (the orchestrator) are usually Opus, and every agent inherits your model
unless told otherwise. So set `model` on **every** agent and workflow call. Default `sonnet`: scout,
gate, baseline, closer, builder, fixer, triage, verifier, artifact. Use `opus` only when the step is
genuinely hard and you write the reason into `orchestration.md`. No fixed cap on Opus agents
(`../shared/models.md` Routing); a usage limit that kills an agent mid-wave is handled by its `wip:` commit:

- a ticket touching sign-in, permissions, money, concurrency / race windows, or live publishing —
  its builder (`build_model: opus`); its per-ticket reviewers are agy; its fixer is Opus too (`fix_model: opus`, the floor
  covers builder and fixer)
- a ticket a Sonnet builder or fixer already failed twice
- a design call across many files the gate couldn't settle

**Briefs point, they don't paste.** A brief names the files to read (`$RUN/issue-<n>.md`, its
`gate.md` rows, ADR paths, `CLAUDE.md`) instead of copying them in; it pastes only what an agent
cannot find on disk (a prior agent's findings, a red output).

Effort (Workflow `agent()` and Agent take `effort`): builders, closers, verifiers, artifact —
`medium`; fixers, risk-tier tickets — `high`; `xhigh`/`max` only when a run
showed it was needed. Model per role: `build_model`, `review_model`, `fix_model`, each falling back to
`model`, then `sonnet` (`../shared/models.md`). An agent that dies on a usage limit leaves its diff: commit it as
`wip: <ticket> (agent stopped: usage limit)` before relaunching, and the next agent's brief names that
commit. A Sonnet agent that stops early with work left: re-prompt it naming the open
items (max 2), before escalating to Opus.

Runs end to end. Stops only for: a gate `SKIP`, a sign-in the user must do, a `blocked` ticket
nothing else can unblock, a review deadlock.

**`--decide`** (set by `work`'s punch-list lane, or by the user): the user makes no calls and is
not asked anything. A gate `SKIP`, proposed seams, a measured number that differs from the ticket, a
review deadlock and a `todo.md` line marked `ask user` are **decided by you**: pick the answer the
ADRs, `CODING_STANDARDS.md` and the code best support, write one row per decision to
`$RUN/decisions.tsv` (what, the choice, why, how to undo), carry on, and list them under *Decisions I
made* in the artifact. A **risky** call (data removed or overwritten, live writes, security, money,
publishing, an item marked as the operator's) follows `../shared/risky-calls.md`: a second model
must agree, and a backup is taken before anything is removed. A sign-in the harness refuses is the
only stop. Never merge, deploy, restart a live service or force-push: the run ends at the PR.

## Skills and briefs this uses — reference them, don't copy them

| Step | Source |
|---|---|
| gate + waves | `implement-gate` (this plugin) |
| Workflow scripts | built-in `workflow-authoring` — load before writing a script |
| builder brief | `references/implementer-prompt.md`; builder follows `mattpocock-skills:tdd` at the spec's seams |
| risk-tier reads-right review only | `references/spec-reviewer-prompt.md` and `references/code-quality-reviewer-prompt.md`, run in parallel (→ `references/code-reviewer.md`) |
| runs-right review | `references/verifier-prompt.md`; its screenshot checks `../shared/verify-screens.md` |
| preflight before wave 1 (environment) | `../shared/preflight.md` |
| reading the repo's standards (builder, reviewer, fixer briefs) | `../shared/standards-reading.md` |
| wave scripts | `references/wave.js` (build, + reads-right for risk-tier tickets), `references/close.js` (close + runs-right) |
| independent loop, triage rules, drift report | `review-loop` (this plugin) — call the Skill tool with `review-loop` |

`references/` holds Superpowers' prompts (Jesse Vincent, MIT — `references/LICENSE-superpowers`).
Resolve skill files relative to installed plugins (`~/.claude/plugins/cache/<marketplace>/<plugin>/<ver>/`),
never the project. A missing one → stop and say which.

## Phase 0 — Orchestration plan (the only phase you think in detail)

1. **Branch.** Current branch already merged into trunk (`git merge-base --is-ancestor HEAD
   origin/<trunk>`), or trunk itself, or tracked files dirty → make `issues-<n>-<m>` off
   `origin/<trunk>`, say so in one line. Untracked noise stays. Check no other worktree/branch
   already holds these tickets (`git worktree list`, `git branch`).
2. **Setup**: `REPO`, `BASE` captured before any code, `RUN="$REPO/.review-loop/<slug>"`,
   `/.review-loop/` in `.git/info/exclude`; then `review-loop` *Setup* (reviewer vars + symlinks). Read `CLAUDE.md` / `AGENTS.md`
   for interpreter, test/lint commands, lint baselines, forbidden commands, user-testing doc.
   Note the repo's **verify recipe**: `.claude/skills/verify/SKILL.md` if present (the same file
   Claude's `/verify` reads), else the user-testing doc. Setup links it for Codex too, so Claude
   verifiers and Codex reviewers follow one recipe. None → the first verifier writes it (see
   `verifier-prompt.md`).
3. **Pin the tickets.** `gh issue view N --json title,body,comments < /dev/null` each (a comment may supersede the body) or read
   the ticket files. Blockers on GitHub: `to-tickets` sets them as native links and then omits the
   body's `Blocked by` section, so also read `gh api repos/<owner>/<repo>/issues/N/dependencies/blocked_by
   --jq '.[].number' < /dev/null` and take the union with any `Blocked by` line. Write `$RUN/spec.md`: per ticket
   its criteria and that blocker list, and `$RUN/issue-<n>.md` per ticket. A 0-byte ticket file is a failed fetch — refetch, never build from it.
   Then **preflight** once, before any gate agent: `../shared/preflight.md` (Supabase test branch,
   connector sign-in, test PC, Codex credits, agy approval), one
   Haiku agent → `$RUN/preflight.md`. A `FAIL` it cannot fix → stop before the first wave and say which.
4. **Gate + baseline + touch — three agents, one message.**
   - **Gate agent** (Sonnet): runs `implement-gate` on `$RUN/spec.md` → `$RUN/gate.md` (build /
     reuse / skip per criterion, bundles and waves §3, exclusive glob per bundle), **plus** per ticket its
     *surface* — where a user meets it (page + path, API route, worker, CLI) — and the smallest way
     to drive it, and — only where the spec has no testing decisions for a ticket — proposed seams.
     Returns the bundle + wave table, surfaces and any proposed seams. A ticket without its pasted
     caller/test lists (`implement-gate` §3) → send it back to the gate agent.
   - **Baseline agent** (Sonnet): each full suite once, **one at a time** (parallel suites on one box
     fake timeouts; red → check `uptime`, re-run quiet with fewer workers before believing it), each
     linter and the repo's other pre-push checks (as `AGENTS.md` names them) → `$RUN/baseline.md` with counts. Returns counts only.
   - **Touch agent** (Sonnet): `../shared/touch-fix.md` §1 over the functions the tickets change →
     `$RUN/touch.md` (reuse the `architect` ADR's `docs/adr/touch/NNNN.md` when there is one, and fill `done when` for
     each `fix` row when you copy it), then its
     blocking gate — no wave starts until it passes. Each `fix`
     row becomes a cleanup ticket `T<n>c` (its glob = that unit's file) in the wave before the ticket
     that touches it, built with `../work/playbooks/refactoring.md` steps 1, 4–6; each `file` row goes
     on `$RUN/todo.md` and is solved in this run by a fresh fixer, in its own refactor commits. A row
     that needs a decision only the operator can make → ask the operator; never file an issue.
   `SKIP`, proposed seams or a number mismatch from the gate → stop for the user's yes (one message
   for all); with `--decide`, decide them yourself per the rule above.
5. **Write `$RUN/orchestration.md`** — the run's contract; every later step follows it, and a resumed
   session can pick it up cold:
   - tickets, bundles (`B<n>` → tickets in build order), waves, glob per bundle, what blocks what
   - per ticket: surface + how to drive it (or `no user surface` → no verifier, its tests are the
     check), risk tier (`risk` → it also gets per-ticket readers, agy; the tier comes from
     `../shared/models.md` Routing, floors apply), commit message, and
     its **cost line** from the spec (`../shared/cost.md`), or `none` when it adds no metered call
   - roster: each role → model → brief path → report shape
   - baseline counts; stop conditions; the review loop runs once, at the end, over the whole
     branch — no rounds between waves
   - checkpoint list: after which step the user hears what
6. Print the waves + surfaces in one block. Carry on.

**From here you do no hands-on work.** Every step below is: write brief → launch → read report →
decide.

## Phase 1 — Waves

**Day start.** At the start of each calendar day of the run, before that day's first agent: merge
trunk into the run branch (`git fetch`, `git merge origin/<trunk>`), a fresh agent fixes any conflict
and runs the affected tests. A day-long run that never merges trunk ships a stale branch.

Per wave, two Workflow runs — this skill is the user's opt-in to call the Workflow tool. No Workflow
tool → the same agents via several Agent calls **in one message** for the parallel parts, one at a
time for the serial ones. Never build a wave one bundle at a time.

### 1a. Build — `references/wave.js`, parallel

Write the **brief base** once per run (`$RUN/brief-base.md`) and a single `$RUN/lessons.md` (every
wave's closer and you append lessons to it; no second file); then per bundle write only the deltas,
`$RUN/wave-<k>/<B>-build.md`, from `implementer-prompt.md` (*One base per run*). Builder, fixer and
reviewer read the repo's standards per `../shared/standards-reading.md`. Launch with
`{wave, run, bundles:[{id, tickets, glob, model?, build_model?, review_model?, fix_model?, risk?}], reviewer?}`. One builder per bundle builds its
tickets **in order**, in one session, and reports the files per ticket. That is all for a normal
bundle — its code is read by the review loop in Phase 3. A wave's bundles run in parallel.

**Risk-tier tickets** (`risk: true`: sign-in, permissions, money, concurrency, live publishing) also
get **Spec review and Standards review at the same time → (fresh fixer → fresh re-review) ≤2**: write
`review-spec.md` and `review-quality.md` next to the builds. Waiting for the end is too late for these.
Both reviewers run on agy `gemini-3.8-flash-high`: `wave.js` has a small Sonnet agent run the agy
launch line (`../shared/models.md`) and relay the review. Agy missing or out of usage → the Claude
reviewer at `review_model` (default Sonnet) does it, and the wave result says so (`reviewer:`);
`reviewer: 'claude'` in the args skips agy. An issue that is a choice only the operator can make (kind
`decision for operator`) does **not** block the ticket: `wave.js` appends it to `$RUN/findings.md`.

- **Builder** — fresh, one per bundle. Brief points to each ticket's file; its gate rows (wire every `REUSE`, build no
  `SKIP`); its exclusive glob ("touch anything else → return `blocked` with the path"); test first per
  criterion, red output pasted; **the spec's testing decisions** (which seams, what kind of test,
  where they live) pasted in — `tdd` says to confirm seams with the user, a builder can't, so the
  spec's answers are the confirmation (none in the spec → the gate agent proposes them in
  `gate.md`, you put them to the user in Phase 0); exact commands from `CLAUDE.md`; **only its own test files, never the
  full suite**; **no git write**; caveman. Status `done` / `done_with_concerns` / `needs_context` /
  `blocked`, plus `files_written`, `per_ticket` (ticket → files), `tests_added` (`red_output`),
  `commands` (cmd, exit, tail).
- **Reads-right reviewers** (risk tier only) — two **different** fresh agents that never saw the build, run in
  parallel. Spec template (built what was asked, nothing more or less — read the code, the report is a claim) and
  quality (Standards) template, **plus**: schema change has a migration; old rows / old clients still
  work. Reviews `git diff -- <glob>` + new files in the glob. Read-only; trusts only tests inside its
  glob. Never starts the app — that is the other leg.
- Critical / Important → fresh fixer (builder's brief + issues) → fresh reviewer. Two fix rounds
  (three reviews), then the ticket returns with its open issues. One ticket failing never holds the wave.

### 1b. Close + runs-right — `references/close.js`, serial

Write `$RUN/wave-<k>/close.md` and `$RUN/wave-<k>/verify.md`, launch with the wave's tickets
flattened from its bundles: `{wave, run, tickets:[{id, bundle, glob, fix_model?, skipVerify?}]}`.

- **Closer** (one agent, `close.md`): leak check — `git status --porcelain` vs the union of the wave's
  globs; the **affected test files only** (the wave's own tests plus the tests of every file in its
  globs — the full suites run once, before Phase 2), each linter and the repo's other pre-push checks
  (as `AGENTS.md` names them) as a **delta** vs `baseline.md`; **commit one
  ticket at a time** in bundle order, staged by name from the builder's `per_ticket` files, message
  from `orchestration.md` — when two tickets of a bundle changed the same file, those tickets get
  **one commit** naming all of them (`feat(T3,T5): …`); **red-proof
  replay** per commit — its non-test files back to the pre-wave sha (`git checkout <sha> -- …`, `rm`
  files it created), its new tests must fail, then `git checkout HEAD -- …`. Each red-proof entry is
  marked `new` (a test written for this ticket) or `guard` (an existing test). A `new` test passing
  without the change is dead → listed in `blocking`; a `guard` is expected to stay green and never
  blocks. `leaks` holds file paths outside the globs and nothing else (any entry stops the wave); free
  text goes in `notes`. Never `git commit -a`. Then the touch close check
  (`../shared/touch-fix.md` §3) over this wave's rows; `missed` → listed in `blocking`.
- **Verifier** per ticket with a user surface (`skipVerify: "<why>"` for the rest), fresh, **one at a time** (`verify.md` = `verifier-prompt.md` + the repo's
  user-testing doc path + ports + marker): drives the ticket at its surface on the branch's own API,
  tries to break it (≥1 🔍 probe), cleans up. A ticket with a cost line: measure it per
  `../shared/cost.md` while driving; over the stated rate is a `FAIL`. `FAIL` → fresh fixer commits `fix(T<n> verify): …` →
  fresh verifier. Two fix rounds (three verifier runs). A check that cannot run (no Supabase test
  branch, no sign-in, …) is `BLOCKED` with `blocked_on`: no fix loop, the ticket is not failed, it comes
  back to you in 1c.

### 1c. You, after both runs — decide only

From the two reports: leak or new red → fresh fixer agent with the report; `BLOCKED` verify → read
where it stopped, fix the environment through an agent or ask the user (sign-in); open Critical /
Important or ticket `blocked` / `needs_context` → fresh fixer agent, **serially**, never re-fan.
Its dependants wait; unrelated tickets don't. A `Minor` or verifier finding that is not a FAIL but is
worth doing → `$RUN/todo.md` (the work list, `review-loop`), built by a fresh fixer before Phase 2;
the rest → `$RUN/findings.md`. Never file an issue for it.

Next wave starts from committed, closed, verified work only.

**Fresh orchestrator per wave.** After 1c, write `$RUN/handoff.md` — at most 30 lines: the wave just
closed and its commit shas, tickets open or blocked and why, next wave's bundles (ids and globs),
decisions made, the environment facts the next wave needs (ports, branch names, test PC), and the
pointers `orchestration.md`, `lessons.md`, `findings.md`, `todo.md`. Wave k+1 is run by a fresh
orchestrator that reads only `orchestration.md` and `handoff.md` (a new agent with the same hard
line, or a new session when agents cannot launch agents) and rewrites `handoff.md` when it closes. The
prior orchestrator's context is not carried over; what is not in the file is lost on purpose.

## Phase 2 — Full suites, then the cross-ticket walk

First one closer run with every full suite, one at a time, as a delta vs `baseline.md` — the only
full-suite run before Phase 3. New red → fresh fixer, serially.

No whole-branch code read here — Phase 3's reviewer does that, over `BASE...HEAD`. This phase is
only what no other step does: one fresh verifier (`verifier-prompt.md`) walks the flows that cross
tickets end to end, the order a user would hit them — not each ticket again. A `FAIL` → triage
and fix as in Phase 3, then a fresh verifier on that flow.

## Phase 3 — Independent review loop

Call the Skill tool with `review-loop` — two fresh reviewers every round, in parallel, never
resumed: Spec on `--spec-reviewer` (default `codex`), Standards on `--standards-reviewer` (default
`agy`); `--rounds` default 3, minimum 2. The Spec reviewer runs suites and may drive the branch via the verify recipe (`--no-codex-runs` passes through to turn it off).
With it off, a Codex `needs-run` finding goes to a fresh verifier to run its repro steps before
triage. Round 1 also carries the wave map (`T<n> → files`) and the contracts crossing tickets,
with *"treat inconsistency across tickets as a finding even where each ticket is internally
correct."* Withhold every per-ticket review and builder report. Launching the reviewers and reading both
`handoff.md` files are yours. Triage per `review-loop` §2.3, with one change: steps 0–1 (read cold,
reproduce) are done by a fresh **triage agent** you send the findings to; it returns per finding
*reproduced y/n + evidence*. You decide ACCEPT / REJECT from that — a REJECT only with the
checkable citation `review-loop` §2.3 requires; no citation → ACCEPT. Accepted → one fresh fixer agent,
serially, commits `fix(review r<N>): …`, runs its touched tests; the closer brief runs again for suite
+ lint delta. Fixes that touched a surface → one fresh verifier on that surface before the next round.

## Phase 4 — Artifact

Drift report per `review-loop` *The drift report*, plus: tickets that changed wave (and why), and per ticket
the gap between its builder's self-report, its reviewer's findings and its verifier's verdict.

One Sonnet **artifact agent** (load `artifact-design` if available) gets `orchestration.md`, every
report, the drift report and the screenshot folder, caveman style, for someone who hasn't read the
diff:

- **Top**: tickets shipped / blocked, review rounds and where it landed, anything needing the user.
- **Per ticket**: what it asked, what now exists, what the gate reused or skipped, verifier steps
  in flow order with screenshots (what user does, what user sees), probes and what held, database
  proof (row before → after), issues found and what happened to them.
- **Drift**: built beyond the tickets; decided beyond the ADRs — offer to file those as ADRs.
- **Still open**: unfixed findings and `todo.md` lines marked `ask user`, each as a question for the user.

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
| Blockers read from the body only | Native links first; the body section is omitted when they exist |
| Builder runs full suite | Only its test files; the closer runs the suite |
| Reviewer sees the builder's report as truth | Reviewer reads code; report is a claim |
| Passing tests called "verified" | Verified only after the verifier's PASS, or a `skipVerify` with its reason |
| One builder per small ticket; a `Blocked by` chain over several waves | Bundles (`implement-gate` §3): one builder builds a chain or a shared-file group in order |
| Asking the user every gate question when they said "decide" | `--decide`: decide, log in `decisions.tsv`, carry on |
| Per-ticket Claude reviewer on a normal ticket | Only risk-tier tickets; the review loop reads the rest |
| Full suites every wave | Affected tests per wave; full suites once, Phase 2 |
| Filing an issue for something found mid-run | `$RUN/todo.md`, built this run; ask the user only for a decision |
| Skipping a step because "a later round covers it" | Every step runs; that excuse is the shallow-approval failure |
| Verifier runs tests / imports the function | Drive the surface the user touches |
| Verifiers in parallel | One at a time — shared box, ports, database |
| Verifier PASS with no 🔍 probe | Happy-path replay; send it back |
| Starting wave 2 on unclosed wave 1 | Close + verify first |
| Skipping the Phase 2 walk because every ticket passed | Cross-ticket flows are invisible per ticket |
| Adding a whole-branch code-reading agent | The review loop (Phase 3) already reads `BASE...HEAD`; one read, not two |
| Walk / Codex fixes shipped unreviewed | One more Phase 3 round |
| Screenshots nobody looked at | Verifier checks each against the ticket's words |
