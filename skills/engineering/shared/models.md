# Models — who does which job

One table for `architect`, `grill-deep`, `work` and `ship-tickets`. Change a model here, never in a skill. Set `model`
(and `effort`) on **every** Agent / Workflow call; an agent with none inherits the lead's Opus.

| Job | Model | Effort | Why |
|---|---|---|---|
| Lead — runs the steps, judges every report | the session (Opus) | — | judgment; the only one who decides |
| Investigate map | `haiku` | low | read-only, many files, cheap |
| Builders, fixers, verifier | `sonnet` | medium (fixers high) | strong coder, cheap |
| Hardest builds — sign-in, money, concurrency, live publishing; or Sonnet failed twice | `opus` | high | mistakes cost most here |
| Risk-tier per-ticket review (`ship-tickets`), Spec + Standards in parallel | Agy `gemini-3.8-flash-high` | — | cheap, a different family from the Claude builder; no Codex quota |
| Risk-tier per-ticket review fallback (agy usage exhausted, missing or failed) | `sonnet` (`review_model`) | medium | the reviewer used before agy |
| Agy runner (`ship-tickets` `wave.js`: runs the agy line, relays the review) | `sonnet` | low | `wave.js` can only call Claude agents |
| Architect design A | `opus` | high | |
| Architect design B | Agy `gemini-3.8-flash-high` | — | a different family, so the two designs really differ; no Codex quota spent |
| Architect design B fallback (agy missing or failed) | `opus`, briefed "must differ in whole shape from A" | high | |
| Prototype runs (when designs disagree on a fact) | `sonnet` | medium | |
| Code review (`review-loop`) | Codex `gpt-6.1-sol` | medium; high for risky rounds | different family; the **only** Codex use |
| `reflect` reviewers (judgment, tooling, divergent) | `sonnet` | via Routing | read a transcript, list findings |
| `reflect` synthesizer | `opus` | via Routing | judgment: accepts or rejects every finding |
| Second opinion on a contested design | Agy `gemini-3.8-flash-high` | — | third family |
| Fast verdicts — sorting, screenshot state, yes/no checks | Decisions API `gpt-6-luna` (`shared/decisions.md`) | — | seconds, near-free, reads images |

## Routing

The table is the **default**; one Decisions call per spawn may move it.

- **Ask.** At each spawn, one `scripts/decide.py` call (`decisions.md`) takes a short job description
  (ticket text, files touched, risk flags) and answers two `choice` questions: model (`haiku`, `sonnet`,
  `opus`, `3.8-flash`, `unclear`) and effort (`low`, `medium`, `high`, `unclear`).
- **One setting per role.** A ticket's model is set per job: `build_model` (builder), `review_model`
  (Claude reviewer, only when agy is off or down), `fix_model` (fixer) — each falls back to `model`, then
  to `sonnet`. `ship-tickets` passes these in `wave.js` / `close.js` args. An `opus` ticket sets only the
  role that is hard (usually `build_model`); reviewers are agy and fixers stay `sonnet` until a fix fails
  twice (then `fix_model: opus`). Setting only `model: opus` still moves all three to Opus.
- **One step.** The answer may move the default one step either way on model (`haiku` → `sonnet` →
  `opus`) or effort (`low` → `medium` → `high`), never below a floor.
- **Floors** — fixed, never decided by the API: sign-in, money, concurrency and live publishing =
  `opus` + `high` at least; a job that already failed twice = `opus`; code review stays Codex
  `gpt-6.1-sol` (Agy on quota hit); architect designs A and B stay as in the table.
- **`3.8-flash`** runs only through the agy launch below, so only for read-only, prompt-in text-out jobs
  (second opinion, design B, analysis), never a builder. The Agent tool's `model` takes only `opus`,
  `sonnet`, `haiku`, `fable`.
- **Fallback.** `unclear`, confidence under 0.7, or no key (exit 3) → the table's default.
- **Log** every routing decision in `$RUN/routing.tsv`: job, model and effort chosen, confidence, what
  was finally used.

## Rules

- **Sonnet is the default**, the efficient model; Opus only for the floor jobs or when routing picks it;
  no fixed cap on how many. A dead agent's diff is committed `wip: <ticket> (agent stopped: usage
  limit)` and named in the next brief. A fix round gets a fresh agent with the full brief.
- **Codex is weaker than Opus.** It is a second pair of eyes from another family, never the final
  word. Opus triages every Codex finding (`review-loop` §2.3).
- **Codex quota is small** ($20 plan). Spend it on code review only. Never `gpt-6-astra`. Never Codex
  for designs, prototypes or builds.
- **Per-ticket review (risk tier) runs on agy** `gemini-3.8-flash-high`, Spec and Standards at the same
  time. **Route: a small Sonnet agent in `wave.js`** writes the review prompt to `$WAVE/agy-<kind>-<B>-r<n>.prompt`, runs
  the "Agy launch" line below with `OUT` next to it, and returns agy's review (its closing json block) in
  the wave schema — `wave.js` can only call Claude agents, and the lead must not spend context on it.
  Agy missing, a usage / quota / rate-limit message in `OUT` or `OUT.log`, a crash or no parsable review
  → that review (and the rest of the wave's) falls back to the Claude reviewer at `review_model`
  (`sonnet` default); the wave result says `reviewer: claude (agy off/down)`. Say so in the run notes.
- **Review split:** `review-loop` runs Codex on the Spec axis only and agy on Standards, in parallel —
  one Codex run per round, not two.
- **Codex quota hit** mid-run → that axis goes to `agy` for the round (`review-loop` §2.2); say so in the run notes.
- **Not used:** Fable, `gpt-5.6-*`, `gpt-6-astra`.
- **Decisions API key is for the Decisions API only** (`OPENAI_DECISIONS_KEY`). Nothing else spends it.

Agy launch (design B, second opinion, `ship-tickets` risk-tier review) — prompt only through `-p`, never stdin; 5-minute default
timeout is too short:

```bash
( cd "$WORKDIR" && agy --output-format text --dangerously-skip-permissions --print-timeout 30m \
    --model gemini-3.8-flash-high -p "$(cat "$PROMPT")" ) > "$OUT" 2> "$OUT.log"
```
