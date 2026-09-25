# skills

Uzasch's agent skills, as a Claude Code plugin.

```
/plugin marketplace add https://github.com/Uzasch/skills.git
/plugin install uzasch-skills@uzasch
```

Use the full `https://` URL — the `Uzasch/skills` shorthand resolves to SSH and fails without a key.

## `/ship-tickets`

```
/ship-tickets <issue #s | .scratch/<slug>/issues/> [--rounds N] [--reviewer codex|claude|agy]
```

For the 4-5 tickets `/to-tickets` makes. `/implement-gate` (ponytail + code index: build / reuse /
skip) sorts them into waves by `Blocked by` plus a file-overlap check. Each wave runs in parallel
via `workflow-authoring`: a builder agent per ticket (`tdd`), then a separate reviewer agent per
ticket (superpowers spec → quality). Between waves: suite, one commit per ticket. Then the session
reviews the whole branch itself, runs `/implement-loop`'s independent review loop, walks the change
in the running app with Playwright (following the repo's user-testing doc), checks backend logs
and database rows, and ends with an artifact: caveman summary + screenshots.

## `/implement-loop`

```
/implement-loop <issue #s | PRD path | "description"> [--rounds N] [--fanout]
                [--reviewer codex|claude|agy] [--reviewer-model <id>]
```

`/implement-gate` first (ponytail ladder per criterion: build / reuse / skip, and a fan-out
verdict — never skipped), then Matt Pocock's `/implement` (`/tdd` at the seams, tests, self-review, commit — called unchanged),
then an **independent review loop**: a reviewer reviews `BASE...HEAD` in a fresh session each round,
Claude triages every finding against the ADRs and the issue, fixes what it accepts, answers back —
until the reviewer approves, the round cap hits, or it deadlocks. Ends with a drift report of
everything built beyond the issue and the ADRs.

Run it from the tree you want built — it makes no branch or worktree, and uses `HEAD` at start as
the review base.

```
/implement-loop #142 #143
/implement-loop docs/prd/checkout-v2.md --rounds 3 --reviewer claude
/implement-loop #88 --reviewer agy --reviewer-model gemini-3.7-flash-medium
```

| flag | |
| --- | --- |
| `--rounds N` | review-round cap. Default 5, min 2. |
| `--fanout` | consent to split a too-big build across parallel agents (else the skill proposes a split and waits). |
| `--reviewer` | `codex` (default), `claude`, or `agy`. Same loop either way. |
| `--reviewer-model` | passed verbatim to that backend; omit for its default. No allow-list — a bad id fails in the backend. |

| `--reviewer` | runs | needs | `--reviewer-model` |
| --- | --- | --- | --- |
| `codex` | `codex exec` per round | `codex` CLI | any `codex -m` id, e.g. `gpt-5.6-terra` (`/model` in `codex` lists them) |
| `claude` | a fresh `general-purpose` subagent | — | bare `sonnet` \| `opus` \| `haiku` \| `fable` (no version) |
| `agy` | Antigravity CLI, print mode | `agy` CLI | full `agy models` id incl. effort suffix, e.g. `gemini-3.7-flash-medium` |

Reviewer launches are non-interactive; whitelist `codex` / `agy` for a hands-off run. The run
writes to `.codex-review/<slug>/` (git-excluded): per-round `prompt.md` / `handoff.md` / log, and a
flat `findings.md`. `mattpocock-skills` and `ponytail` install with this plugin: build skills and the gate's ladder.
The builder / spec / quality reviewer prompts are copied from Superpowers (Jesse Vincent, MIT) into
`ship-tickets/references/`. A fan-out loads the built-in
`workflow-authoring` skill. Subagent reports and the final summary are caveman style.

`codex-skill/` is the reviewer brief — symlinked into `~/.codex/skills/` for `codex`, pasted into
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
