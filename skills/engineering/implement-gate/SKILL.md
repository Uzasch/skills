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

**Words against the glossary.** Before wave 1, compare the ticket words with the repo's glossary
avoided terms, as `../shared/preflight.md` (*Ticket words against the glossary*) says. A ticket that
uses an avoided term gets the owner word in `$RUN/issue-<n>.md`, one line in gate.md.

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

## 3. Bundles, then waves

`to-tickets` cuts a spec into many small tickets. One fresh builder per small ticket re-reads the
repo rules, the ticket and the code every time, and a `Blocked by` chain of three small tickets
costs three waves. So first group tickets into **bundles** — the tickets one builder builds, in
order, in one session — then build the bundles in **waves**; a wave's bundles run in parallel.

- **Bundle together** tickets that are (a) a `Blocked by` chain (T1 → T2 → T3), or (b) sharing a
  file, schema, route table or JSON contract — the cases that would otherwise push a ticket into a
  later wave. Order inside the bundle follows `Blocked by`, then ticket number.
- **Bundle limits:** at most 4 tickets and about 600 changed lines estimated; a risk-tier ticket
  (sign-in, permissions, money, concurrency, live publishing) bundles only with other risk-tier
  tickets. A ticket that fits no bundle is a bundle of one.
- Each bundle's id is `B<n>`; its glob is the union of its tickets' globs. Its tickets keep their own
  criteria, tests, verifier and line in the review — only the build session is shared.

Then waves, over bundles:

- Wave 1 = bundles with no blocker outside themselves. Wave k+1 = bundles whose outside blockers
  all sit in waves ≤k.
- **File-overlap check overrides the edges.** Per ticket, estimate the files it will touch (code
  index / `git grep`). Two bundles in one wave sharing a file, schema, route table or JSON contract →
  merge them if the limits allow, else the later-numbered one moves to the next wave. Missing
  `Blocked by` edges are how two parallel agents end up editing the same function.
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
- **Shared concepts.** Per bundle, a table of every concept two tickets (or a ticket and existing
  code) share, with **one owner function** each — `REUSE <file:symbol>` when it exists, else the ticket
  that builds it. It is the builder brief's *Shared concepts* table (`../ship-tickets/references/implementer-prompt.md`).
  A concept with two candidate owners → pick one now; two owners is how two predicates for one rule appear.
- **Test dimensions.** Per ticket, one row: the inputs that change its result (each setting's
  non-default value, empty / one / many, the boundary, old data). It is the brief's *Test dimensions*
  row; the builder writes a test for every dimension.

```text
B1 = T1 → T2 (chain)                 api/routes/orders.py,tests/test_orders.py
B2 = T3 + T5 (share pages/Cart*)     web/src/pages/Cart*
B3 = T4                              services/store.py,tests/test_store.py
WAVE 1: B1 | B2
WAVE 2: B3 (moved: shares services/store.py with B1; merged they pass ~600 lines)

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
Shared concepts: B1 | "video is eligible" | backend/rules.py:is_eligible | T1 builds, T2 uses
Test dimensions: T1 | cooldown on/off, 0 / 1 / many rows, row exactly at the limit
```

Print it. Stop only for a `SKIP` or a measured number that does not match the ticket.
