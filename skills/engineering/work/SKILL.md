---
name: work
description: Use when the operator hands over a task to just get done with no decisions from them — "/work <bug | change | cleanup | slowness | issue list | feature>". Picks one lane (bug fix, small change, refactor, cost/slowness, issue list, feature without grilling), copies that lane's steps into the todo list, maps the code first, fixes touched neighbours up to CODING_STANDARDS.md, verifies on the real app, and reports back. Not for work where the operator wants to decide how it looks or behaves — that is /grill-deep → /to-spec.
argument-hint: "<the task, or issue #s>"
disable-model-invocation: true
---

pstack's router (`poteto-mode`), cut to six lanes. Lane steps are pstack's playbooks word for word in
`playbooks/`; read their names through `../shared/pstack-names.md`. Autonomy and the todolist rule
are `references/pstack-autonomy.md`. Models: `../shared/models.md`. You lead; agents do hands-on work.

## 1. Pick the lane

Ask the Decisions API (`../shared/decisions.md`) one `choice` over the lanes below plus `unclear`,
input = the operator's words. `unclear`, below 0.7 confidence, or no key → pick yourself. Say the lane
in one line and go.

| Lane | Steps |
|---|---|
| Bug fix — something broken | `playbooks/bug-fix.md`; after the cause is found, grep every caller and sibling with the same fault and fix once where they all route; three failed fixes → stop, question the design, write what the three share and report it as a finding |
| Small change — new or changed behaviour inside existing functions | `playbooks/feature.md`, step 2 `skip: no new function boundary` |
| Refactor / cleanup — structure only, e.g. a "Breaks here" line of `CODING_STANDARDS.md` | `playbooks/refactoring.md` |
| Cost / slowness — egress, BigQuery bytes, API calls, a slow page | `playbooks/perf-issue.md`; measure with `../shared/cost.md` |
| Issue list — issue numbers or a `.scratch/<slug>/issues/` folder | run `ship-tickets` with them; this skill ends there |
| Feature — new module or new shape, no grilling | `playbooks/feature.md`, steps replaced as below |

## 2. Copy the steps, then add these

Copy the lane's steps into the todo list verbatim (`references/pstack-autonomy.md`, *Todolist rule*);
with no todo tool, keep them in `$RUN/todo.md`. Then add, in every lane that changes code:

- **First item — Map.** One agent with `../shared/investigate-prompt.md` → `$RUN/map.md`, launched
  with `model: "haiku"`, `effort: "low"`, `subagent_type: "general-purpose"` on the Agent call
  (`RUN=.review-loop/<slug>`). This is the playbook's `how` step. When the task names one function
  or file, the lead may skip the Map; it then runs `graft grep` for the rule's owner and its copies
  and writes both into the touch table before any code.
- **Right after the map — Touch table + gate.** `../shared/touch-fix.md` §1 and its blocking gate,
  before any code is written.
- **Before the verify step — Touch fix.** `../shared/touch-fix.md` §2–3.
- **Live repair** — when the issue asks to repair live data: the operator's yes, back up what you
  change, a dry run that prints the change, apply, then within a minute confirm the worker log shows
  the task `received` (else it sits on a queue no worker reads).
- **In the reply — Cost line** (`../shared/cost.md`) for any metered call the change adds or removes.

**Feature lane.** Replace `feature.md` steps 2–4 with: follow `mattpocock-skills:to-spec`'s steps
(read its SKILL.md; you write the spec, no interview) → `architect` → follow
`mattpocock-skills:to-tickets`'s steps, its *Quiz user* step replaced by a ticket check
(`../shared/decisions.md`: each ticket names its test seam and cost line) → `ship-tickets`.
`to-spec`, `to-tickets` and `ship-tickets` are user-invoked only: read each one's SKILL.md and
follow it, never the Skill tool. Every call
the grill would have asked, decide and list under *Decisions I made* in the reply.

## 3. Finish

Code lanes end with `review-loop` (Codex) when the branch touches more than one area or sign-in,
money, concurrency or publishing; else the Touch fix close check and the lane's verify are the gate.
Open the PR per `pstack-names.md`. Reply per the playbook's **Reply** line, plus *Decisions I made*,
the touch table, and the cost line. Pause only per *Autonomy*.
