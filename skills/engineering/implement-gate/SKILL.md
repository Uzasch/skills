---
name: implement-gate
description: Pre-build gate for a spec or set of issues — before any code, run every acceptance criterion through the ponytail ladder (does it need to exist? is it already in the codebase? stdlib, platform, installed dependency?) and decide, with evidence, whether the build fans out across parallel agents. Writes a gate file of build / reuse / skip verdicts and a fan-out verdict. Use before /implement-loop's build phase, or alone when the user asks "do we even need to build this" or "should this fan out".
argument-hint: "<issue #s / PRD path / spec.md path>"
---

Decide what to build before building it. Two verdicts, both written to disk, both from evidence.

Output is `$RUN/gate.md` when called from `implement-loop`, else `./gate.md` in the scratch area.
Reports caveman style: drop articles and filler, fragments fine, paths and commands exact.

## 1. Criteria

Read the spec (`$RUN/spec.md`, or `gh issue view N --comments` — the binding spec is often a
comment), one line per acceptance criterion, numbered `C1…Cn`. Vague criterion → stop and ask; the
gate cannot judge what it cannot read.

## 2. The ladder, per criterion

Invoke **`ponytail:ponytail`** and climb its ladder for each criterion. Stop at the first rung that
holds:

1. Needed at all? Speculative → `SKIP`.
2. Already in this codebase? → `REUSE <file:line>`. Look before deciding: `git grep`, the repo's code
   index if it has one, callers of the obvious function. Most-common miss: the helper lives three
   files over.
3. Stdlib / 4. native platform / 5. already-installed dependency → `REUSE <thing>`.
6–7. → `BUILD`, smallest version that meets the criterion.

Every `SKIP` and `REUSE` cites evidence — a path, a grep hit, a package name. No evidence, no
verdict: default `BUILD`.

A `SKIP` removes a criterion the user asked for. Never silently: list it and **stop for the user's
yes** before the build starts.

## 3. Fan-out verdict — always computed, never skipped

Every run answers `FANOUT: yes|no` with the numbers behind it. Missing this is how a big build
ends up serial by accident.

Over the `BUILD` criteria only, estimate with `git grep`, not vibes:

- files touched; distinct subsystems; criteria testable without the others existing; near-identical
  units.
- **Eligible** when two of: ≥12 files; ≥3 subsystems; ≥5 criteria of which ≥4 stand alone. Or alone:
  ≥8 near-identical units.
- **Shared-seam test overrides.** Two slices that must change the same signature, schema, JSON
  contract or resolver are one slice. Criteria forming a chain (B's test needs A's schema), or more
  than half the diff in files two slices touch → `no`.

`yes` also names: the seam to write and commit first, and the slices (≤6) each with an exclusive
file glob and its criteria.

## 4. gate.md

```text
C1 | BUILD  | <one line>
C2 | REUSE  | backend/utils/paths.py:41 resolve_path already does it
C3 | SKIP   | speculative — no caller, issue says "maybe later"   <- needs user yes
FANOUT: yes | 14 files, 3 subsystems, 5/6 criteria standalone
SEAM: <what gets written + committed before fan-out>
SLICES: s1 backend/api/** (C1,C4) | s2 frontend/src/** (C5) | ...
```

Print it. Stop only for a `SKIP`, or when `FANOUT: yes` without standing consent (`--fanout`).
