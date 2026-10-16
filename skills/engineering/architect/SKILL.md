---
name: architect
description: Use between /to-spec and /to-tickets when a spec adds a new module or changes what a function takes or returns — sketches two structurally different designs (Opus + Gemini), settles factual disagreements with throwaway prototypes, records the pick as an ADR with its cost line and touched-neighbour list, and commits empty function shells so tickets point at real code. Also called by `work`'s feature lane. Skip for changes inside one function.
argument-hint: "<spec issue # | spec path> [--checkpoint]"
---

pstack's `architect`, run in this harness. The workflow is `references/pstack-architect.md`, word for
word; read it first, reading its names through `../shared/pstack-names.md`. This file says only what
differs.

```bash
SELF_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/uzasch-skills/*/ 2>/dev/null | sort -V | tail -1)}"
SHARED="${SELF_ROOT%/}/skills/engineering/shared"
RUN="$REPO/.review-loop/<slug>"        # same run dir as ship-tickets; excluded from git
```

**Phase A — Ground.** Use the investigate map if `grill-deep` or `work` already wrote one
(`$RUN/map.md`); else run `$SHARED/investigate-prompt.md`. Also read the spec, `CODING_STANDARDS.md`
and `mattpocock-skills:codebase-design` for the vocabulary.

**Phase B — Sketch.** Two runners, models per `$SHARED/models.md`: design A an Opus agent, design B
Agy. Each gets `references/runner-prompt.md` plus the spec, the map, and its own folder
(`$RUN/sketch-a/`, `$RUN/sketch-b/`). Add to each brief:

- Write in the repo's language and idiom: Python → dataclasses / `Enum` / `Protocol`, bodies
  `raise NotImplementedError`, docstrings stating invariants ("safe to run twice").
- `CODING_STANDARDS.md` binds the sketch: clients passed in, not built inside; no query in a loop;
  extend by adding a table entry, not by editing branches.
- The rationale includes the **cost line** (`$SHARED/cost.md`).

You (the lead) are the arena: screen both against `references/design-red-flags.md`, pick the base on
interface depth, graft the best of the other, fill the rationale's *Synthesis decision*.

**Prototype check.** The two disagree on a fact a run can settle (speed, query count, bytes, whether an
API behaves as assumed) → one Sonnet agent builds throwaway prototypes in `$RUN/proto/`, runs both,
reports numbers (`$SHARED/benchmark-checklist.md`). The number picks. A taste fork no run can settle
→ ask the operator one question; under `work` decide it and report.

**Phase C — Agree, record, commit.**

1. Touch list: run `$SHARED/touch-fix.md` §1 over the functions the shells will be filled into.
2. ADR in `docs/adr/` (format per `mattpocock-skills:domain-modeling`), body = the rationale
   (`references/rationale-template.md`) plus *Touched neighbours* (the touch table) and *Cost line*.
3. Checkpoint only with `--checkpoint`: show the shape, wait.
4. Commit the shells and the ADR: `feat(scaffold): <feature> shape (ADR NNNN)`. Shells import
   cleanly and nothing calls them yet, so every suite stays green.

**Phase D/E — Implement, scrap.** Not run here. Hand off to `/to-tickets` with: the ADR, the shell
paths, and the touch table. Tickets may name **shell paths only** — they are committed, not guesses.
Each `fix` row becomes its own cleanup ticket blocking the feature ticket that touches it; each
`file` row an issue. Builders report any pstack Phase D deviation; Phase E tells in two or more
reports → rerun this skill.
