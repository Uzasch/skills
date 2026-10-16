---
name: grill-deep
description: Use instead of /grill-with-docs when grilling about a feature or change to existing code — first maps what the code already does (where it lives, every mention, broken standards, today's cost), then runs Matt's grill-with-docs so the questions are only real decisions, recording ADRs and glossary terms as it goes.
argument-hint: "<the idea, in one line>"
disable-model-invocation: true
---

1. **Map.** One agent with `../shared/investigate-prompt.md` (model per `../shared/models.md`),
   `<TASK>` = the operator's words. Read the map; open no source yourself.
2. **Grill.** Do what `mattpocock-skills:grill-with-docs` says: call the Skill tool for
   `mattpocock-skills:grilling` and `mattpocock-skills:domain-modeling`. Every fact the map answers is
   not a question. Lead with what the map found that the operator may not expect — a layer they did
   not mention, a cost, a broken standard in the way.
3. **Hand off.** Keep the map at `.review-loop/<slug>/map.md` (add `/.review-loop/` to
   `.git/info/exclude` if missing) for `/to-spec` and `architect`.
