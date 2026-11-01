# Preflight — check the run's environment before it starts

One copy for `ship-tickets` (before wave 1) and `work` (before the branch is made). A missing item
found here costs one line; found mid-run it costs a wave or a review round. Run the checks as one
agent (`haiku`, `low`) or yourself in `work`; each writes one line to `$RUN/preflight.md`:
`<check> | ok | <evidence>` or `<check> | FAIL | <what to fix>`.

| Check | How | FAIL → |
|---|---|---|
| Supabase test branch | the run touches a database → a test branch exists (the repo's migrations doc says how to list and create one); verifiers and builders use it, never the live project | create it, or the repo's recipe says none is needed → `n/a: <why>` |
| Connector sign-in | each connector the run needs (Supabase, GitHub, Sheets …) answers one cheap read | ask the operator to sign in (the one stop that is theirs) |
| Test PC reachable | the repo's remote-test runner answers a no-op (e.g. `scripts/suite.sh` with no test files, or `ssh <host> true`); none in the repo → `n/a` | `BLOCKED`; never run the suites on this box as a fallback |
| Codex credits | `echo ok \| codex exec -` with a one-word prompt (about 1 token) exits 0 and replies | that axis starts on `agy` (`review-loop` §2.2); say so in the run notes |
| agy approval | `agy --output-format text --dangerously-skip-permissions -p "say ok"` replies without a prompt for approval; the launch command is on the allow list | add the allow rule, or that axis falls back per `review-loop` §Setup |

## Ticket words against the glossary

Before wave 1 (`implement-gate`) compare the tickets with the repo's glossary (`GLOSSARY.md`, or the
file `CLAUDE.md` / `AGENTS.md` names): each term the glossary lists as **avoided** that a ticket uses
is a finding. A ticket that uses an avoided term for a concept that has an owner word → rewrite the
ticket line to the owner word in `$RUN/issue-<n>.md` and note it in `gate.md`; a builder given the
wrong word writes the wrong name into code. No glossary → `n/a`.

## Result

Any `FAIL` the run cannot fix itself → stop before the first agent and say which. All `ok` /
`n/a` → carry on. The checks run once per run; `review-loop` repeats the Codex check each round.
