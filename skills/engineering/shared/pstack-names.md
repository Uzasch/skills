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
| `figure-it-out`, `swarm`, `deslop`, `no-comments`, `/loop` | not used here — skip with `skip: not in this harness` |
| **Opening a PR** | push the branch; `gh pr create` with `mattpocock-skills:pr` for the body |
| "Comments" rule | keep a comment only for a why the code cannot show |
