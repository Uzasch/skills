---
name: review-loop
description: "The independent review loop that ship-tickets and work end with: two fresh reviewers each round, in parallel, one per axis — Spec (Codex by default) and Standards (Google Antigravity's agy by default; Claude also possible) — review BASE...HEAD, every finding is triaged against the ADRs and the issue, accepted ones are fixed, and the loop repeats until both approve or the round cap is hit. Then the drift report. Use only when one of those two skills calls for it."
---

The caller has already implemented and committed the work. This skill reviews it. The caller passes
`$RUN/spec.md` and the arguments below, and may add round-1 facts (a wave map) and say who does the
triage legwork; where it does, its words win over this file.

## Setup

Arguments:

- `--rounds N` — max review rounds. Default **3**, minimum **2** (see *Exit conditions*).
- `--spec-reviewer <backend>` — reviewer for the **Spec** axis: `codex` (**default**), `claude`, or
  `agy`. The Spec reviewer also hunts correctness bugs and may run tests and drive the branch.
- `--standards-reviewer <backend>` — reviewer for the **Standards** axis: `agy` (**default**),
  `codex`, or `claude`. It reads and runs linters only — no suite, no server.
- `--reviewer <backend>` — shorthand: sets both. Any other backend value → stop and ask.
- `--spec-model <id>`, `--standards-model <id>` (`--reviewer-model <id>` sets both) — passed
  **verbatim** to that backend's own selector; omitted = the backend's default. `codex`: any
  `codex -m` id (`/model` in `codex` lists them). `claude`: a bare `sonnet` | `opus` | `haiku` |
  `fable`, never a version; default `sonnet`. `agy`: a complete id from `agy models`, effort suffix
  included (e.g. `gemini-3.7-flash-medium`) — §2.2 passes no `--effort`.
- `--no-codex-runs` — turns off Codex's sandbox network (below).

Why two reviewers: a change can pass one axis and fail the other, and one reviewer doing both lets
the axis it finds easier crowd out the other. Two models also see different things. `agy` not
installed (`command -v agy` fails) → that axis falls back to `codex`; say so in one line.

```bash
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
BASE=<the caller's BASE, else the commit the work started from: git merge-base HEAD origin/<trunk>>
RUN="${RUN:-$REPO/.review-loop/<slug>}"; mkdir -p "$RUN"   # <slug> = issue numbers or task name
SELF_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/uzasch-skills/*/ 2>/dev/null | sort -V | tail -1)}"
SPEC_REVIEWER=<--spec-reviewer, else --reviewer, else "codex">
STANDARDS_REVIEWER=<--standards-reviewer, else --reviewer, else "agy">
SPEC_MODEL=<--spec-model, else --reviewer-model, else "">            # "" = the backend's default
STANDARDS_MODEL=<--standards-model, else --reviewer-model, else "">  # passed verbatim
CODEX_RUNS=<"" if --no-codex-runs, else "1">  # codex only: sandbox network on (default), so it can run suites and drive the branch
REVIEWER_BRIEF="${SELF_ROOT%/}/skills/engineering/review-loop/codex-skill"
```

Everything the loop reviews is `BASE...HEAD`. Add `/.review-loop/` to `.git/info/exclude`, never
`.gitignore`.

Network is on by default so Codex can run suites on a remote test runner (ssh) and keep the main box free. `--no-codex-runs` turns it off; its findings are then static reads marked `needs-run`.

**When either reviewer is `codex`**, publish the Codex-side reviewer so `codex` finds it by name
(idempotent). For `claude` / `agy` this is skipped — §2.1 pastes the brief into the round prompt
instead, since neither has a skill to discover.

```bash
mkdir -p ~/.codex/skills
ln -sfn "$REVIEWER_BRIEF" ~/.codex/skills/code-review-codex-loop
test -r ~/.codex/skills/code-review-codex-loop/SKILL.md   # must pass before any review round
```

**Share the repo's verify recipe with Codex.** When the repo has a project `verify` skill (Claude's
`/verify` reads and writes it at `.claude/skills/verify/SKILL.md`), link the same file so both
reviewers use one recipe — never a Codex copy:

```bash
V="$REPO/.claude/skills/verify"
[ -r "$V/SKILL.md" ] && ln -sfn "$(readlink -f "$V")" ~/.codex/skills/verify
```

## The review loop

"Codex" throughout this skill is shorthand for whichever reviewer an axis runs on — `codex`,
`claude`, or `agy`. Every round runs **two reviewers in parallel**, one per axis: `spec` on
`$SPEC_REVIEWER`, `standards` on `$STANDARDS_REVIEWER`. Triage, `findings.md`, fixes, and exit
conditions are identical for all backends; only §2.1's prompt header and §2.2's launch branch on
the backend.

Each round is a directory with one sub-directory per axis, and five steps:

```bash
N=01                       # round number, zero-padded
DIR="$RUN/round-$N"
mkdir -p "$DIR/spec" "$DIR/standards"
# per axis: AX=spec  BACKEND=$SPEC_REVIEWER       MODEL=$SPEC_MODEL       ID=SP
#           AX=standards BACKEND=$STANDARDS_REVIEWER MODEL=$STANDARDS_MODEL ID=ST
```

Finding ids carry the axis so the two lists never collide: Spec findings are `SP1, SP2…`,
Standards findings `ST1, ST2…`, numbered on across rounds.

### 2.1 Write the prompts

Write `$DIR/$AX/prompt.md` for each axis. Its first line after the opening below is the axis:
*"Your axis: **Spec** — skip Step 3 (Standards). Number findings `SP<n>`."* or *"Your axis:
**Standards** — skip Step 4 (Spec) and Step 5 (Correctness); run no suite and start no server.
Number findings `ST<n>`."* How it opens depends on that axis's `BACKEND`:

- **`codex`** — open with exactly this line, and paste nothing from the brief:

  > Use your `code-review-codex-loop` skill for this review.

  It was symlinked into `~/.codex/skills/` during *Setup*, so Codex discovers it by name.

- **`claude` / `agy`** — no skill to discover, so paste the brief in. Open with the contents of
  `$REVIEWER_BRIEF/SKILL.md` under a `# Reviewer brief` heading, then
  `$REVIEWER_BRIEF/references/smell-baseline.md`, and on **rounds 2+** also
  `$REVIEWER_BRIEF/references/loop-protocol.md`, each under its own heading. Then one line: *"The
  resources this brief refers to are included above — do not look for them on disk."*

Everything below the axis line is identical for all backends and both axes. Every Spec prompt also
says: *"start servers only on the port range the repo's `verify` skill gives."*

**Round 1** gives each reviewer this and only this:

- The goal and the full acceptance criteria (`$RUN/spec.md`).
- The exact SHAs: `git diff <BASE>...<HEAD>`, and the commit list.
- Binding constraints: whatever `CLAUDE.md`/`AGENTS.md` records — lint baselines, the interpreter,
  forbidden commands — and the relevant ADR numbers if the repo keeps them. The standards are read per
  `../shared/standards-reading.md`: the repo's index and only the files it names for the diff's areas
  (no index → the whole file); a `claude` / `agy` prompt says so in one line.
- The touch table (`$RUN/touch.md`) and each ticket's cost line, when the caller wrote them. These
  are the plan, not claims that it was done — the reviewer checks them.

**After parallel waves**, round 1 also carries two *structural facts* — not claims, and not
recoverable from the diff: the **wave map** (`T<n> → <files>`), and a **seams list** of every contract
crossing tickets, with the instruction *"treat inconsistency across tickets as a finding
even where each ticket is internally correct."* Two tickets agreeing on a name and disagreeing on its
meaning is the defect class parallel builds manufacture.

Withhold from round 1: every self-review or per-ticket review output, every implementation handoff, all test
claims, and any tentative conclusion. Independence is preserved by withholding the reports, not the
map.

**Rounds 2+** are a fresh reviewer with no memory, so the prompt carries the history:

- `## Prior findings` — the previous round's `handoff.md` **for the same axis**, verbatim.
- `## What changed in response` — per finding of that axis, one line:
  `SP<n> — FIXED in <sha> (<what changed>)` or `SP<n> — REJECTED: <reason> (<citation>)` — the
  citation exactly as §2.3 requires it, quoted, so the reviewer can check it.
- The new commit SHAs and the new `BASE...HEAD` range.
- The instruction to restate every prior finding as `RESOLVED` / `STILL OPEN` / `WITHDRAWN`, then
  re-review the new commits.

Write *"a previous review produced the findings below"*, never *"you reviewed this"*. Telling a
fresh model it did something it cannot recall makes it hedge or invent the missing context. And
state rejections with their reason — omit one and the next reviewer raises it again.

Never edit or re-send a prompt already used. Each round's prompt is immutable.

### 2.2 Launch the reviewers

Every round is **two fresh** reviewers with no memory of the last — round 1 and the final round run
the identical launch. Launch both axes **at the same time** (each command below run in the
background, then `wait` for both); the Standards reviewer starts no server and runs no suite, so
the two never fight over ports or the test runner. Which backend runs is that axis's `BACKEND`.
`${MODEL:+…}` expands to the model flag only when a model was given; otherwise the backend picks
its own default. Below, `D="$DIR/$AX"`.

**A reviewer that dies on a usage limit** (empty handoff, limit message in its log) → relaunch that
axis once on the other external backend (`codex` ↔ `agy`) with the same prompt, and note it in
`findings.md`. Never skip an axis for the round.

Each launch is **unattended by design** — non-interactive, no approval prompts, nothing for the
reviewer or the user to confirm mid-round. Whitelist the launch command (or run the skill in a
permission mode that does not prompt) so the loop runs end to end without stopping for you.

Before any launch, save `ss -ltnp` to `$DIR/listeners-before.txt`.

**Codex credit check, before each round** when either axis is `codex`: one 1-token call
(`echo ok | codex exec -`, a one-word prompt) must exit 0 and reply. It fails (usage or credit
limit) → that axis runs this round on `agy` as under the usage-limit rule above, noted in
`findings.md`; a reviewer that dies mid-round on the limit costs the whole round, this costs one call.
(`../shared/preflight.md` runs the same check once before the run.)

**`BACKEND=codex`:**

```bash
codex exec --json --output-last-message "$D/handoff.md" \
  ${MODEL:+-m "$MODEL"} \
  -s workspace-write -c approval_policy=never -C "$REPO" \
  ${CODEX_RUNS:+-c sandbox_workspace_write.network_access=true} \
  - < "$D/prompt.md" > "$D/events.jsonl"
```

**`BACKEND=agy`:**

```bash
( cd "$REPO" && agy --output-format text --dangerously-skip-permissions --print-timeout 30m \
    ${MODEL:+--model "$MODEL"} \
    -p "$(cat "$D/prompt.md")" ) > "$D/handoff.md" 2> "$D/events.log"
```

`agy` reads the prompt only from the attached `-p` value, not stdin — keep the `$(cat …)`.
`--dangerously-skip-permissions` is what makes the round unattended; the brief still forbids every
edit, and the clean-tree check below is what enforces it. `--print-timeout` defaults to 5m, too
short for a real review — 30m is the floor.

**`BACKEND=claude`:** spawn a **fresh** `general-purpose` agent with the Agent tool — never
`subagent_type: "fork"`, never `SendMessage` to a prior round's agent. Set `model` to
`$MODEL` when given (`sonnet` otherwise). The agent's entire prompt is the contents of
`$D/prompt.md` plus one instruction: *"Review only — never edit, stage, or commit anything. Write
your final message, verbatim in the required shape, to `$D/handoff.md`."* A fresh
`general-purpose` agent does not inherit this session's context — that is what keeps it independent,
the same reason Codex runs unresumed.

**Never resume a reviewer** (`codex exec resume`, `agy --continue` / `--conversation`, `SendMessage`
to a prior agent). A resumed reviewer carries prior reasoning as hidden state you cannot inspect or
correct; a fresh one with the history in `prompt.md` costs only a re-read of the diff and gives you
inputs you can see.

After both reviewers, **confirm the worktree is clean** (`git status --porcelain`). `workspace-write` /
`--dangerously-skip-permissions` exist so repo checks can write their normal temporary output, not
so the reviewer can edit — revert anything it touched and note it.

Then stop what the round left running. Print `ss -ltnp` again next to `$DIR/listeners-before.txt`;
stop only the PIDs that are new since the before-list and
listen inside the port range the repo's `verify` skill gives (the PIDs this round started). Never
stop a PID whose `ps -o unit= -p <pid>` names a `.service` (the live API and workers run from the main
checkout, so a match on working folder would stop them), and never touch another worktree's ports.

Each axis's `handoff.md` is its verdict and normally the only file you read. Open its raw log —
`events.jsonl` (codex), `events.log` (agy), or the agent's returned report (claude) — only when
the handoff is empty or truncated. An empty handoff is a failed round — never fabricate one.

### 2.3 Triage every finding — this is the step that matters

Both handoffs are sets of **claims**. Nothing in them changes the code until you have checked it.
Triage the two lists together (one finding may appear on both axes — treat it once, keep both ids).
For each finding, in order:

0. **If you did not personally write that code** (agents built it), read the cited hunk **and the
   function around it** cold from the repository before forming any verdict. You have no memory of
   this code to judge from.
1. **Reproduce it.** Read the cited `file:line`. Run the cited command yourself. A finding you
   cannot reproduce is `REJECTED: not reproducible` — say what you observed instead.
2. **Check it against the ADRs.** Grep `docs/adr/`. A finding asking you to undo a live ADR is
   `REJECTED` citing that ADR number and the section — Codex has not read the argument behind it.
   If the finding reveals the ADR itself is wrong, add a line to `$RUN/todo.md` and put it to the
   user in the final report; the ADR is theirs to change.
3. **Check it against the issue.** A finding demanding behaviour the issue did not ask for is
   `REJECTED: out of scope`, quoting the spec line that bounds the scope. Worth doing anyway → it
   is not deferred to anyone: add it to `$RUN/todo.md` (see *The work list*) and it is built in this
   run. An open issue that already owns exactly this work (e.g. a planned later step) → link it in
   `findings.md`, nothing more. Never `gh issue create`.
4. **Check it is used.** A finding asking for more machinery — "handle properly", a new option, a
   wider API — grep for a real caller first. None → `REJECTED: nothing uses it (YAGNI)`, naming the
   grep.
5. **Check it against the project rules.** Where the repo records a pre-existing lint baseline, a
   finding demanding a clean run of that linter — or a fix in a file this ticket does not touch — is
   `REJECTED`, citing the baseline.
6. Otherwise: **ACCEPT**.

**A rejection must carry a citation the reviewer can check.** One of: an ADR number and section,
the quoted spec / issue line, a project rule at `file:line`, or the command you ran and its output.
"By design", "intentional", "acceptable", "known limitation", "pre-existing", "covered later" with
no such citation is not a rejection — the finding is **ACCEPTED**. Never reject a finding, or skip
a review or check step, because a later round, a later wave, or the other axis "will cover it".
The reviewer is told to keep any rejection without a real citation `STILL OPEN`, so an excuse only
costs a round.

Append every verdict to `$RUN/findings.md`, one line each:

```text
SP3 | r1 | REJECTED | asks to undo ADR 0041 §2 (bucket stock never feeds cadence)
ST4 | r1 | ACCEPTED | fixed in a1b2c3d
SP5 | r1 | TODO     | todo.md #2 — not asked, worth doing; built this run
```

That file is the loop's only durable state, and it is load-bearing: the rejection reason you write
goes back to Codex verbatim next round, so write it to settle the point. Do not grow a schema around
it.

A `suggestion` never blocks; take it only if cheap and clearly right.

### 2.4 Fix, verify, commit

Implement every ACCEPTED finding — blocking first, simple next, complex last, then the open
`todo.md` lines. Nothing else — no cleanups that are in neither list.

**Fix rounds are serial, always — never fan out a fix round.** Accepted findings land wherever the
defect is, so disjoint ownership no longer holds; and the `FIXED in <sha>` line you send Codex has
to be one you wrote, with nothing unread between it and the diff Codex re-verifies.

Typecheck and run the touched tests as you go; run the full suite before committing. Read each
linter as a **delta**: where `CLAUDE.md` records a baseline, your work is clean when it adds no new
rule and no new count — not when the run is green. Honour any command the repo forbids; some build
steps overwrite an artefact that is actually being served.

Commit with the round in the message (`fix(review r2): …`).

### The work list — `$RUN/todo.md`

Work found during the run that is worth doing but is not an accepted finding goes here, not into
a GitHub issue: an out-of-scope finding worth doing, a `minor` or `suggestion` you agree with,
code the change left unused, a touch row bigger than one step. One line each:

```text
#2 | SP5 r1 | rename the second resolve_path twin and delete it | open
#3 | ST2 r1 | old load_rows() has no caller left               | done 4f1e2a9
#4 | SP7 r2 | ADR 0041 §3 contradicts the new cadence rule      | ask user
```

After the round's accepted fixes, the same serial fixer builds the `open` lines, one commit each
(`chore(todo #2): …`), and the next round reviews them like any other commit. Only a line that
needs a decision only the user can make stays `ask user`, and the final report asks it. Nothing in
this list is filed as an issue.

### 2.5 Exit conditions

Continue to the next round unless one fires:

- **Approved.** **Both** axes' last line is `VERDICT: APPROVED` in the same round, you have no
  accepted finding still unfixed, `$RUN/todo.md` has no open line, and at least **2** rounds have
  run. Both axes run every round, even one that approved last round — a fix for one axis can break
  the other. A round-1 approval is not enough: run one more telling each reviewer what changed, so
  it approves the final state rather than the state it first saw. **One exception — skip round 2
  only when all of these hold:** both axes' round-1 verdict is `VERDICT: APPROVED`, no finding is open
  or accepted-unfixed, `$RUN/todo.md` is empty, and `HEAD` is the same commit the round-1 reviewers
  saw (nothing was committed after round 1 started — no fix, no `todo` commit). Any commit since →
  round 2 runs as above. Both axes still run every round that does run.
- **Round cap.** `--rounds N` reached. Stop and report the still-open findings.
- **Deadlock.** Codex re-raises a finding you already rejected on a cited ADR or scope ground, a
  second time, with no new evidence. Stop and put the disagreement to the user with both positions
  and the citation.
- **Blocked.** A reviewer reports `Status: blocked`, or a finding needs a decision only the user
  can make — ask the user; do not file it.

Between rounds, do not reset, rebase, or squash — Codex reviews a moving HEAD off a fixed `BASE`,
and rewriting history under it invalidates every SHA you have sent.

## The drift report (always, even when nothing drifted)

Walk the **whole** final diff one file at a time and sort every change into three buckets. The diff
is the source of truth, not your memory of what you meant to do — over five rounds, work accretes.

```bash
git diff BASE...HEAD --stat
git diff BASE...HEAD
```

1. **Asked for** — quote the acceptance criterion it satisfies.
2. **Outside the issue** — nobody asked for it. Mostly accepted Codex findings, the rest things you
   decided to do while in there: an extracted helper, an adjacent bug, a rename, a config touched.
3. **Outside the ADRs** — it settles something `docs/adr/` does not cover, or departs from one that
   does. Grep per subsystem; don't assume from memory. A change can be in both 2 and 3.

Bucket 3 bites later. A decision that never became an ADR is one the next agent cannot find, and a
departure from a live ADR silently makes the ADR wrong. For each, say which: **new ground** or
**departs from ADR NNNN**. Then say whether it still stands or you would take it back, and offer to
file the bucket-3 items as ADR follow-ups. When an existing ADR already decides the area, the
follow-up amends it: a new numbered section plus an "Amended <date> (issue #N)" line under Status. A new
ADR only when none is its home.

**After parallel waves**, add one line: the gap between what builders self-reported as `unresolved`
and what bucket 2 actually turned up. Anything in bucket 2 no builder declared is *"unattributed —
surfaced by the diff, not self-reported."* That rates the build itself.
