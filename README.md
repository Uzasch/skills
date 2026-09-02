# skills

Uzair's agent skills, as an installable Claude Code plugin.

```
/plugin marketplace add https://github.com/Uzasch/skills.git
/plugin install uzasch-skills@uzasch
```

Use the full `https://` URL, not the `Uzasch/skills` shorthand — the shorthand resolves to
`git@github.com:` and fails with `Permission denied (publickey)` on any machine without a GitHub
SSH key, even though this repo is public.

## Skills

### engineering

**`/implement-loop <issue #s | PRD path> [--rounds N] [--fanout] [--reviewer codex|claude|agy] [--reviewer-model <id>]`**

Matt Pocock's `/implement` with two things added: an **independent review loop**, and an
**orchestrator for specs too big for one context**.

- **Implement** — calls his `/implement` unchanged, which runs `/tdd` at the seams and ends in his
  two-axis `/code-review` and a commit. Nothing is reimplemented here; that skill owns the build.
- **Review loop** — an independent reviewer reviews the committed diff, in a **fresh session every
  round**. Continuity is carried in the prompt — the prior findings verbatim, plus what Claude did
  about each — rather than in a resumed thread, so the reviewer's inputs stay inspectable and
  correctable instead of living as hidden state. Claude triages every finding against the ADRs and
  the originating issue, fixes what it accepts, and answers back. Repeats until the reviewer
  approves or the round cap is hit. Claude's own self-review is deliberately withheld from round 1
  — a primed reviewer is not an independent one.
- **Pluggable reviewer** — `--reviewer` picks who runs that review: `codex` (default, `codex exec`),
  `claude` (a fresh `general-purpose` subagent), or `agy` (Google Antigravity's CLI in print mode).
  `--reviewer-model` is passed straight through to that backend's own model selector (`codex -m`,
  `agy --model`, the subagent's `model`) — no allow-list, so a new model id needs no skill change.
  `agy` fronts several model families itself (Gemini 3.x, Claude, GPT-OSS), so
  `--reviewer agy --reviewer-model gemini-3.1-pro-high` and the like all work. The loop, triage, and
  exit conditions are identical whichever you pick.
- **Orchestrator (ultracode)** — a spec too large for one context is fanned out across parallel
  agents via the Workflow tool, behind a size gate, with a slice map and a seams list so
  cross-slice inconsistency is reviewable as a Standards finding. Opt-in via `--fanout`; without
  it the skill sizes the issue, proposes the split, and stops for an answer rather than spending a
  fleet on its own initiative.

Ends with a drift report: everything built beyond the issue and beyond the ADRs.

Install `uzasch-skills` and `mattpocock-skills` comes with it, for the build and review skills. You
do not add that marketplace yourself.

Phase 1 is a dozen lines because his `/implement` does the work. The rest is the review loop and the
fan-out — the parts he does not have. There is no journal, no run ledger and no orchestration
contract: each round is a directory holding `prompt.md`, `handoff.md` and a raw log, and the
only durable state is a flat `findings.md` of verdicts, which exists because a rejection reason has
to go back to the next reviewer verbatim.

`codex-skill/` inside it is the **reviewer brief**. With `--reviewer codex` it is symlinked into
`~/.codex/skills/` and Codex discovers it by name; with `--reviewer claude` or `--reviewer agy` it
is pasted into the round prompt instead, since neither has a skill to discover. Either way it is not
a Claude skill and never appears in Claude's skill picker.

## Requirements

`mattpocock-skills` is a declared dependency and installs automatically. You also need `gh`, plus
the CLI for whichever reviewer you run: `codex` (the default) or `agy` (Google Antigravity),
authenticated. `--reviewer claude` needs nothing extra — it runs as a subagent.

## Adding a skill

1. Create `skills/<category>/<name>/SKILL.md`.
2. Add `"./skills/<category>/<name>"` to the `skills` array in `.claude-plugin/plugin.json`.
3. Bump `version` in `plugin.json` so installed copies pick it up.
4. `claude plugin validate . --strict`

The array is required rather than optional: the default scan only finds `skills/<name>/SKILL.md`
one level deep, so nothing under a category directory is auto-discovered. The upside is that
`skills/in-progress/` is a real staging area — a skill can sit there version-controlled but
unshipped until you list it.

## What it expects from a repo

Nothing hardcoded — the skill names no repo, branch, service, or interpreter. It reads them:

- **Interpreter, test, lint and forbidden build commands** from the repo's `CLAUDE.md`, including
  any pre-existing lint baseline it records.
- **Issues** from `docs/agents/issue-tracker.md` if present, otherwise `gh` / the PRD path you pass.
The skill does not create branches or worktrees and does not resolve a trunk to diff against. You
put it in the tree you want built — a worktree you made, or a branch you are already on — and it
takes `HEAD` at the moment it starts as the review base, or a commit you name. Nothing is ever
compared against `main` on its own initiative.

## Credits

The build and review are [Matt Pocock's](https://github.com/mattpocock/skills) `/implement`,
`/tdd` and `/code-review` (MIT), installed from upstream and called unchanged. This repo adds the
review loop and the fan-out around them. `codex-skill/references/smell-baseline.md` is the one
derived file, carried because an out-of-process reviewer cannot read Claude's skills.
