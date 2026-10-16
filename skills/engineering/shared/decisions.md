# Fast verdicts — OpenAI Decisions API

Seconds-fast answers to questions we write. It reads text **and images**. It answers; it never writes
text and never finds what nobody asked about. Use it to **sort**, never to **find**.

Call it through `scripts/decide.py` (stdlib only, no SDK):

```bash
SHARED="${SELF_ROOT%/}/skills/engineering/shared"
python3 "$SHARED/scripts/decide.py" request.json > answers.json   # exit 3 = no key → fall back
```

`request.json`:

```json
{
  "text":   ["Ticket: the Calendar shows an error line when the month fetch fails."],
  "images": ["/abs/path/after.png"],
  "questions": [
    {"type": "choice", "name": "state", "instructions": "What does the screenshot show?",
     "choices": [{"value": "promised", "description": "the result the ticket promised"},
                 {"value": "error", "description": "an error box or message"},
                 {"value": "empty", "description": "an empty list or zero"},
                 {"value": "loading", "description": "a spinner or skeleton"},
                 {"value": "blank", "description": "a blank or broken page"},
                 {"value": "unclear", "description": "none of these, or cannot tell"}]},
    {"type": "predicate", "name": "overlap", "instructions": "Does any text overlap other text?"}
  ]
}
```

Answers: `predicate` → `probability` 0–1; `choice` → `choice` + `confidence`.

## Rules

- **Always an `unclear` way out.** Every `choice` lists `unclear`; a `predicate` between 0.3 and 0.7
  counts as unclear. Unclear → a real agent looks.
- **`refusal` is unknown, never no.** Same path as unclear.
- **A bad verdict blocks; a good one never passes alone.** "Error" stops the run. "Promised" only
  lets the real check go faster — the verifier still drives the page.
- **Many independent questions, one call** — one predicate per touched neighbour, per screenshot
  state. A question that needs another's answer is a second call.
- **Images are inline base64** (the script does it). No URLs.
- **Rate:** at most 3 calls at once; on 429 the script waits 20 s, 3 tries max.
- **Key missing** (exit 3) → skip the fast check, give the job to the model the table names. Never
  stop the run for it.

## Where the skills use it

| Where | Question |
|---|---|
| `work` start | which lane (`choice`) |
| verifier screenshots | screen state (`choice`) + a predicate per promised element |
| before / after screenshots of a cleanup | "Do these two screens differ in layout or content?" |
| touch-fix close | per neighbour: `fixed` / `filed` / `missed` against the touch list |
| ticket check | per ticket: names its test seam? its cost line? |
| review triage first pass | per finding: `real` / `noise` / `unclear` — only sets the order Opus reads them in; Opus still decides every one |
