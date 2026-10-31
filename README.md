# skills

Uzasch's agent skills, as a Claude Code plugin.

```
/plugin marketplace add https://github.com/Uzasch/skills.git
/plugin install uzasch-skills@uzasch
```

Use the full `https://` URL — the `Uzasch/skills` shorthand resolves to SSH and fails without a key.

## `/work`, `/grill-deep`, `architect`

Ideas and text from [pstack](https://github.com/cursor/plugins/tree/main/pstack) (Lauren Tan, MIT,
`skills/engineering/shared/LICENSE-pstack`); its playbooks and architect files are copied word for word.

- `/work <task>` — no decisions from you: picks a lane (bug fix, small change, refactor, cost,
  issue list, feature, investigation, prototype, resume, babysit, autonomous run, multi-phase), maps the code, fixes touched neighbours to `CODING_STANDARDS.md`, verifies.
- `/grill-deep <idea>` — maps the code, then Matt's `grill-with-docs`.
- `/reflect` — three reviewers read this chat for lessons; proposes skill edits as patches, applies nothing.
- `architect` — between `/to-spec` and `/to-tickets`: two designs (Opus + Gemini), prototypes settle
  facts, ADR, empty function shells committed.

Shared: `skills/engineering/shared/` — `models.md` (who does what), `decisions.md` +
`scripts/decide.py` (OpenAI Decisions API, key read from an env file: `DECISIONS_ENV_FILE` + `DECISIONS_KEY_NAME`), touch fix, cost, investigate.

## `/ship-tickets`

```
/ship-tickets <issue #s | .scratch/<slug>/issues/> [--rounds N]
              [--spec-reviewer codex|claude|agy] [--standards-reviewer agy|codex|claude]
              [--reviewer <both>] [--reviewer-model <id>] [--no-codex-runs]
```

For the 4-5 tickets `/to-tickets` makes. `/implement-gate` (code index: build / reuse / skip) sorts
them into waves by `Blocked by` plus a file-overlap check. Each wave runs in parallel
via `workflow-authoring`: a builder agent per ticket (`tdd`); only risk-tier tickets (sign-in,
money, publishing…) also get a per-ticket reviewer (superpowers spec → quality). Between waves:
affected tests, one commit per ticket, a red-proof replay, a verifier for each ticket a user can
see. Full suites once, then one walk of the flows that cross tickets, then the independent review
loop (`review-loop`, the only whole-branch code read: Codex on Spec + agy on Standards, in parallel), walking the change in the running app with Playwright (following the repo's user-testing doc), checks backend logs
and database rows, and ends with an artifact: caveman summary + screenshots.

| flag | |
| --- | --- |
| `--rounds N` | review-round cap. Default 3, min 2. |
| `--spec-reviewer` | Spec axis (+ correctness, runs tests and the app): `codex` (default), `claude`, or `agy`. |
| `--standards-reviewer` | Standards axis (reads + linters only): `agy` (default), `codex`, or `claude`. |
| `--reviewer` | sets both. |
| `--spec-model` / `--standards-model` / `--reviewer-model` | passed verbatim to that backend; omit for its default. No allow-list — a bad id fails in the backend. |
| `--no-codex-runs` | Codex reviews without sandbox network (static reads only). |

| backend | runs | needs | model flag |
| --- | --- | --- | --- |
| `codex` | `codex exec` per round | `codex` CLI | any `codex -m` id, e.g. `gpt-5.6-terra` (`/model` in `codex` lists them) |
| `claude` | a fresh `general-purpose` subagent | — | bare `sonnet` \| `opus` \| `haiku` \| `fable` (no version) |
| `agy` | Antigravity CLI, print mode | `agy` CLI | full `agy models` id incl. effort suffix, e.g. `gemini-3.7-flash-medium` |

Reviewer launches are non-interactive; whitelist `codex` / `agy` for a hands-off run. The run
writes to `.review-loop/<slug>/` (git-excluded): per round and axis `prompt.md` / `handoff.md` / log,
a flat `findings.md`, and `todo.md` — the work list: anything found mid-run that is worth doing is
built in the same run, never filed as an issue. `mattpocock-skills` installs with this plugin (build skills). The `ponytail` and `ponytail-review` skills are bundled (MIT, Dietrich Gebert, `skills/engineering/ponytail/LICENSE-ponytail`) — without the upstream plugin's always-on hooks.
The builder / spec / quality reviewer prompts are copied from Superpowers (Jesse Vincent, MIT) into
`ship-tickets/references/`. Subagent reports and the final summary are caveman style.

The loop itself is the shared `review-loop` skill, used by `/ship-tickets` and `/work`.
`review-loop/codex-skill/` is the reviewer brief — symlinked into `~/.codex/skills/` for `codex`, pasted into
the prompt for `claude` / `agy`. Not a Claude skill; never in the picker.

## `/scene-summary`

```unknown
/scene-summary <video file or folder> [cast list]
```

Samples up to 80 frames per episode, sends them to Gemini (`gemini-2.5-flash`, thinking off) and
writes `<video>_scenes.md` next to it: a 2-3 sentence **Description** and a numbered **Scene
Summary** (no timestamps). Give it the cast ("Kent: the purple elephant; ...") and it names
characters instead of describing them. Pictures only, no audio.

Needs `ffmpeg`, Python 3, and a Gemini API key in `GEMINI_API_KEY`
(free at https://aistudio.google.com/apikey). No `pip install`.

## Adding a skill

1. Create `skills/<category>/<name>/SKILL.md`.
2. Add `"./skills/<category>/<name>"` to `skills` in `.claude-plugin/plugin.json`.
3. Bump `version` in `plugin.json`.
4. `claude plugin validate . --strict`

The `skills` array is required — the default scan only finds `skills/<name>/SKILL.md` one level
deep, so `skills/in-progress/` works as an unshipped staging area.
