# Risky calls without the operator

Used by `work` and by `ship-tickets --decide`. The operator runs these unattended and will not
answer in time, so a risky call is never put to him. Instead it gets a second model's check and,
when it removes anything, a backup first.

## What counts as risky

- Deleting or overwriting data: database rows, columns, tables, files on shared storage, sheet tabs,
  queue entries.
- Any write to live data or a live service.
- A credential or security choice: where a token lives, who can read it, a permission or role.
- Money, or publishing to a public channel.
- An item the issue, a comment or an ADR marks as the operator's call.

## The check — two models must agree

1. The deciding agent writes the call: the facts, the options, its choice, why, and how to undo it.
2. A **fresh** agent from a different model checks it, given only that write-up and the files it
   names, never the decider's conversation: Opus when the decider was Sonnet; when the decider was
   Opus, agy (the "second opinion" row and launch in `models.md`) — never Codex, whose quota is
   for code review. It answers `agree` or `disagree: <why>`.
3. Both agree → do it. Disagree → take the safer option (keep the data, keep the old access, do
   not publish) and log both views. Never a third vote to get a yes.
4. One row in `$RUN/decisions.tsv`: call, choice, decider, checker, verdict, backup path, undo.

## Backup before anything is removed

Before a delete or an overwrite, copy what goes away to `~/work-backups/<slug>/<UTC time>/`:
database rows as `\copy (select …) to '<file>.csv' csv header` (plus the table's DDL for a dropped
column or table), files copied with their paths, a sheet tab exported. Check the copy (row count,
file size) **before** the delete. Write the backup path and the restore command into
`decisions.tsv` and the PR body.

## Never, even when both agree

Merge a PR, deploy, restart a live service, force-push a shared branch. The run ends at the PR;
those steps are the operator's, later, and need no answer from him during the run.
