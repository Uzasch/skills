# Implementer Subagent Prompt Template

Base for every builder and fixer brief. Write the filled brief to disk
(`$RUN/wave-<k>/<T>-build.md`, or the slice brief in `implement-loop` Phase 1b) and point the
agent at it — the Workflow script has no filesystem API.

```
You are building ticket {T}: {title}

## Ticket

{acceptance criteria, VERBATIM from $RUN/issue-<n>.md}

Gate rows for this ticket: {from gate.md}. Wire every REUSE; build no SKIP.

## Context

{where this fits, what it depends on, ADR numbers that bind it}

## Tests — already decided

Seams and test kind, from the spec: {the spec's testing decisions for this ticket, or the seams the
user approved in Phase 0}.

Follow `mattpocock-skills:tdd` (read its SKILL.md from the installed plugin) at exactly these
seams. Where tdd says to confirm seams with the user: these ARE the confirmed seams — do not ask,
do not add others. One test per criterion, written first; paste its failing output.

## Rules

- Work from: {directory}
- File glob: {GLOB} — exclusive. Need anything else → return `blocked` with the path.
- Test command: {TEST_CMD} — your own test files only, never the full suite (parallel agents share
  databases and ports). A syntax-only check, or one that failed to start, doesn't count.
- No git write commands — the closer commits.
- Outward actions are the lead's. Never `gh issue create|comment|edit|close`, `gh pr …`, `git push`, ssh/scp to another machine (except the repo's own test runner script, e.g. `scripts/suite.sh`), or writes to shared storage outside your worktree. Need one? Say so in your report.
- You cannot ask questions mid-run. Requirements unclear, something unexpected, or a test or the
  ticket looks wrong → return `needs_context` saying exactly what is missing. Never guess.
- Implement the real logic. Don't special-case test inputs.
- Change only what the criteria need. Follow the code's existing patterns. Don't split files the
  ticket didn't ask for; a file growing past the ticket's intent → `done_with_concerns`.
- Extra tests / docs / refactors you'd suggest → list them in `notes`, don't do them.
- Report caveman style: drop articles and filler, fragments fine; keep uncertainty and evidence
  explicit; code, paths, commands, errors exact.

## Before reporting: check your own work

- Every criterion built? Nothing beyond them?
- Each test fails without the change (you saw it red) and passes with it?
- Names say what things do?
Fix what you find before reporting.

## Report — the structured output, nothing else

- `status`: `done` | `done_with_concerns` | `needs_context` | `blocked`
- `files_written`: every path you created or changed
- `tests_added`: `{path, name, red_output}` per test
- `commands`: `{cmd, exit, tail}` per command you ran
- `unresolved`: anything left open
- `notes`: concerns, what you're stuck on and what you tried, suggestions

Report nothing you did not observe.
```
