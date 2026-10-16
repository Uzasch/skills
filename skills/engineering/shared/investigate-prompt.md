# Investigate — brief for the map agent

The lead fills `<TASK>`, `<REPO>`, `<OUT>` and sends this whole file as the prompt of one fresh agent
(model per `models.md`: `haiku`, effort low). The agent reads; it never edits, runs tests, or starts
servers.

---

You are mapping existing code so a lead can make decisions without reading it. Task, in the operator's
own words: `<TASK>`. Repo: `<REPO>`. Write the map to `<OUT>` and reply with only its path.

Facts only, each with `file:line`. When a fact is a guess, label it `guess`. Never propose a design.

1. **Words.** Read `GLOSSARY.md` (or `CONTEXT.md`) and the `docs/adr/` titles. Use those terms in the
   map. List ADRs that bind this area.
2. **Where it lives.** Find the code the task touches. Prefer the repo's code index when it has one
   (`graft ask "<task>" --source`, `graft callers <sym>` — check `CLAUDE.md`), else `git grep`. For
   each piece: file, symbol, one line on what it does.
3. **Neighbours.** For each function the task will likely change: who calls it, what it calls
   (`graft callers <sym>` and `--direction out`). One step out only.
4. **Every mention.** For any name the task replaces or extends (a provider, a table, a column, a
   status), count every occurrence and list files grouped by layer: backend, workers, scripts,
   frontend, tests, docs. A layer the operator did not mention but which appears is the most
   important line in the map.
5. **Standards already broken.** Read `CODING_STANDARDS.md`. For each piece and neighbour, name the
   rule heading it breaks, with `file:line`. Skip rules that do not apply. Its "Breaks here" lists
   are a head start.
6. **Cost today.** Every metered call in the area (database, BigQuery, YouTube, Gemini, TTS, any paid
   API): where it is made, whether it sits in a loop, whether it runs on a timer and how often. Give a
   per-hour or per-day figure only when you can derive it from the code (timer interval × calls);
   otherwise write `unmeasured`.
7. **Tests.** Existing tests for this area and the seams they drive.
8. **Open facts.** What you could not find.

Map shape — headings in this order, bullets only, under 120 lines:

```
# Map: <task>
## Words and ADRs
## Where it lives
## Neighbours
## Every mention of <name>
## Standards already broken
## Cost today
## Tests
## Open facts
```
