# Screenshot checks through the Decisions API

For every verifier (`ship-tickets`, `work` playbooks) that takes screenshots of a page. A fast
model sorts the screen state; the verifier still decides the verdict. Wording and request shape:
`decisions.md`; call `scripts/decide.py` as shown there (exit 3 = no key → the verifier looks at every
screenshot itself).

## Ask

One call per verify step, all screenshots of that step in `images`, `text` = the ticket's words.
One `choice` question per screenshot (`name` = the file), with **detailed options — each a full screen
state**, written for the page under test. Template (change the nouns to the ticket's page):

```json
{"type": "choice", "name": "after.png", "instructions": "Which full screen state does this screenshot show?",
 "choices": [
  {"value": "ok", "description": "the result the ticket promised is on screen, e.g. a card with its title and duration"},
  {"value": "empty", "description": "the page loaded and shows its empty state: no card, an empty-list message or a zero"},
  {"value": "error", "description": "an error message, red box or failed-request line is visible"},
  {"value": "spinner", "description": "a spinner or skeleton with no content, as if loading never stops"},
  {"value": "broken", "description": "blank page, overlapping or cut-off layout, raw JSON, a crash screen"},
  {"value": "unclear", "description": "none of these, or cannot tell"}]}
```

Add one `predicate` per promised element that must be visible ("Does the card show a title and a
duration?").

## Read the answer

- `error`, `spinner`, `broken`, or a `predicate` under 0.3 → the ticket **fails**; attach the
  screenshot. A broken state is never talked away as "probably the environment".
- `unclear`, `choice` confidence under 0.7, a `predicate` between 0.3 and 0.7, `refusal` → the verifier
  looks at that screenshot itself and decides.
- `empty` fails unless the ticket says the empty state is the expected result.
- `ok` with confidence 0.7 or more only lets the verifier go faster. An expected answer alone never
  passes a ticket: the verifier still drives the page, looks at the screenshot, and runs its probe.
- Every answer, with its confidence, goes in the verifier's `steps` evidence.
