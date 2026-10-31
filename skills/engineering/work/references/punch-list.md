# Punch-list lane

For an issue that is a **list of separate jobs**, not one spec: a follow-up list, a retro list, a
"bugs seen on live" comment, an "old forms to drop" list. The operator runs `/work` unattended and
makes no calls. `ship-tickets` alone reads its input as a spec and stops on gate questions; this lane
turns the list into small local tickets, decides the questions itself, then builds them with
`ship-tickets --decide`.

**One issue → one branch → one PR.** Several issues given at once → one run owner per issue, one
after another, each with its own PR.

## The lead (main session) — three steps only

The lead never reads the items, the gate, the reports or the review findings; they stay in the run
owner's context.

1. Make the branch `issue-<n>` off `origin/<trunk>` (check `git worktree list` / `git branch` first:
   another session may own the issue). `RUN=.review-loop/issue-<n>`.
2. Spawn **one run owner**: a fresh `general-purpose` agent, `model: "sonnet"`, `effort: "high"`,
   whose prompt is: the issue number, `REPO`, `RUN`, the branch, and *"Read
   `<this file's absolute path>` and do every step under **The run owner**. Return only the report
   it describes."*
3. Read its report. `pass 2 needed` → spawn a fresh run owner with the same prompt plus *"Pass 2:
   continue from `$RUN/items.md`; same branch and PR."* Then reply to the operator with the report.

## The run owner

Reports caveman style. Never ask the operator anything. Risky calls follow
`../../shared/risky-calls.md` (a second model must agree; back up before removing anything).

1. **Read all of it.** `gh issue view N --json title,body,comments < /dev/null` — the list often
   continues in comments, and a later comment can change an earlier item. Split it into items,
   `$RUN/items.md`, one line each:

   ```text
   I7 | comment 2 | create_policy_lesson sends job_id=None (comp_store.py:2528) | bug fix | open
   ```

   Kind is one of: `bug fix`, `clean-up`, `small change`, `decision`, `waits` (the issue says it
   runs later — a date, another ticket, "after 7 days"), `not code` (an operator action outside
   the repo), `done`.
2. **Check each against the code now.** Sonnet agents, about ten items each, with
   `../../shared/investigate-prompt.md` and the repo's code index (graft): is it still true, where
   is it (`file:line`), is it already fixed. Fixed → `done` with the evidence. An item an agent
   cannot place → a second agent with a sharper question; never drop it silently.
3. **Decide.** Every `decision` item: pick the answer the ADRs, `CODING_STANDARDS.md` and the code
   best support; one row in `$RUN/decisions.tsv` (item, choice, why, how to undo). Risky ones go
   through `risky-calls.md`. Nothing is put to the operator.
4. **Write the tickets for this pass.** At most **12** — the rest stay `open` in `items.md` for
   pass 2. Each `bug fix` / `clean-up` / `small change` / decided item becomes a local ticket
   `$RUN/issues/I<n>.md`: what to change, a *done when* check a reviewer can run, the test seam (a
   bug fix: a test that reproduces it, red first), `Blocked by` where one item needs another. Items
   on the same file or chain stay separate tickets — `implement-gate` bundles them. `waits` and
   `not code` items get no ticket.
5. **Build.** Run `ship-tickets` on `$RUN/issues/` with `--decide` (read its SKILL.md and follow it,
   never the Skill tool; with no Workflow tool, use its Agent-call fallback). Waves, the per-wave
   tests and app checks, and the two-reviewer `review-loop` all run as usual. Mark built items
   `done <sha>` in `items.md`.
6. **One PR.** Pass 1 opens the PR for `issue-<n>` (body: per item one line, the decisions, the
   backups and their restore commands). Pass 2 pushes to the same branch and edits the same PR body.
   Never merge, deploy or restart a live service.
7. **Report — about ten lines, nothing else:** the PR link; counts of done / decided / waits /
   not code; each risky call in one line (choice, checker verdict, backup path); `pass 2 needed: N
   items` or `all items handled`.
