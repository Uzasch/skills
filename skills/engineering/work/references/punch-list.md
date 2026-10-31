# Punch-list lane

For an issue (or a few) that is a **list of separate jobs**, not one spec: a follow-up list, a retro
list, a "bugs seen on live" comment, an "old forms to drop" list. The operator does not want to make
the calls item by item. `ship-tickets` alone reads its input as a spec (criteria, seams, `Blocked by`)
and stops on every gate question; this lane turns the list into small local tickets first, decides
the questions itself, then hands them to `ship-tickets --decide`.

`RUN=.review-loop/<slug>`. Reports caveman style.

1. **Read all of it.** `gh issue view N --json title,body,comments < /dev/null` — the list often
   continues in comments, and a later comment can change an earlier item. Split it into items,
   `$RUN/items.md`, one line each:

   ```text
   I7 | comment 2 | create_policy_lesson sends job_id=None (comp_store.py:2528) | bug fix
   ```

   Kind is one of: `bug fix`, `clean-up`, `small change`, `decision`, `waits` (the issue says it
   runs later — a date, another ticket, "after 7 days"), `not code` (live data, an operator action),
   `done`.
2. **Check each against the code now.** Sonnet agents, about ten items each, with
   `../../shared/investigate-prompt.md`: is it still true, where is it (`file:line`), is it already
   fixed. Mark fixed ones `done` with the evidence. An item the agent cannot place → `unclear`, and
   a second agent with a sharper question; never drop it silently.
3. **Decide.** Every `decision` item: pick the answer the ADRs, `CODING_STANDARDS.md` and the code
   best support; one row in `$RUN/decisions.tsv` (item, choice, why, how to undo). Do not ask. The
   only items that go to the operator — **collected into one message**, while the rest carries on —
   are: writes to live data or live services, a credential or security choice, money or publishing,
   deleting data that cannot be restored, and an item the issue itself marks as the operator's call
   on one of those grounds.
4. **Write the tickets.** Each `bug fix` / `clean-up` / `small change` / decided item becomes a local
   ticket `$RUN/issues/I<n>.md`: what to change, a *done when* check a reviewer can run, the test seam
   (a bug fix: a test that reproduces it, red first), `Blocked by` where one item needs another.
   Items on the same file or chain stay separate tickets — `implement-gate` bundles them for one
   builder. `waits` and `not code` items get no ticket; they are listed in the reply.
5. **Build.** Run `ship-tickets` on `$RUN/issues/` with `--decide` (read its SKILL.md and follow it,
   never the Skill tool). Waves, the per-wave tests and app checks, and the two-reviewer
   `review-loop` at the end all run as usual.
6. **Reply.** Per item, one line: `done <sha>`, `decided: <choice> — <why>`, `waits: <until what>`,
   `not code: <who does it>`, or `asks you: <question>`. Offer to post the same list as a comment on
   the issue; post only on the operator's yes.
