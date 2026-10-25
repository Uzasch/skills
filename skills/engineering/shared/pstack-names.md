# Reading pstack text in this harness

Files copied from pstack (Lauren Tan, MIT — `LICENSE-pstack`) are kept word for word. They name
Cursor tools and skills we do not have. Read each name as its row says.

| pstack says | Do this |
|---|---|
| `how` skill (explore a subsystem) | one agent with `shared/investigate-prompt.md` |
| `why` skill | `git log -L` / `git blame` on the lines, plus the ADRs the map lists |
| `arena` in a design step | `architect/SKILL.md` Phase B — two runners, the lead picks and grafts |
| `arena` in a build step (`feature.md` step 4) | one builder per `models.md`; the bakeoff is `skip: not in this harness` |
| `interrogate` | one Agy second opinion (`models.md`), the lead triages it |
| control skill / `control-ui` / `control-cli` / "matching surface" | the repo's verify recipe (`.claude/skills/verify/SKILL.md`, `CLAUDE.md`'s user-testing doc) |
| model slugs (`grok-…`, `claude-opus-…-xhigh`), `pstack-models.mdc`, `/setup-pstack`, "Subagents section" | `shared/models.md` |
| `poteto-agent`, Cursor `Task`, `readonly` | Agent tool with the model `models.md` names |
| `tdd` skill | `mattpocock-skills:tdd` |
| `benchmark-checklist` | `shared/benchmark-checklist.md` |
| `principle-explain-the-number` | `shared/explain-the-number.md` |
| other `principle-*` skills | not installed — the sentence naming it is the whole rule |
| Hillclimb playbook | not copied — run the cost lane again |
| `figure-it-out`, `swarm`, `deslop`, `no-comments` | not used here — skip with `skip: not in this harness` |
| **Opening a PR** | push the branch; `gh pr create` with `mattpocock-skills:pr` for the body |
| "Comments" rule | keep a comment only for a why the code cannot show |
| `AskQuestion` | ask in plain text, only where *Autonomy* allows a pause |
| `unslop`, `/unslop`, `/technical-writing` | chat and issue text follow AGENTS.md "Talking to the user"; a file follows the repo's house style |
| `show-me-your-work` (checkpoint, trail) | one row per decision in `$RUN/decisions.tsv` (what, why, evidence, result) |
| `poteto-mode` (fix it "via poteto-mode") | `work` |
| Cursor's built-in babysit skill | `playbooks/babysit.md`, never `claude-mem:babysit` |
| `scripts/watch-pr/watch-pr`, `READY` / `WAITING` / `ADVANCE` / `COMPLETE` | `gh` only: `gh pr checks <pr> --watch`, `gh pr view <pr> --json mergeable,mergeStateStatus,reviewDecision`, threads via `gh api`; `READY` = checks green, mergeable, no open threads — stop there |
| `origin pr …`, Origin forge, Graphite `gt` | not in this harness — `gh` only |
| Bugbot, security-reviewer, `../references/bugbot-triage.md` | their comments are ordinary review threads — triage each against the code like a Codex finding (`review-loop` §2.3); a step that starts or waits for Bugbot is `skip: not in this harness` |
| `/loop` as a wake mechanism (babysit, autonomous run) | no `/loop`: wait on one background `gh pr checks <pr> --watch`, or a Monitor until-loop for a non-PR event |
| Cursor cloud agents, cloud VM, cloud-agent URL | a cloud worker is an Agent with `isolation: "worktree"`; a step that needs the cloud machine itself is `skip: not in this harness` |
| `agent-transcripts/`, `~/.cursor/projects/` | `~/.claude/projects/<slug>/<session>.jsonl` (slug = workspace path with each `/` and `.` as `-`); read only this workspace's folder |
| `playbooks/shipping.md`, "Shipping", land / merge a PR | not copied — merging a PR needs the operator's explicit yes (AGENTS.md); stop at merge-ready and ask |
| `playbooks/autopilot-full.md`, `autopilot-stack.md`, `orchestrate.md` | not copied — the execution playbook is `ship-tickets` (waves of tickets) |
| `check-plan.mjs` | not shipped — `skip: not in this harness`; check the plan against the skeleton by hand |
| "the agent store's `docs/`" (plan file path) | `$RUN/plan.md`, unless the operator names a path |
| "fast or standard speed", "reasoning level" | effort per `shared/models.md` Routing; there is no speed setting |
