# Terminal Desk

A session dashboard for Claude Code. It puts a one-line stats bar above the prompt and adds a `/desk` pane with more detail.

Needs Claude Code v2.1.287 or later. It was built and tested on v2.1.289 in the terminal.

## Install

Download `terminal-desk-mod.zip` from https://www.graniteai.co/tools/terminal-desk and unzip it into your Claude Code skills folder, so this file exists:

```
~/.claude/skills/terminal-desk/.claude-plugin/plugin.json
```

On Windows that folder is `C:\Users\<you>\.claude\skills\terminal-desk`. Claude Code loads a plugin it finds there in every session.

Start a new session. The bar appears above the prompt, and `/desk` opens the pane.

To try it for one session without installing, run `claude --plugin-dir` followed by the path to the unzipped folder.

To remove it, delete the folder.

## The bar

The bar shows, left to right: whether Claude is working, tokens used, cost, context used on a 0 to 100 scale with a marker at the current position, tool calls per minute, running subagents, turns, and errors. On the right it shows whether the prompt cache is hot or cold and what the next message would cost to send in each state.

On a narrow terminal the bar drops the less important figures instead of wrapping.

When you switch to a subagent's transcript, the bar switches to that subagent's status, run time, tool calls, tokens and model.

## The pane

`/desk` opens a pane with six panels.

**What Claude is assuming** lists the last five judgment calls Claude reported, newest first, each with its reason and what it affects. Press the number next to an entry, or click its Reject button, to put a correction in your prompt box. Nothing is sent until you finish the sentence and press Enter. If Claude later overturns an assumption itself, the old entry is struck through. `z` clears the list.

**Left undone** lists work Claude put off. It is filled three ways: sentences in Claude's answer that defer something ("for now", "I did not run", "placeholder"), lines it writes into a file that mark unfinished work (`TODO`, a skipped test, "not implemented"), and a second, small model that reads your request against Claude's final report after any turn with five or more tool calls. Press the letter next to an entry to draft "You left this undone: ... Do it now." in your prompt box. `x` clears the list.

**Where your context went** is a stacked bar of what fills the context window (messages, system tools, skills, memory files and so on), with a legend and the free space left.

**Prompt cache** shows whether the cache is hot, how long until it goes cold, and the estimated cost of your next message in each state.

**Subagents** lists every subagent in the session with its status, type, model, run time and tool calls.

**Cost and tokens** shows session cost, tokens read and written, and the share served from cache.

## Commands

| Command | What it does |
| :- | :- |
| `/desk` | Open the pane |
| `/desk hide` | Hide the bar |
| `/desk show` | Show the bar again |
| `/desk check off` | Stop sending finished turns to the second model |
| `/desk check on` | Turn that check back on (the default) |
| `/desk cache 5m` | Estimate cache figures for a 5-minute cache |
| `/desk cache 1h` | Estimate cache figures for a 1-hour cache (the default) |

## What it adds to your sessions

The bar and the pane are drawn locally from numbers Claude Code already keeps. Drawing them makes no model calls and no network calls.

The assumptions panel is the one part that costs tokens. It adds a short instruction to the system prompt (roughly 200 tokens) and registers one tool, `note_assumption`, that Claude calls when it makes a judgment call you did not state. Each logged assumption is a small tool call, and when Claude logs one as a separate step, that is one extra request at the cached rate. On a large conversation that can be several cents each.

The Left undone panel's scanning is local and free. Its second-model check is one small request to Claude Haiku 4.5 after each turn that made five or more tool calls, sent with your request and the last part of Claude's answer. `/desk check off` stops it.

## What to know about the numbers

- The session cost comes from Claude Code and is an estimate at API list prices. The cache resend estimates use a price table inside the mod, which goes stale when prices change. Your plan may bill differently.
- Claude Code does not tell a mod how long the prompt cache lasts, so the mod assumes one hour unless you run `/desk cache 5m`.
- Tokens and turns count from when the mod loaded, which is the start of the session unless you installed it partway through.
- The one-hour cache applies to a Claude subscription within its included usage. On an API key or a cloud provider the default is five minutes, so run `/desk cache 5m` there.
- On a Team or Enterprise plan, or a machine with managed settings, Claude Code stops a mod you install yourself from changing the system prompt, so the assumptions panel may stay empty.
- Left undone is a prompt to look, not a verdict. The phrase scan flags innocent sentences sometimes, and the second model reads Claude's report and not its tool calls, so it finds what the report admits to.
- Context and cache figures describe the main conversation. Subagents get their own status but not their own context breakdown.

## Before you install

Mods are not sandboxed. This one reads session usage, tool call names and subagent activity, adds text to the system prompt, and registers a tool. It reads the text Claude writes into files to look for unfinished-work markers, and it sends your request and Claude's final answer to a second Claude model for the check described above. It does not write files or contact any other service. The whole mod is one file, [`hooks/register.tsx`](./hooks/register.tsx), so you can check that for yourself.

## License

MIT
