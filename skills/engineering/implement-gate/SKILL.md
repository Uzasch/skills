---
name: implement-gate
description: Use before writing code for a spec, issue or set of tickets — when asked "do we even need to build this", "is this already in the codebase", or "which tickets can run in parallel". Called by ship-tickets before its build phase.
argument-hint: "<issue #s / PRD path / spec.md path>"
---

Decide what to build before building it. Two verdicts, both written to disk, both from evidence.

Output is `$RUN/gate.md` when the caller sets `RUN`, else `./gate.md` in the scratch area.
Reports caveman style: drop articles and filler, fragments fine, paths and commands exact.

## 1. Criteria

Read the spec (`$RUN/spec.md`, or `gh issue view N --json title,body,comments < /dev/null` — the binding spec is
often a comment), one line per acceptance criterion, numbered `C1…Cn`. Several tickets → prefix with the
ticket (`T2.C3`) and keep each ticket's `Blocked by` line. Vague criterion → stop and ask; the
gate cannot judge what it cannot read.

**Measure every number in a ticket before it is built on.** A criterion or a "found" line that
states a count or a target ("12 duplicate groups", "0 duplicates after", "3 callers", "about 40
rows") is a claim. Measure it now — the query, `git grep -c`, or command that gives the real
value — and write `T2.C3 | stated 12 | measured 1 | <command>` in gate.md. A measured value that
differs, or a target that the measured data cannot reach (e.g. "0 duplicates" when some
duplicates are real records to keep) → **stop and ask the user** before the build, with both
numbers. A wrong number found mid-build costs a wave; found here it costs one question.

## 2. The ladder, per criterion

Climb this ladder for each criterion. Stop at the first rung that holds:

1. Needed at all? Speculative → `SKIP`.
2. Already in this codebase? → `REUSE <file:line>`. Look before deciding: the repo's code index
   first if it has one (e.g. `graft ask "<criterion>" --source`, `graft callers <sym>`), else
   `git grep`; callers of the obvious function. Most-common miss: the helper lives three
   files over.
3. Stdlib / 4. native platform / 5. already-installed dependency → `REUSE <thing>`.
6–7. → `BUILD`, smallest version that meets the criterion.

Every `SKIP` and `REUSE` cites evidence — a path, a grep hit, a package name. No evidence, no
verdict: default `BUILD`.

A `SKIP` removes a criterion the user asked for. Never silently: list it and **stop for the user's
yes** before the build starts.

## 3. Waves

Tickets build in **waves**; a wave's tickets run in parallel.

- Wave 1 = tickets whose `Blocked by` is none. Wave k+1 = tickets whose blockers all sit in waves ≤k.
- **File-overlap check overrides the edges.** Per ticket, estimate the files it will touch (code
  index / `git grep`). Two tickets in one wave sharing a file, schema, route table or JSON contract →
  the later-numbered one moves to the next wave. Missing `Blocked by` edges are how two parallel
  agents end up editing the same function.
- Each ticket gets an exclusive file glob for its wave, and it includes every file that calls or
  stands in for a function the ticket changes — tests that monkeypatch it included
  (`graft callers <sym>` / `git grep`). A glob drawn too tight sends a needed edit to the controller.
  **Checkable:** per ticket, for each function it changes, run `graft callers <sym>` (`git grep -n
  <sym>` when no graft) and `git grep -ln <sym> -- '*test*'`, and paste both file lists under the
  ticket in gate.md. The glob covers every listed file, or says why not.
- **Every reader of what changes.** A ticket that changes a column, a field, a stored format, a
  return shape or a function's meaning lists **every** reader, not the top matches: the code index
  (`graft grep <name>` — exhaustive — not `graft ask`, which ranks) **plus** a raw
  `git grep -n <name>` over the whole repo, which catches calls through a module alias, scripts,
  skill `.md` files, SQL and tests. Paste the list under the ticket. Each reader is either in this
  ticket's glob, or named as moved by a later ticket in this run, or named as kept on purpose with
  the ADR / ticket line that keeps it. A reader in none of those → the glob grows, or stop and ask.
- A cycle in `Blocked by` → stop and ask.

```text
WAVE 1: T1 api/routes/orders.py,tests/test_orders.py | T3 web/src/pages/Cart*
WAVE 2: T2 (blocked by T1) ... | T4 (moved: shares services/store.py with T1) | T5 (blocked by T3)

T1 changes get_order():
  callers: api/routes/orders.py, services/cart.py        (graft callers get_order)
  tests:   tests/test_orders.py, tests/test_cart.py      (git grep -ln get_order -- '*test*')
  glob adds services/cart.py,tests/test_cart.py; skips none
T1 changes orders.status (column):
  readers: services/cart.py:88, scripts/export.py:12, skills/report/SKILL.md:40   (graft grep + git grep -n status)
  export.py → T4 moves it (wave 2); SKILL.md → glob adds it
```

## 4. gate.md

```text
C1 | BUILD  | <one line>
C2 | REUSE  | backend/utils/paths.py:41 resolve_path already does it
C3 | SKIP   | speculative — no caller, issue says "maybe later"   <- needs user yes
T2.C1 | stated 12 groups | measured 1 | psql -c "select … having count(*)>1"   <- needs user answer
<the §3 wave block>
```

Print it. Stop only for a `SKIP` or a measured number that does not match the ticket.
