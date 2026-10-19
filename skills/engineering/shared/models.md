# Models — who does which job

One table for `architect`, `grill-deep` and `work`. Change a model here, never in a skill. Set `model`
(and `effort`) on **every** Agent / Workflow call; an agent with none inherits the lead's Opus.

| Job | Model | Effort | Why |
|---|---|---|---|
| Lead — runs the steps, judges every report | the session (Opus) | — | judgment; the only one who decides |
| Investigate map | `haiku` | low | read-only, many files, cheap |
| Builders, fixers, verifier | `sonnet` | medium (fixers high) | strong coder, cheap |
| Hardest builds — sign-in, money, concurrency, live publishing; or Sonnet failed twice | `opus` | high | mistakes cost most here |
| Architect design A | `opus` | high | |
| Architect design B | Agy `gemini-3.8-flash-high` | — | a different family, so the two designs really differ; no Codex quota spent |
| Architect design B fallback (agy missing or failed) | `opus`, briefed "must differ in whole shape from A" | high | |
| Prototype runs (when designs disagree on a fact) | `sonnet` | medium | |
| Code review (`review-loop`) | Codex `gpt-6.1-sol` | medium; high for risky rounds | different family; the **only** Codex use |
| Second opinion on a contested design | Agy `gemini-3.8-flash-high` | — | third family |
| Fast verdicts — sorting, screenshot state, yes/no checks | Decisions API `gpt-6-luna` (`shared/decisions.md`) | — | seconds, near-free, reads images |

Rules:

- **At most one Opus agent at a time**; everything else Sonnet (weekly usage limit). A dead agent's diff
  is committed `wip: <ticket> (agent stopped: usage limit)` and named in the next brief.
- **Codex is weaker than Opus.** It is a second pair of eyes from another family, never the final
  word. Opus triages every Codex finding (`review-loop` §2.3).
- **Codex quota is small** ($20 plan). Spend it on code review only. Never `gpt-6-astra`. Never Codex
  for designs, prototypes or builds.
- **Codex quota hit** mid-run → that round goes to `--reviewer agy`; say so in the run notes.
- **Not used:** Fable, `gpt-5.6-*`, `gpt-6-astra`.
- **Decisions API key is for the Decisions API only** (`OPENAI_DECISIONS_KEY`). Nothing else spends it.

Agy launch (design B, second opinion) — prompt only through `-p`, never stdin; 5-minute default
timeout is too short:

```bash
( cd "$WORKDIR" && agy --output-format text --dangerously-skip-permissions --print-timeout 30m \
    --model gemini-3.8-flash-high -p "$(cat "$PROMPT")" ) > "$OUT" 2> "$OUT.log"
```
