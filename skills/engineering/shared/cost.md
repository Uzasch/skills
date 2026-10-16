# Cost and speed — state it, then measure it

Database egress, BigQuery bytes and page time are paid in money or in the operator's patience. A
change states what it will cost, and a cost fix proves its number moved.

## The cost line (every design, spec and feature lane)

One line per metered service the change calls:

```
<service> · <what> · <calls per hour or day at today's volume> · <rows/bytes per call> · <timer or on demand>
```

Example: `Supabase · comp_chats by id · ~40/h while a turn runs, 0 idle · 1 row, 4 cols · socket-driven`.

A design whose line it cannot fill writes `unknown — measure in prototype`. Two designs whose lines
differ by more than 2× on the same service → the prototype check runs and measures it.

## Measuring

Use the repo's own recipe first (`docs/agents/baselines.md`, a cost section in `CLAUDE.md`). Else:

- **Supabase requests:** the API gateway logs — `get_logs` / `query_logs` from the Supabase MCP, or
  the dashboard's API report — grouped by path (table) per hour.
- **BigQuery bytes:** `INFORMATION_SCHEMA.JOBS_BY_PROJECT`, `SUM(total_bytes_billed)` grouped by
  `query` hash or job label, over the same window before and after. Partition-filter it by
  `creation_time` — the measuring query must not be the expensive one.
- **Page time:** the signed-in walk (`verify` recipe), timed from navigation to the list rendered,
  three runs, take the middle.
- **Paid APIs (TTS, Gemini, YouTube quota):** count calls in the worker logs or the job table for the
  window.

Same window length before and after, same time of day where traffic varies.

## Before reporting any number

Run `benchmark-checklist.md` and `explain-the-number.md` (pstack, copied as is). Report: before,
after, window, source, and the one-line reason the number moved.
