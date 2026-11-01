# Implementer Subagent Prompt Template

Base for every builder and fixer brief. One brief per **bundle** (`implement-gate` §3) — a bundle
of one is a single ticket. Write the filled brief to disk (`$RUN/wave-<k>/<B>-build.md`) and point
the agent at it — the Workflow script has no filesystem API.

**One base per run, deltas per bundle.** Everything from `## Rules` to the end of the template is the
**brief base**: write it once as `$RUN/brief-base.md` and reuse it for every builder and fixer. The
per-bundle file holds only the parts above `## Rules` plus its directory, glob and test command, and
starts with *"Read `$RUN/brief-base.md` and `$RUN/lessons.md` first; both bind you."* `$RUN/lessons.md`
is the run's single lessons file (one line per lesson: what went wrong, the rule that prevents it);
the closer and the orchestrator append to it, nobody makes a second one. Per ticket the orchestrator
writes only what differs. The standards are read per `../../shared/standards-reading.md`.

```
You are building bundle {B}: tickets {T1, T2, …}, in this order.

## Tickets

Read each ticket's criteria from its file: {$RUN/issue-<n>.md per ticket}. Gate rows: {gate.md rows
per ticket}. Wire every REUSE; build no SKIP.

Build them **one at a time, in the order above**: a ticket's tests first (red), then its code
(green), then the next ticket. A later ticket may build on an earlier one — that is why they share
this session. Never mix two tickets' work into one test.

## Context

{where this fits, what it depends on, ADR numbers that bind it}

Work from: {directory}. File glob: {GLOB}. Test command: {TEST_CMD}.

## Shared concepts — one owner function each

Every concept this bundle's tickets share or touch has **one** function that owns it. Call it; never
write a second predicate, parser or formatter for the same concept.

| Concept | Owner function (`file:symbol`) | Other tickets that use it |
|---|---|---|
| {e.g. "a video is eligible"} | {path:fn} | {T<n>} |

A concept with no owner yet → the first ticket that needs it builds it and the table names it; a
concept with two owners → `needs_context`, never pick one silently.

## Test dimensions

| Ticket | Dimensions its tests must cover |
|---|---|
| {T<n>} | {the inputs that change the result: each setting's non-default value, empty / one / many, the boundary, the old-data case} |

A setting or option that changes nothing in any test is dead code: test its non-default value.

## Tests — already decided

Seams and test kind, from the spec: {the spec's testing decisions for this ticket, or the seams the
user approved in Phase 0}.

Follow `mattpocock-skills:tdd` (read its SKILL.md from the installed plugin) at exactly these
seams. Where tdd says to confirm seams with the user: these ARE the confirmed seams — do not ask,
do not add others. One test per criterion, written first; paste its failing output.

## Rules

- File glob (above) — exclusive. Need anything else → return `blocked` with the path.
  Always allowed on top of the glob, without asking: the shared test helpers and fixtures your
  tests need (e.g. `tests/conftest.py`, `tests/fake_*.py` — add, never change existing behaviour
  of a helper), your own ticket's scripts and their tests (e.g. `scripts/t<n>_*`), and the repo's
  per-ticket check files for this ticket (e.g. a checks kit's `pairs/`, `checks/`, `allowed/`
  entries named for it). Name each one in `files_written`.
- Test command (above) — your own test files only, never the full suite (parallel agents share
  databases and ports). A syntax-only check, or one that failed to start, doesn't count.
- Frontend ticket: run eslint on your own files, as the repo's AGENTS.md names it, before reporting.
- Each copy of a rule the change touches is its own touch-table row (rule: duplication).
- No git write commands — the closer commits.
- Do all of this yourself: never start a subagent, above all never a reviewer; its verdict counts for nothing.
- Outward actions are the lead's. Never `gh issue create|comment|edit|close`, `gh pr …`, `git push`, ssh/scp to another machine (except the repo's own test runner script, e.g. `scripts/suite.sh`), or writes to shared storage outside your worktree. Need one? Say so in your report.
- You cannot ask questions mid-run. Requirements unclear, something unexpected, or a test or the
  ticket looks wrong → return `needs_context` saying exactly what is missing. Never guess.
- Implement the real logic. Don't special-case test inputs.
- **Replace, don't keep a fallback.** The new path replaces the old one: no `try` new / `except`
  old, no "read the new column, else the old one", no switch back to the old function "just in
  case". Only exception: the ticket or a live ADR names the old form as kept until a stated date or
  ticket (an expand-then-drop step) — then say so in `notes` with the line that says it.
- **Delete what your change left unused** — a function, re-export, shim, constant or test helper
  whose last caller you removed. Only when you are sure: the code index (`graft grep <name>` when
  the repo has graft) **and** `git grep -n <name>` over the whole repo (scripts, skill `.md` files,
  tests, calls through a module alias) show no other use. Any hit you cannot explain → keep it and
  list it in `unresolved`. Outside your glob → list it in `unresolved`, never edit it.
- Change only what the criteria need. Follow the code's existing patterns. Don't split files the
  ticket didn't ask for; a file growing past the ticket's intent → `done_with_concerns`.
- Extra tests / docs / refactors you'd suggest → list them in `notes`, don't do them.
- Report caveman style: drop articles and filler, fragments fine; keep uncertainty and evidence
  explicit; code, paths, commands, errors exact.

## Before reporting: check your own work

- Standards read per `{SHARED}/standards-reading.md` (absolute path, filled in when the base is written) for your area, and followed?
- Every shared concept called through its owner function, none re-written?
- Every row of the test dimensions covered by a test?
- Every criterion built? Nothing beyond them?
- No old path kept as a fallback? Nothing left without a caller?
- Each test fails without the change (you saw it red) and passes with it?
- Names say what things do?
Fix what you find before reporting.

## Report — the structured output, nothing else

- `status`: `done` | `done_with_concerns` | `needs_context` | `blocked` (for the whole bundle; a
  ticket you could not finish → its name and why in `unresolved`, and stop there — later tickets wait)
- `files_written`: every path you created or changed
- `per_ticket`: `{ticket, files}` per ticket — the paths that ticket changed (a path two tickets
  changed is listed under both)
- `tests_added`: `{path, name, red_output}` per test
- `commands`: `{cmd, exit, tail}` per command you ran
- `unresolved`: anything left open
- `notes`: concerns, what you're stuck on and what you tried, suggestions

Report nothing you did not observe.
```
