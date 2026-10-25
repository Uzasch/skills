---
name: review-loop
description: "The independent review loop that ship-tickets and work end with: a fresh reviewer (Codex by default, or Claude or Google Antigravity's agy) reviews BASE...HEAD each round, every finding is triaged against the ADRs and the issue, accepted ones are fixed, and the loop repeats until the reviewer approves or the round cap is hit. Then the drift report. Use only when one of those two skills calls for it."
---

The caller has already implemented and committed the work. This skill reviews it. The caller passes
`$RUN/spec.md` and the arguments below, and may add round-1 facts (a wave map) and say who does the
triage legwork; where it does, its words win over this file.

## Setup

Arguments:

- `--rounds N` — max review rounds. Default **3**, minimum **2** (see *Exit conditions*).
- `--reviewer <backend>` — `codex` (**default**), `claude`, or `agy`. Any other value → stop and ask.
- `--reviewer-model <id>` — passed **verbatim** to that backend's own selector; omitted = the
  backend's default. `codex`: any `codex -m` id (`/model` in `codex` lists them). `claude`: a bare
  `sonnet` | `opus` | `haiku` | `fable`, never a version; default `sonnet`. `agy`: a complete id from
  `agy models`, effort suffix included (e.g. `gemini-3.7-flash-medium`) — §2.2 passes no `--effort`.
- `--no-codex-runs` — turns off Codex's sandbox network (below).

```bash
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
BASE=<the caller's BASE, else the commit the work started from: git merge-base HEAD origin/<trunk>>
RUN="${RUN:-$REPO/.review-loop/<slug>}"; mkdir -p "$RUN"   # <slug> = issue numbers or task name
SELF_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/uzasch-skills/*/ 2>/dev/null | sort -V | tail -1)}"
REVIEWER=<--reviewer, or "codex">          # codex (default) | claude | agy
REVIEWER_MODEL=<--reviewer-model, or "">   # passed verbatim to the backend; "" = its default
CODEX_RUNS=<"" if --no-codex-runs, else "1">  # codex only: sandbox network on (default), so it can run suites and drive the branch
REVIEWER_BRIEF="${SELF_ROOT%/}/skills/engineering/review-loop/codex-skill"
```

Everything the loop reviews is `BASE...HEAD`. Add `/.review-loop/` to `.git/info/exclude`, never
`.gitignore`.

Network is on by default so Codex can run suites on a remote test runner (ssh) and keep the main box free. `--no-codex-runs` turns it off; its findings are then static reads marked `needs-run`.

**When `REVIEWER` is `codex`**, publish the Codex-side reviewer so `codex` finds it by name
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

"Codex" throughout this skill is shorthand for whichever reviewer `--reviewer` selected — `codex`
(default), `claude`, or `agy`. Triage, `findings.md`, fixes, and exit conditions are identical
for all three; only §2.1's prompt header and §2.2's launch branch on the backend.

Each round is a directory and five steps:

```bash
N=01                       # round number, zero-padded
DIR="$RUN/round-$N"
mkdir -p "$DIR"
```

### 2.1 Write the prompt

Write `$DIR/prompt.md`. How it opens depends on `REVIEWER`:

- **`codex`** — open with exactly this line, and paste nothing from the brief:

  > Use your `code-review-codex-loop` skill for this review.

  It was symlinked into `~/.codex/skills/` during *Setup*, so Codex discovers it by name.

- **`claude` / `agy`** — no skill to discover, so paste the brief in. Open with the contents of
  `$REVIEWER_BRIEF/SKILL.md` under a `# Reviewer brief` heading, then
  `$REVIEWER_BRIEF/references/smell-baseline.md`, and on **rounds 2+** also
  `$REVIEWER_BRIEF/references/loop-protocol.md`, each under its own heading. Then one line: *"The
  resources this brief refers to are included above — do not look for them on disk."*

Everything below the opening is identical for all three backends. Every round's prompt also says:
*"start servers only on the port range the repo's `verify` skill gives."*

**Round 1** gives Codex this and only this:

- The goal and the full acceptance criteria (`$RUN/spec.md`).
- The exact SHAs: `git diff <BASE>...<HEAD>`, and the commit list.
- Binding constraints: whatever `CLAUDE.md`/`AGENTS.md` records — lint baselines, the interpreter,
  forbidden commands — and the relevant ADR numbers if the repo keeps them.
- The touch table (`$RUN/touch.md`) and each ticket's cost line, when the caller wrote them. These
  are the plan, not claims that it was done — the reviewer checks them.

**After parallel waves**, round 1 also carries two *structural facts* — not claims, and not
recoverable from the diff: the **wave map** (`T<n> → <files>`), and a **seams list** of every contract
crossing tickets, with the instruction *"treat inconsistency across tickets as a Standards finding
even where each ticket is internally correct."* Two tickets agreeing on a name and disagreeing on its
meaning is the defect class parallel builds manufacture.

Withhold from round 1: every self-review or per-ticket review output, every implementation handoff, all test
claims, and any tentative conclusion. Independence is preserved by withholding the reports, not the
map.

**Rounds 2+** are a fresh reviewer with no memory, so the prompt carries the history:

- `## Prior findings` — the previous round's `handoff.md`, **verbatim**.
- `## What changed in response` — per finding, one line: `F<n> — FIXED in <sha> (<what changed>)` or
  `F<n> — REJECTED: <reason> (<ADR / issue / project-rule citation>)`.
- The new commit SHAs and the new `BASE...HEAD` range.
- The instruction to restate every prior finding as `RESOLVED` / `STILL OPEN` / `WITHDRAWN`, then
  re-review the new commits.

Write *"a previous review produced the findings below"*, never *"you reviewed this"*. Telling a
fresh model it did something it cannot recall makes it hedge or invent the missing context. And
state rejections with their reason — omit one and the next reviewer raises it again.

Never edit or re-send a prompt already used. Each round's prompt is immutable.

### 2.2 Launch the reviewer

Every round is a **fresh** reviewer with no memory of the last — round 1 and the final round run
the identical launch. Which one runs is set by `REVIEWER`. `${REVIEWER_MODEL:+…}` expands to the
model flag only when `--reviewer-model` was given; otherwise the backend picks its own default.

Each launch is **unattended by design** — non-interactive, no approval prompts, nothing for the
reviewer or the user to confirm mid-round. Whitelist the launch command (or run the skill in a
permission mode that does not prompt) so the loop runs end to end without stopping for you.

Before any launch, save `ss -ltnp` to `$DIR/listeners-before.txt`.

**`REVIEWER=codex`:**

```bash
codex exec --json --output-last-message "$DIR/handoff.md" \
  ${REVIEWER_MODEL:+-m "$REVIEWER_MODEL"} \
  -s workspace-write -c approval_policy=never -C "$REPO" \
  ${CODEX_RUNS:+-c sandbox_workspace_write.network_access=true} \
  - < "$DIR/prompt.md" > "$DIR/events.jsonl"
```

**`REVIEWER=agy`:**

```bash
( cd "$REPO" && agy --output-format text --dangerously-skip-permissions --print-timeout 30m \
    ${REVIEWER_MODEL:+--model "$REVIEWER_MODEL"} \
    -p "$(cat "$DIR/prompt.md")" ) > "$DIR/handoff.md" 2> "$DIR/events.log"
```

`agy` reads the prompt only from the attached `-p` value, not stdin — keep the `$(cat …)`.
`--dangerously-skip-permissions` is what makes the round unattended; the brief still forbids every
edit, and the clean-tree check below is what enforces it. `--print-timeout` defaults to 5m, too
short for a real review — 30m is the floor.

**`REVIEWER=claude`:** spawn a **fresh** `general-purpose` agent with the Agent tool — never
`subagent_type: "fork"`, never `SendMessage` to a prior round's agent. Set `model` to
`$REVIEWER_MODEL` when given (`sonnet` otherwise). The agent's entire prompt is the contents of
`$DIR/prompt.md` plus one instruction: *"Review only — never edit, stage, or commit anything. Write
your final message, verbatim in the required shape, to `$DIR/handoff.md`."* A fresh
`general-purpose` agent does not inherit this session's context — that is what keeps it independent,
the same reason Codex runs unresumed.

**Never resume a reviewer** (`codex exec resume`, `agy --continue` / `--conversation`, `SendMessage`
to a prior agent). A resumed reviewer carries prior reasoning as hidden state you cannot inspect or
correct; a fresh one with the history in `prompt.md` costs only a re-read of the diff and gives you
inputs you can see.

After any backend, **confirm the worktree is clean** (`git status --porcelain`). `workspace-write` /
`--dangerously-skip-permissions` exist so repo checks can write their normal temporary output, not
so the reviewer can edit — revert anything it touched and note it.

Then stop what the round left running. Print `ss -ltnp` again next to `$DIR/listeners-before.txt`;
stop only the PIDs that are new since the before-list and
listen inside the port range the repo's `verify` skill gives (the PIDs this round started). Never
stop a PID whose `ps -o unit= -p <pid>` names a `.service` (the live API and workers run from the main
checkout, so a match on working folder would stop them), and never touch another worktree's ports.

`handoff.md` is the verdict and normally the only file you read. Open the round's raw log —
`events.jsonl` (codex), `events.log` (agy), or the agent's returned report (claude) — only when
the handoff is empty or truncated. An empty handoff is a failed round — never fabricate one.

### 2.3 Triage every finding — this is the step that matters

Codex's handoff is a set of **claims**. Nothing in it changes the code until you have checked it.
For each finding, in order:

0. **If you did not personally write that code** (agents built it), read the cited hunk **and the
   function around it** cold from the repository before forming any verdict. You have no memory of
   this code to judge from.
1. **Reproduce it.** Read the cited `file:line`. Run the cited command yourself. A finding you
   cannot reproduce is `REJECTED: not reproducible` — say what you observed instead.
2. **Check it against the ADRs.** Grep `docs/adr/`. A finding asking you to undo a live ADR is
   `REJECTED` citing that ADR number — Codex has not read the argument behind it. If the finding
   reveals the ADR itself is wrong, note it as a follow-up; that is not this loop's job.
3. **Check it against the issue.** A finding demanding behaviour the issue did not ask for is
   `REJECTED: out of scope` — or `DEFERRED` and filed as a new issue when genuinely worth doing.
   Search before filing: `gh issue list --state open --search "<key words>"`, then read the likely
   matches' comments (follow-up lists often hold it there). Found → comment on it (what this branch
   fixed / what is left) and link it in the findings table instead of filing.
4. **Check it is used.** A finding asking for more machinery — "handle properly", a new option, a
   wider API — grep for a real caller first. None → `REJECTED: nothing uses it (YAGNI)`, naming the
   grep.
5. **Check it against the project rules.** Where the repo records a pre-existing lint baseline, a
   finding demanding a clean run of that linter — or a fix in a file this ticket does not touch — is
   `REJECTED`, citing the baseline.
6. Otherwise: **ACCEPT**.

Append every verdict to `$RUN/findings.md`, one line each:

```text
F3 | r1 | REJECTED | asks to undo ADR 0041 (bucket stock never feeds cadence)
F4 | r1 | ACCEPTED | fixed in a1b2c3d
```

That file is the loop's only durable state, and it is load-bearing: the rejection reason you write
goes back to Codex verbatim next round, so write it to settle the point. Do not grow a schema around
it.

A `suggestion` never blocks; take it only if cheap and clearly right.

### 2.4 Fix, verify, commit

Implement every ACCEPTED finding — blocking first, simple next, complex last. Nothing else — no
unrelated cleanups mid-loop.

**Fix rounds are serial, always — never fan out a fix round.** Accepted findings land wherever the
defect is, so disjoint ownership no longer holds; and the `FIXED in <sha>` line you send Codex has
to be one you wrote, with nothing unread between it and the diff Codex re-verifies.

Typecheck and run the touched tests as you go; run the full suite before committing. Read each
linter as a **delta**: where `CLAUDE.md` records a baseline, your work is clean when it adds no new
rule and no new count — not when the run is green. Honour any command the repo forbids; some build
steps overwrite an artefact that is actually being served.

Commit with the round in the message (`fix(review r2): …`).

### 2.5 Exit conditions

Continue to the next round unless one fires:

- **Approved.** Codex's last line is `VERDICT: APPROVED`, you have no accepted finding still
  unfixed, and at least **2** rounds have run. A round-1 approval is not enough: run one more telling
  Codex what changed, so it approves the final state rather than the state it first saw.
- **Round cap.** `--rounds N` reached. Stop and report the still-open findings.
- **Deadlock.** Codex re-raises a finding you already rejected on a cited ADR or scope ground, a
  second time, with no new evidence. Stop and put the disagreement to the user with both positions
  and the citation.
- **Blocked.** Codex reports `Status: blocked`, or a finding needs a decision only the user can make.

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
