# Reading the repo's standards

Used by builder, fixer and reviewer briefs, `review-loop` and `work`. Reading the whole standards
file in every agent is most of its prompt cost; reading the part for the work in hand is enough.

- The repo has a **standards index** (`CODING_STANDARDS.md` or the file `CLAUDE.md` / `AGENTS.md`
  names) that says which file holds which rules → read the index, then **only the files it names for
  your area** (the area of the files in your glob or diff). Always read the core file it names.
- The repo has **no index** (one standards file) → read the whole file.
- No standards at all → `skip: repo has no coding standards`.
- A change that spans areas reads each area's file once. A rule you cannot find in the files you
  read is not a finding by itself: open the index entry for it before you report.
- Reports and findings cite the rule by file and heading, so the next reader opens the same part.
