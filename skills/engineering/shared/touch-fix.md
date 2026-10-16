# Touch fix — bring touched neighbours up to the standards

A step, not a reminder. Every code-changing lane of `work`, and `architect`'s touch list, run it.
Source rule: the repo's `CODING_STANDARDS.md` ("Code you touch, and code that leans on it…"). No
`CODING_STANDARDS.md` → `skip: repo has no coding standards`.

## 1. The touch list

For each function the change edits: its direct callers whose behaviour or signature changes, and the
callees it now depends on. One step out, never two. (`graft callers <sym>` and `--direction out`
when the repo has graft, else `git grep`.) Write `$RUN/touch.md`:

```
| unit (file:line) | why touched | rule broken (CODING_STANDARDS heading) | size | action |
```

`action` is one of:

- `fix` — breaks a rule, fix fits in a few hundred lines.
- `file` — fix crosses further than one step or exceeds a few hundred lines → a GitHub issue
  (`ready-for-human` unless it is a clean mechanical change), link it in the table.
- `ok` — meets the rules.

## 2. Fix, in its own commit

Each `fix` row is a refactor, so it follows `../work/playbooks/refactoring.md` steps 1, 4–6 (pin today's behaviour,
subtract, move in small steps, prove unchanged), scoped to that unit. Rules:

- Its own commit (`refactor(<area>): … per CODING_STANDARDS "<heading>"`), before or after the
  behaviour change, **never mixed into it**.
- The affected tests run green on both commits.
- A fix that changes behaviour is not a touch fix. Stop, write it as a finding, keep the unit `file`.

## 3. Close check

Before the lane's verify step, prove every row is closed. With the Decisions API
(`decisions.md`): one call, one `choice` per row (`fixed` / `filed` / `missed` / `unclear`), input =
the table plus `git log --oneline $BASE..HEAD` plus the filed issue numbers. Any `missed` or
`unclear` → a fresh agent checks that row and fixes or files it. No key → the lead reads the table
against the log itself.

Skip only as `skip: every touched unit already meets the rules`, with the table attached.
