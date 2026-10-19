---
name: implement-loop
description: Gate a PRD or set of issues through a ponytail check (build / reuse / skip, fan-out or not), implement it, then harden it in an independent review loop — Claude implements and self-reviews; an independent reviewer (Codex by default, or Claude or Google Antigravity's `agy` via --reviewer) reviews in a fresh session each round; Claude triages every finding against the ADRs and the originating issue, fixes what it accepts, and answers back. Repeats until the reviewer approves or the round cap is hit. Big issues can fan the build out across parallel agents first. Ends with a drift report of everything built beyond the issue and beyond the ADRs.
argument-hint: "<issue #s / PRD path> [--rounds N] [--fanout] [--reviewer codex|claude|agy] [--reviewer-model <id>]"
disable-model-invocation: true
---

Implement the work, then drive it through an independent review loop until the reviewer signs off.
The reviewer is `--reviewer` — `codex` by default, or `claude` or `agy` (Google Antigravity's CLI).
You stay the orchestrator for the whole run — same Claude session start to finish — and a **fresh**
reviewer session every round, with continuity carried in the prompt rather than in a resumed thread.

**You — this session — stay the orchestrator and do the triage.** Do not hand either to a subagent;
they need your full context. (`--reviewer claude` runs the *reviewer* as a subagent — that is the
independent reviewer, never the orchestrator.)

## Arguments

- The work: issue numbers (`#76 #77`), a PRD path, or a plain description. Required — ask if absent.
- `--rounds N` — max review rounds. Default **5**. Minimum **2** (see `review-loop` *Exit conditions*).
- `--fanout` — standing consent to split the build across parallel agents when the issue clears the
  Phase 1b gate. Without it, size the issue, propose the split, and **stop for an answer** — never
  spend a fleet on your own initiative.
- `--reviewer <backend>` — who runs the independent review each round: `codex` (**default**),
  `claude`, or `agy`. The loop, triage, and exit conditions are identical for all three; only the
  prompt header and the launch differ (`review-loop` §2.1–2.2). Reject any other value — stop and ask.
- `--codex-runs` — let Codex rounds start the branch and drive it through the repo's `verify` skill
  (adds network access to Codex's sandbox: it can then reach the same live database the branch talks
  to). Off by default — without it Codex still reads the `verify` recipe and writes a runtime finding
  as exact repro steps for Claude's verifier to run.
- `--reviewer-model <id>` — passed **verbatim** to that backend's own selector. No allow-list here,
  so a bad id fails in the backend, not the skill; omitted means the backend's own default. What
  each backend accepts:
  - **`codex`** → any id `codex -m` / `--model` takes (e.g. `gpt-5.6-terra`, `gpt-5-codex`, `o3`);
    `/model` inside `codex` lists what your account can use. Reasoning effort is a separate `codex`
    config, not part of the id.
  - **`claude`** → exactly one of `sonnet` | `opus` | `haiku` | `fable`. This is the Agent tool's
    `model` enum — a **bare** name, never a version (`fable-5.1`, `sonnet-4-6` are rejected). Default
    `sonnet`.
  - **`agy`** → a **complete** id from `agy models`, effort suffix included — e.g.
    `gemini-3.7-flash-medium`, `gemini-3.1-pro-high`, `claude-sonnet-4-6`, `gpt-oss-120b-medium`. A
    bare family name like `gemini-3.7-flash` is rejected with *"requires --effort"*; the launch in
    `review-loop` §2.2 passes no `--effort`, so the suffix must be in the id. Run `agy models` for the live list.

## Setup

You are already where the work happens. This skill does **not** create branches or worktrees, and
does not resolve a trunk to diff against — the user has put you in the right tree.

```bash
SELF_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/uzasch-skills/*/ 2>/dev/null | sort -V | tail -1)}"
REPO="$(git rev-parse --show-toplevel)"
BASE="$(git rev-parse HEAD)"     # capture BEFORE writing a line of code
RUN="$REPO/.review-loop/<slug>" # <slug> = the issue numbers or PRD name
mkdir -p "$RUN"
```

`BASE` is simply where you started, unless the user names a commit — then use theirs. Everything the
loop reviews is `BASE...HEAD`. Add `/.review-loop/` to the local git exclude
(`.git/info/exclude`), never `.gitignore`.

This skill leans on other plugins' skills, all declared dependencies — call them, don't copy them:
`implement`, `tdd`, `code-review` (`mattpocock-skills`); `implement-gate` and `review-loop` (this
plugin; the gate uses `ponytail:ponytail`); the per-slice review prompts in `ship-tickets/references/` (from Superpowers); and the
built-in `workflow-authoring` for any fan-out. If one is missing, stop and say so rather than
improvising its phase.

**Every subagent report and the final message are caveman style**: drop articles, filler, hedging;
fragments fine; code, paths, commands and errors exact. Put that line in every brief.

Some repos carry a permanently dirty tree — generated logs, agent memory, data backups. **Stage by
explicit path; never `git commit -a`.** Sweeping those in puts them inside `BASE...HEAD` and Codex
reviews work that was never yours. If the issue genuinely needs a file that was already dirty, ask
before claiming it.

**Pin the spec now.** Fetch the issues (`gh issue view N < /dev/null`) or read the PRD, and write the acceptance
criteria to `$RUN/spec.md`. A 0-byte ticket file is a failed fetch — refetch, never build from it. Codex reviews against this text; if it is vague the loop cannot
converge. If there is no spec at all, say so in the Codex prompt rather than letting Codex invent one.

## Phase 0 — Gate

Invoke **`implement-gate`** on `$RUN/spec.md`. It writes `$RUN/gate.md`: per criterion `BUILD` /
`REUSE <where>` / `SKIP`, plus a `FANOUT: yes|no` verdict with the numbers. Build only the `BUILD`
rows; a `REUSE` row is wired, not rewritten. A `SKIP` needs the user's yes before anything else.

`FANOUT: yes` → Phase 1b (with `--fanout`, go; without, print the gate and stop for a go).
`FANOUT: no` → Phase 1. Never decide fan-out any other way — the gate is what stops a big build
running serial by accident.

## Phase 1 — Implement

`implement` (`mattpocock-skills`) is user-invoked, so the Skill tool cannot load it. Read its
`SKILL.md` from the installed plugin and follow its steps: call the Skill tool with `tdd` at the seams
`$RUN/spec.md` names (ask the user only where it names none), typecheck and run tests as you go, call the
Skill tool with `code-review` at the end, and commit. Codex must review *self-reviewed, committed*
work, not a first draft.

Two constraints it does not know about:

- Stage by explicit path, per *Setup*.
- **Its `code-review` output is yours alone.** Codex never sees it. A primed reviewer is not an
  independent one.

When the gate said `FANOUT: yes`, run **Phase 1b** instead.

## Phase 1b — Fan out the build (opt-in, off by default)

Phase 1 is one context. When the issue exceeds it, split the build across parallel Claude agents via
the Workflow tool — but only after you have made the split safe, and only when the user says go.

Eligibility, the shared-seam test and the slice list come from `$RUN/gate.md` — `implement-gate`
owns them. Don't re-derive; if the gate looks wrong, re-run it.

**Write the seam yourself and commit it before the fan-out** — schema, contract, resolver,
migration, interface types. Only the leaves fan out. That commit is what makes the slices
independent; without it there is no fan-out, only a merge.

**Never auto-escalate.** Print the estimate — slice count, agent count, what happens afterwards —
and stop until the user says go.

Load the **`workflow-authoring`** skill before writing the script — it has the current script API
and gotchas; the sketch below is the shape, not the syntax of record.

One workflow, **one stage, `pipeline`, max 6 slices**. Not `parallel()`: the seam commit already
landed, so no slice needs another's result and a barrier buys only latency. No second stage: a
subagent re-running its own tests is not verification. Six is the ceiling because *you* must still
read `BASE...HEAD` end to end.

```js
export const meta = { name: "impl-fanout", description: "Build disjoint slices of one issue", phases: ["build"] };
const SLICE = { type:"object", required:["slice","status","files_written","tests_added","commands","unresolved"],
  properties:{ slice:{type:"string"}, status:{enum:["done","done_with_concerns","needs_context","blocked"]},
    files_written:{type:"array",items:{type:"string"}},
    tests_added:{type:"array",items:{type:"object",required:["path","name","red_output"],
      properties:{path:{type:"string"},name:{type:"string"},red_output:{type:"string"}}}},
    commands:{type:"array",items:{type:"object",required:["cmd","exit","tail"],
      properties:{cmd:{type:"string"},exit:{type:"integer"},tail:{type:"string"}}}},
    unresolved:{type:"array",items:{type:"string"}} } };
const out = await pipeline(args.slices, s =>
  agent(`Read your brief at ${s.brief} and follow it exactly. Report nothing you did not observe.`,
        { label: s.id, phase: "build", schema: SLICE, effort: "high" }));
log(`returned ${out.filter(Boolean).length}/${args.slices.length}`);
return out.filter(Boolean);
```

Write each brief to disk first and point the agent at it — the script has no filesystem API. Base
it on `$SELF_ROOT/skills/engineering/ship-tickets/references/implementer-prompt.md`. Every
brief carries: the slice's acceptance criteria verbatim; its **exclusive file glob** ("touch anything
else and return `blocked` with the path"); the named test per criterion, written first, with its
failing output pasted verbatim; the exact interpreter, test and lint commands from the repo's
`CLAUDE.md`, including any lint baseline it records and any build command it forbids; and **run no
git write command — Claude commits** (the index lock races); and **report caveman style**.

Use `isolation:'worktree'` **only** when a slice runs a repo-wide mutating tool or two slices rewrite
call sites in the same file; then merge `--no-ff` in slice order, never `-X ours/theirs`, and after
three hand-resolved conflicts finish serially. A conflict means the partition was wrong. Worktrees
do not fix a shared database, port, or dataset — serialise those slices.

### Before Codex sees anything — you verify, alone

Slice test runs are void the moment slices integrate.

- **Leak check** — `git diff --name-only` against the seam commit, minus the union of every slice's
  glob. An unclaimed path is a partition leak: revert it or adopt it deliberately. A subagent's own
  out-of-glob self-report is not evidence.
- **Red-proof replay** — re-run every test a slice added, at the seam commit, and confirm it fails
  there. One that passes against pre-slice code is dead; rewrite it.
- Full suite, typecheck, and each linter the repo documents — as **deltas** against any baseline it
  records. **The workflow must never run the full suite**; parallel agents share databases and ports.
- Read every hunk of `BASE...HEAD`.

**Per-slice review, two fresh subagents, in order** — `ship-tickets/references/spec-reviewer-prompt.md`
(built what was asked, nothing more, nothing less — verified from the code, never the report), then
only once that passes, `code-quality-reviewer-prompt.md`. Run both after integration, against the
slice's files. A finding goes back as a fix you make serially (below), then that reviewer re-runs.
Both reviewers report caveman style. This is not the rejected self-check: the reviewer did not
write the code.

Status handling: `done_with_concerns` — read the concerns first; `needs_context` — add it to the
brief and build that slice inline.

A slice returning `files_written: []` is failed, not "nothing to do". So is a null agent — never
fabricate a handoff. Build that slice inline; **never re-fan a failed slice.** A slice returning
`blocked` stops Phase 2 until you resolve it. A slice whose diff exceeds roughly twice its estimate
gets read line by line.

Then commit per slice in slice order, call the Skill tool with `code-review` and `ponytail:ponytail-review` over the
merged result, and enter Phase 2
with one linear `BASE...HEAD`.

## Phase 2 + 3 — Review loop and drift report

Call the Skill tool with `review-loop` and follow it, with `REPO`, `BASE`, `RUN`, `$RUN/spec.md` and
the reviewer arguments set above. After a fan-out, round 1 carries the slice map and seams list (as
`review-loop` §2.1 says). You do the triage and the fixes yourself.

## The final message to the user

Caveman style, for someone who has not read the diff: no filler, fragments fine, one line per
point. No jargon, no SHAs in the prose, no finding numbers as though they mean something to the
reader. Full sentences only for warnings or anything needing a user decision. Cover, in order:

**What you set out to do** — one sentence, in the issue's own terms.

**What you built** — the behaviour that now exists, not the files that changed. Plus what the gate
reused or skipped instead of building.

**How many rounds it took and where it landed** — sign-off, round cap, deadlock, or blocked. Straight.

**What Codex asked for and what you did** — grouped, not enumerated. "It found three real problems, I
fixed all three. It asked for two more things I didn't do, because…" Reasons in ordinary words: *the
issue didn't ask for it*, *we already decided this the other way in decision record 0041*, *I ran the
command it cited and got a different result*.

**What changed that nobody asked for** — bucket 2. One line each: what it is, why it's there. This is
the section people skip, and the one that explains why the change is bigger than the ticket.

**What this decided that wasn't already decided** — bucket 3. What got settled, new ground or a
departure. Say plainly these are worth recording as ADRs, and offer to write them.

**What's still open** — unfixed findings, anything deferred (with its issue number), anything needing
a user decision.

If buckets 2 and 3 are empty, say so in one line. An explicitly empty drift report is a useful
result; a missing one reads as an oversight.
