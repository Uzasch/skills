# Touch fix — bring touched neighbours up to the standards

A step, not a reminder. Every code-changing lane of `work`, and `architect`'s touch list, run it.
Source rule: the repo's `CODING_STANDARDS.md` ("Code you touch, and code that leans on it…"). No
`CODING_STANDARDS.md` → `skip: repo has no coding standards`.

## 1. The touch list

For each function the change edits: its direct callers whose behaviour or signature changes, and the
callees it now depends on. One step out, never two. (`graft callers <sym>` and `--direction out`
when the repo has graft, plus `graft grep <sym>`, since `graft callers` misses calls through a module
alias; else `git grep`.) Write `$RUN/touch.md`:

```
| unit (file:line) | why touched | rule broken (CODING_STANDARDS heading) | size | action | done when |
```

`action` is one of:

- `fix` — breaks a rule, fix fits in a few hundred lines.
- `file` — fix crosses further than one step or exceeds a few hundred lines → goes on the run's
  work list (`$RUN/todo.md`) and is solved in this run through `work`, in its own refactor commits.
  It needs a decision only the operator can make → ask the operator; never file an issue.
- `ok` — meets the rules.

`done when` — for a `fix` row, a check a reviewer can run (e.g. "table takes <= 7 props"); a `|`
inside a cell is not supported.

**Gate, blocking.** `python3 "$SHARED/scripts/check-touch.py" "$RUN/touch.md"` (`SHARED` = this
folder). Non-zero → nothing is built or committed until the table is fixed and the check passes. It
refuses a missing or empty table, a row without `ok`/`fix`/`file`, and a `fix`/`file` row naming no
rule, and a `fix` row with no `done when` — so a skipped touch fix stops the run instead of passing quietly.

## 2. Fix, in its own commit

Each `fix` row is a refactor, so it follows `../work/playbooks/refactoring.md` steps 1, 4–6 (pin today's behaviour,
subtract, move in small steps, prove unchanged), scoped to that unit. Rules:

- Its own commit (`refactor(<area>): … per CODING_STANDARDS "<heading>"`), before or after the
  behaviour change, **never mixed into it**.
- The affected tests run green on both commits.
- A fix that changes behaviour is not a touch fix. Stop, write it as a finding, keep the unit `file`.
- Replace, don't keep a fallback to the old shape, and delete what the fix leaves without a caller
  (proof: the code index and a raw `git grep -n` over the whole repo show no other use).

## 3. Close check

Before the lane's verify step, prove every row is closed. With the Decisions API
(`decisions.md`): one call, one `choice` per row (`fixed` / `asked` / `missed` / `unclear`), input =
the table plus `git log --oneline $BASE..HEAD` plus the open questions put to the operator; a row is
`fixed` only when its `done when` check holds (a `file` row: its `todo.md` line is `done <sha>`).
Any `missed` or `unclear` → a fresh agent checks that row and fixes it, asking the operator only
when it needs their decision. No key → the lead reads the table
against the log itself.

There is no skip: when every unit meets the rules the table lists them all as `ok`, and the gate
passes on that.
