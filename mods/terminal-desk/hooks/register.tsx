import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, Assumption, Slice, Stats, Todo, Undone } from '../types'

const PANE = 'desk'
const AMBER = '#ffb000'
const GREEN = '#00d67a'
const RED = '#ff4d4d'
const CYAN = '#4dd2ff'
const GREY = '#555555'
const SLICE_COLORS = ['#4dd2ff', '#ffb000', '#c77dff', '#00d67a', '#ff7eb6', '#b59f00', '#ff9f1c', '#3a86ff']
const NOTE = 'mcp__terminal-desk__note_assumption'
const SHOWN_NOTES = 5

// What the model is told, as a section of the system prompt.
const GUIDE = [
  '# Surfacing your assumptions',
  'The user watches a live panel of the assumptions you make about what they want.',
  `Whenever you make a judgment call the user did not state, and it changes what you do next, call the ${NOTE} tool once, before you act on it. If that tool is not loaded yet, load it by its exact name first.`,
  'Log: the scope you settled on, which files or systems you took to be in or out of play, what you chose to keep or delete, a naming or structure choice in a refactor, which of two readings of the request you took, what you took "done" to mean.',
  'Do not log: facts you verified, routine steps, or anything the user said outright.',
  'One plain sentence per assumption. When a later finding overturns an earlier one, call the tool again with `replaces` set to that assumption\'s id.',
  'A small task may have none; a large refactor has many.',
].join('\n')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MAX_AGENTS = 12

// Anthropic API list prices in dollars per million input tokens, and what a
// cache read costs as a share of that (cached 2026-09-25). First match wins.
const PRICES: { match: string; input: number; read: number }[] = [
  { match: 'fable-5-1', input: 10, read: 0.025 },
  { match: 'mythos-5-1', input: 10, read: 0.025 },
  { match: 'fable', input: 10, read: 0.1 },
  { match: 'mythos', input: 10, read: 0.1 },
  { match: 'opus-5-5', input: 4, read: 0.05 },
  { match: 'opus', input: 5, read: 0.1 },
  { match: 'sonnet-5', input: 2, read: 0.1 },
  { match: 'sonnet', input: 3, read: 0.1 },
  { match: 'haiku', input: 1, read: 0.1 },
]

const EMPTY: Stats = {
  openedAt: 0,
  now: 0,
  turns: 0,
  tools: 0,
  fails: 0,
  freshTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outTokens: 0,
  costUsd: null,
  ctxPercent: null,
  ctxTokens: null,
  ctxWindow: null,
  slices: [],
  stamps: [],
  assumptions: [],
  nextNote: 1,
  agents: [],
  lastMainAt: 0,
  model: null,
  ttlMs: HOUR,
  needsMeasure: false,
  undone: [],
  nextUndone: 1,
  lastPrompt: '',
  turnTools: 0,
  isChecking: true,
  tickError: '',
  limits: [],
  todos: [],
  goal: '',
}

const SHOWN_UNDONE = 5
const LIMIT_NAMES: Record<string, string> = { five_hour: 'Session (5h)', seven_day: 'Weekly' }
const resetsIn = (iso: string | undefined, now: number): string => {
  if (iso === undefined) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / MINUTE))
  return mins >= 1440 ? `, resets ${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h` : `, resets ${Math.floor(mins / 60)}h ${mins % 60}m`
}
const UNDONE_KEYS = ['a', 'b', 'c', 'd', 'e']
// A turn with fewer tool calls than this did too little work to be checked.
const CHECK_MIN_TOOLS = 5
const CHECKER = 'claude-haiku-4-5-20251001'
const CHECK_SYSTEM = [
  'You compare what a user asked a coding assistant to do with the assistant\'s final report.',
  'List each thing the user clearly asked for that the report shows was not done, was put off, or was only partly done.',
  'One per line, at most three, each under 20 words, each starting with a verb. No numbering, no commentary.',
  'If nothing was left undone, reply with the single word NONE.',
].join(' ')
// How an answer words work it is putting off.
const SAID = /\b(for now|follow[- ]up|out of scope|not yet|I (?:didn't|did not|haven't|have not|skipped|left)\b|(?:do|handle|add|fix|revisit|address|tackle) (?:that|this|it|them|those) later|in a later (?:pass|step|turn|change|PR)|still needs?|remains? to be|placeholder|stubbed|untested|not (?:verified|tested|implemented|wired up))/i
// What put-off work looks like once it is written into a file.
const WROTE = /\b(?:TODO|FIXME|XXX)\b|not implemented|NotImplemented|\bplaceholder\b|\.skip\(|\bx(?:it|describe)\(|@pytest\.mark\.skip/
const WRITERS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

// The sentences of an answer that put work off, code blocks left out.
const deferrals = (answer: string): string[] =>
  answer
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(part => part.replace(/^[\s>*#-]+/, '').replace(/\*\*/g, '').trim())
    // Words Claude is quoting or showing as code are not Claude putting work off.
    .filter(part => part.length > 12 && SAID.test(part.replace(/"[^"]*"|`[^`]*`/g, ' ')))
    .map(part => part.slice(0, 200))
    .slice(0, 3)

const recordUndone = async ($: EngineInterface, found: string[], source: Undone['source']): Promise<void> => {
  if (found.length === 0) {
    return
  }

  const at = await $.clock.now()
  let added = 0

  await update($, stats, raw => {
    const s = whole(raw)
    const fresh = [...new Set(found)].filter(text => !s.undone.some(one => one.text === text))
    added = fresh.length

    return {
      ...s,
      nextUndone: s.nextUndone + fresh.length,
      undone: [
        ...s.undone,
        ...fresh.map((text, i): Undone => ({ id: s.nextUndone + i, text, source, at, status: 'open' })),
      ].slice(-40),
    }
  })

  if (added > 0) {
    $.ui.toast(`Left undone: ${(found[0] ?? '').slice(0, 80)}`)
  }
}

// A second, small model reads the request against the final report. It sees
// the report and not the tool calls, so it finds what the report admits to.
const check = async ($: EngineInterface, asked: string, answer: string): Promise<void> => {
  const reply = await $.model.complete({
    model: CHECKER,
    system: CHECK_SYSTEM,
    prompt: `REQUEST:\n${asked}\n\nFINAL REPORT:\n${answer.slice(-6000)}`,
    maxTokens: 300,
    timeoutMs: 30_000,
  })

  if (!reply.isAnswered) {
    $.ui.log('terminal-desk checker: the model did not answer', { to: 'debug' })

    return
  }

  const found = reply.text
    .split('\n')
    .map(row => row.replace(/^[\s\d.*-]+/, '').trim().slice(0, 200))
    .filter(row => row !== '' && !/^none\.?$/i.test(row))
    .slice(0, 3)

  await recordUndone($, found, 'checker')
}

const BLANK_ROW: AgentRow = {
  id: '',
  label: '',
  type: 'subagent',
  model: null,
  startedAt: 0,
  endedAt: null,
  lastSeenAt: 0,
  isSpawned: false,
  tools: 0,
  tokensRead: 0,
  tokensOut: 0,
  hasFailed: false,
}

const stats = atom({ plugin: 'terminal-desk', key: 'stats' } as const, EMPTY)
const isHidden = atom({ plugin: 'terminal-desk', key: 'isHidden' } as const, false)

// The session's stored value may predate a field added since: fill the gaps.
const whole = (s: Stats): Stats => ({
  ...EMPTY,
  ...s,
  agents: (s.agents ?? []).map(row => ({ ...BLANK_ROW, ...row })),
})

const compact = (n: number): string => {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`
  }

  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`
}

const elapsed = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const mm = `${Math.floor(seconds / 60)}`.padStart(2, '0')

  return `${mm}:${`${seconds % 60}`.padStart(2, '0')}`
}

const money = (usd: number | null): string => {
  if (usd === null) {
    return '--'
  }

  return usd > 0 && usd < 0.005 ? '<$0.01' : `$${usd.toFixed(2)}`
}

// Minutes and seconds left, so the countdown is seen to move.
const minutes = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000)

  return `${Math.floor(seconds / 60)}:${`${seconds % 60}`.padStart(2, '0')}`
}

// Tool calls in the minute before `now`: counted when drawn, so the rate
// falls back to 0 once the session goes quiet.
const perMinute = (s: Stats): number => s.stamps.filter(t => s.now - t <= MINUTE).length

const tokensRead = (s: Stats): number => s.freshTokens + s.cacheReadTokens + s.cacheWriteTokens

// A row nobody spawned in view of this mod (a fork of the engine's, an agent
// older than this load) may never report an end, so silence ends it.
const isRunning = (row: AgentRow, now: number): boolean =>
  row.endedAt === null && (row.isSpawned || now - row.lastSeenAt < 2 * MINUTE)

// The prompt cache: hot while the main loop's last request began inside the
// cache's lifetime, when resending the conversation is a cheap cache read;
// cold after it, when the whole window is written to the cache again.
const cache = (s: Stats): { isWarm: boolean; leftMs: number; warmUsd: number | null; coldUsd: number | null } => {
  const leftMs = s.lastMainAt === 0 ? 0 : Math.max(0, s.lastMainAt + s.ttlMs - s.now)
  const price = PRICES.find(one => (s.model ?? '').includes(one.match))
  const millions = (s.ctxTokens ?? 0) / 1_000_000
  const write = s.ttlMs > 5 * MINUTE ? 2 : 1.25

  return {
    isWarm: leftMs > 0,
    leftMs,
    warmUsd: price === undefined || s.ctxTokens === null ? null : millions * price.input * price.read,
    coldUsd: price === undefined || s.ctxTokens === null ? null : millions * price.input * write,
  }
}

// Cells per slice by largest remainder, so the bar is exactly `width` wide.
const share = (slices: Slice[], width: number): number[] => {
  const total = slices.reduce((sum, one) => sum + one.tokens, 0)

  if (total === 0) {
    return slices.map(() => 0)
  }

  const exact = slices.map(one => (one.tokens / total) * width)
  const cells = exact.map(Math.floor)
  let spare = width - cells.reduce((sum, n) => sum + n, 0)
  const order = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest)

  for (const { i } of order) {
    if (spare <= 0) {
      break
    }

    cells[i] = (cells[i] ?? 0) + 1
    spare -= 1
  }

  return cells
}

const withAgent = (agents: AgentRow[], id: string, at: number, change: (row: AgentRow) => AgentRow): AgentRow[] => {
  const known = agents.find(row => row.id === id) ?? {
    ...BLANK_ROW,
    id,
    label: `agent ${id.slice(0, 6)}`,
    startedAt: at,
  }
  const rows = [...agents.filter(row => row.id !== id), { ...change(known), lastSeenAt: at }]
  // Over the cap, the oldest finished rows go; a running one never does.
  const surplus = rows.filter(row => row.endedAt !== null).slice(0, Math.max(0, rows.length - MAX_AGENTS))

  return rows.filter(row => !surplus.includes(row))
}

const measure = async ($: EngineInterface): Promise<void> => {
  const { context, cost, rateLimits } = await $.session.usage({ breakdown: 'summary' })
  // The session's goal: the first thing the person asked.
  let goal = whole(await read($, stats)).goal
  if (goal === '') {
    const first = (await $.session.messages()).find(m => m.role === 'user' && `${m.text ?? ''}`.trim() !== '')
    goal = first === undefined ? '' : `${first.text}`.replace(/\s+/g, ' ').trim().slice(0, 300)
  }
  const breakdown = context.breakdown
  const slices: Slice[] = (breakdown?.categories ?? [])
    .filter(row => row.tokens > 0)
    .map(row => ({ name: row.name, tokens: row.tokens, kind: row.kind }))

  // The breakdown measures against the window compaction works to, which is
  // what its rows add up to; a window just compacted has no reading of its
  // own until its next response, so nothing older is carried over it.
  await update($, stats, raw => ({
    ...whole(raw),
    costUsd: cost?.usd ?? raw.costUsd,
    ctxPercent: breakdown?.percentage ?? context.percent ?? null,
    ctxTokens: context.tokens ?? breakdown?.totalTokens ?? null,
    ctxWindow: breakdown?.rawMaxTokens ?? context.window,
    slices,
    limits: rateLimits.length > 0 ? rateLimits : raw.limits ?? [],
    goal,
    needsMeasure: false,
  }))
}

// The model's own report of an assumption: stored, shown at once, and
// answered with the id a later note names to replace it.
const recordAssumption = async ($: EngineInterface, input: Record<string, unknown>, agentId: string | undefined): Promise<string | null> => {
  const say = (key: string): string => `${input[key] ?? ''}`.replace(/\s+/g, ' ').trim().slice(0, 240)
  const text = say('assumption')

  if (text === '') {
    return null
  }

  const at = await $.clock.now()
  const replaces = Number(say('replaces').replace(/\D/g, '')) || null
  let id = 0

  await update($, stats, raw => {
    const s = whole(raw)
    id = s.nextNote
    const added: Assumption = {
      id,
      text,
      basis: say('basis'),
      affects: say('affects'),
      at,
      agent: agentId ?? null,
      status: 'open',
      replacedBy: null,
    }

    return {
      ...s,
      openedAt: s.openedAt || at,
      now: at,
      nextNote: id + 1,
      assumptions: [
        ...s.assumptions.map(one =>
          one.id === replaces && one.status === 'open' ? { ...one, status: 'replaced' as const, replacedBy: id } : one,
        ),
        added,
      ].slice(-30),
    }
  })

  $.ui.toast(`Assumed: ${text.slice(0, 90)}`)

  return `Noted as A${id}. The user can see it.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'desk',
      description: 'Open the session dashboard pane, or /desk hide and /desk show for the stats bar',
    })

    // Moves `now` on while something is still counting: a running subagent's
    // clock, or tool calls that have yet to age out of the last minute.
    const tick = async (): Promise<void> => {
      const s = whole(await read($, stats))
      const at = await $.clock.now()

      // A compaction left the context reading to be taken again.
      if (s.needsMeasure) {
        await measure($)
      }

      const isCounting = s.agents.some(row => isRunning(row, s.now)) || perMinute(s) > 0
      // The cache countdown shows seconds, so it moves on every tick until
      // one tick past cold. A cold, quiet session writes nothing.
      const isCooling = cache(s).isWarm

      if (isCounting || isCooling || s.tickError !== '') {
        await update($, stats, one => ({ ...whole(one), tickError: '', now: at }))
      }
    }
    const failed = (where: string) => async (err: unknown): Promise<void> => {
      $.ui.log(`terminal-desk ${where}: ${String(err)}`, { to: 'debug' })
      await update($, stats, one => ({ ...whole(one), tickError: `${where}: ${String(err)}`.slice(0, 120) }))
    }

    // Started before anything that could fail, so the clock always runs.
    $.clock.every(1000, () => {
      tick().catch(failed('timer'))
    })

    await $.tool.register({
      name: 'note_assumption',
      description:
        'Record one assumption you are making about what the user wants, before acting on it. The user sees it at once and can reject it. Use it for judgment calls the user did not state; not for verified facts or routine steps.',
      inputSchema: {
        type: 'object',
        properties: {
          assumption: { type: 'string', description: 'The assumption, as one plain sentence.' },
          basis: { type: 'string', description: 'What led you to it, in a few words.' },
          affects: { type: 'string', description: 'What it changes: the files, behaviour or scope that would differ if it is wrong.' },
          replaces: { type: 'string', description: 'The id of an earlier assumption this one overturns, such as A3. Leave out otherwise.' },
        },
        required: ['assumption', 'basis', 'affects'],
        additionalProperties: false,
      },
    })

    return next(e)
  })

  on('command.run', { command: 'desk' }, async ($, e) => {
    const word = `${e.args ?? ''}`.trim().toLowerCase()

    if (word === 'close' || word === 'hide') {
      await $.ui.close({ id: PANE })

      return { text: 'Session dashboard closed. /desk opens it again.' }
    }

    if (word === 'cache 5m' || word === 'cache 1h') {
      await update($, stats, s => ({ ...whole(s), ttlMs: word === 'cache 5m' ? 5 * MINUTE : HOUR }))

      return { text: `Cache lifetime set to ${word.slice(6)}.` }
    }

    if (word === 'check on' || word === 'check off') {
      await update($, stats, s => ({ ...whole(s), isChecking: word === 'check on' }))

      return { text: `Second-model check of finished turns is ${word.slice(6)}.` }
    }

    await $.ui.open({ id: PANE, title: 'This session' })
    await measure($)

    return { text: 'Session dashboard opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)

    if (spawned.agentId !== undefined) {
      const id = spawned.agentId
      const at = await $.clock.now()
      await update($, stats, raw => ({
        ...whole(raw),
        now: at,
        agents: withAgent(whole(raw).agents, id, at, row => ({
          ...row,
          label: e.description,
          type: e.subagentType,
          model: spawned.model,
          isSpawned: true,
        })),
      }))
    }

    return spawned
  })

  // What the person asked for, kept for the check at the end of the turn.
  on('prompt.submit', async ($, e, next) => {
    const kind: string = e.origin.kind

    if (kind === 'composer' || kind === 'bridge' || kind === 'sdk') {
      await update($, stats, raw => ({ ...whole(raw), lastPrompt: e.text.slice(0, 4000) }))
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [...composed.sections, { id: 'terminal-desk:assumptions', text: GUIDE, scope: 'session' as const }],
    }
  })

  // Each request of a loop. The cache's lifetime runs from the start of the
  // main loop's last request; a subagent's request means it is at work, even
  // one that had finished an earlier run.
  on('turn.step', async function* ($, e, next) {
    const at = await $.clock.now()
    const agentId = e.agentId

    await update($, stats, raw => {
      const s = whole(raw)

      return agentId === undefined
        ? { ...s, now: at, lastMainAt: at }
        : { ...s, now: at, agents: withAgent(s.agents, agentId, at, row => ({ ...row, endedAt: null })) }
    })

    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    // The mod's own tool is answered here and is not counted as a tool call.
    const called: string = e.tool
    const calledBy = e.agentId

    if (called === NOTE) {
      const noted = await recordAssumption($, e as unknown as Record<string, unknown>, calledBy)

      return (noted === null
        ? { deny: 'note_assumption needs an `assumption`: one plain sentence.' }
        : { result: noted }) as never
    }

    const ran = await next(e)

    const at = await $.clock.now()
    const agentId = e.agentId
    const hasFailed = ran.deny !== undefined || ran.isError === true

    await update($, stats, raw => {
      const s = whole(raw)
      const stamps = [...s.stamps, at].filter(t => at - t <= MINUTE)

      return {
        ...s,
        openedAt: s.openedAt || at,
        now: at,
        tools: s.tools + 1,
        fails: s.fails + (hasFailed ? 1 : 0),
        stamps,
        turnTools: s.turnTools + (agentId === undefined ? 1 : 0),
        agents: agentId === undefined
          ? s.agents
          : withAgent(s.agents, agentId, at, row => ({ ...row, endedAt: null, tools: row.tools + 1 })),
      }
    })

    // The session's task list, as the model keeps it.
    if (!hasFailed && called === 'TodoWrite') {
      const todos = ((ran.result as { newTodos?: { content: string; status: Todo['status'] }[] } | undefined)?.newTodos ?? [])
        .map(one => ({ subject: one.content, status: one.status }))
      await update($, stats, raw => ({ ...whole(raw), todos }))
    } else if (!hasFailed && (called === 'TaskCreate' || called === 'TaskUpdate')) {
      const list = await $.tool.call({ tool: 'TaskList' } as never).catch(() => null) as { result?: { tasks?: Todo[] } } | null
      const tasks = list?.result?.tasks
      if (tasks !== undefined) {
        await update($, stats, raw => ({ ...whole(raw), todos: tasks.map(one => ({ subject: one.subject, status: one.status })) }))
      }
    }

    // Put-off work written into a file: the line that says so, and where.
    if (!hasFailed && WRITERS.includes(called)) {
      const input = e as unknown as Record<string, unknown>
      const wrote = `${input.new_string ?? input.content ?? input.new_source ?? ''}`
      const row = wrote.split('\n').find(one => WROTE.test(one))

      if (row !== undefined) {
        const file = `${input.file_path ?? input.notebook_path ?? 'a file'}`.split(/[\\/]/).pop() ?? 'a file'
        await recordUndone($, [`Wrote "${row.trim().slice(0, 90)}" into ${file}`], 'code')
      }
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const at = await $.clock.now()
    const agentId = e.agentId
    const out = e.usage?.output_tokens ?? 0
    // `input_tokens` is the uncached part alone; a cached prompt reports
    // nearly all of its input under the two cache fields.
    const fresh = e.usage?.input_tokens ?? 0
    const cacheRead = e.usage?.cache_read_input_tokens ?? 0
    const cacheWrite = e.usage?.cache_creation_input_tokens ?? 0

    await update($, stats, raw => {
      const s = whole(raw)

      return {
        ...s,
        openedAt: s.openedAt || at,
        now: at,
        // Only where no request of the main loop was seen to start.
        lastMainAt: agentId === undefined && s.lastMainAt === 0 ? at : s.lastMainAt,
        model: agentId === undefined ? (e.usage?.model ?? s.model) : s.model,
        turns: s.turns + (agentId === undefined ? 1 : 0),
        freshTokens: s.freshTokens + fresh,
        cacheReadTokens: s.cacheReadTokens + cacheRead,
        cacheWriteTokens: s.cacheWriteTokens + cacheWrite,
        outTokens: s.outTokens + out,
        agents: agentId === undefined
          ? s.agents
          : withAgent(s.agents, agentId, at, row => ({
              ...row,
              endedAt: at,
              model: e.usage?.model ?? row.model,
              tokensRead: row.tokensRead + fresh + cacheRead + cacheWrite,
              tokensOut: row.tokensOut + out,
              hasFailed: e.reason === 'error' || e.reason === 'aborted',
            })),
      }
    })

    if (agentId === undefined) {
      await measure($)

      const turn = whole(await read($, stats))
      await update($, stats, raw => ({ ...whole(raw), turnTools: 0 }))

      if (e.reason === 'answer') {
        await recordUndone($, deferrals(e.answer), 'said')

        if (turn.isChecking && turn.turnTools >= CHECK_MIN_TOOLS && turn.lastPrompt !== '') {
          // Not awaited: the turn ends now and the finding arrives when it does.
          check($, turn.lastPrompt, e.answer).catch((err: unknown) =>
            $.ui.log(`terminal-desk checker: ${String(err)}`, { to: 'debug' }),
          )
        }
      }
    }

    return next(e)
  })

  // A compacted main conversation is a different window: measure it again
  // rather than leave the figures of the one it replaced.
  on('session.compact', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId !== undefined || e.trigger === 'precompute' || done.messages === undefined) {
      return done
    }

    // The engine swaps the conversation in after this hook returns, so a
    // reading taken here is still the old one: show the compaction's own
    // count now and measure again on the next tick.
    const { tokensBefore, tokensAfter } = done

    await update($, stats, raw => {
      const s = whole(raw)
      const sized = tokensAfter !== undefined && s.ctxWindow !== null && s.ctxWindow > 0

      return {
        ...s,
        needsMeasure: true,
        ctxTokens: tokensAfter ?? s.ctxTokens,
        ctxPercent: sized ? (tokensAfter / (s.ctxWindow ?? 1)) * 100 : s.ctxPercent,
        slices: sized ? [] : s.slices,
      }
    })

    if (tokensBefore !== undefined && tokensAfter !== undefined) {
      $.ui.toast(`Compacted: ${compact(tokensBefore)} to ${compact(tokensAfter)} tokens`)
    }

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = whole(await read($, stats))
    const kept = cache(s)
    const inner = Math.max(16, e.props.bodyColumns - 4)
    const viewedId = e.props.view?.agentId

    const line = (label: string, value: string, color: string) => (
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={AMBER} dimColor>{label}</Text>
        <Text color={color} bold>{value}</Text>
      </Box>
    )
    const title = (text: string, color: string = AMBER) => (
      <Text backgroundColor={color} color="#000000" bold>{` ${text} `}</Text>
    )
    // "Reject" puts the correction in the prompt box for the person to finish
    // and send; nothing reaches the model until they do.
    const flag = async (id: number, text: string): Promise<void> => {
      await $.prompt.fill({ text: `Assumption A${id} is wrong ("${text}"). Instead: `, mode: 'append' })
      await update($, stats, raw => ({
        ...whole(raw),
        assumptions: whole(raw).assumptions.map(one => (one.id === id ? { ...one, status: 'flagged' as const } : one)),
      }))
    }
    // "Do it now" drafts the instruction; the person sends it.
    const push = async (id: number, text: string): Promise<void> => {
      await $.prompt.fill({ text: `You left this undone: "${text}". Do it now.`, mode: 'append' })
      await update($, stats, raw => ({
        ...whole(raw),
        undone: whole(raw).undone.map(one => (one.id === id ? { ...one, status: 'sent' as const } : one)),
      }))
    }
    const clear = async (): Promise<void> => {
      await update($, stats, raw => ({
        ...whole(raw),
        undone: whole(raw).undone.map(one => (one.status === 'open' ? { ...one, status: 'cleared' as const } : one)),
      }))
    }
    const clearNotes = async (): Promise<void> => {
      await update($, stats, raw => ({
        ...whole(raw),
        assumptions: whole(raw).assumptions.map(one => ({ ...one, status: 'cleared' as const })),
      }))
    }
    const todo = s.undone.filter(one => one.status === 'open').slice(-SHOWN_UNDONE).reverse()
    const sources = { said: 'Claude said', code: 'in a file', checker: 'second model' }
    const notes = (list: Assumption[]) => list.filter(note => note.status !== 'cleared').slice(-SHOWN_NOTES).reverse().map((note, i) => {
      const isOpen = note.status === 'open'
      const who = note.agent === null ? '' : ` · ${s.agents.find(row => row.id === note.agent)?.label ?? 'subagent'}`

      return (
        <Box key={`note-${note.id}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={isOpen ? CYAN : GREY} bold>{`A${note.id} · ${elapsed(note.at - s.openedAt)}${who}`.slice(0, Math.max(8, inner - 12))}</Text>
            {isOpen && <Button key={`wrong-${note.id}`} label={`${i + 1} Reject`} hotkey={`${i + 1}`} onPress={() => flag(note.id, note.text)} />}
            {!isOpen && <Text color={note.status === 'flagged' ? RED : GREY}>{note.status === 'flagged' ? 'you flagged it' : `replaced by A${note.replacedBy ?? '?'}`}</Text>}
          </Box>
          <Text color={isOpen ? undefined : GREY} strikethrough={note.status === 'replaced'} wrap="wrap">{note.text}</Text>
          {isOpen && note.basis !== '' && <Text dimColor wrap="wrap">{`because ${note.basis}`}</Text>}
          {isOpen && note.affects !== '' && <Text dimColor wrap="wrap">{`affects ${note.affects}`}</Text>}
        </Box>
      )
    })
    const agentRows = (limit: number) => [...s.agents].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit).map(row => {
      const runs = isRunning(row, s.now)
      const color = runs ? GREEN : row.hasFailed ? RED : CYAN
      const pointer = row.id === viewedId ? '▶ ' : ''

      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={color} bold>{`${pointer}${runs ? '●' : row.hasFailed ? '✗' : '✓'} ${row.label}`.slice(0, Math.max(8, inner - 7))}</Text>
            <Text color={color}>{elapsed((runs ? s.now : (row.endedAt ?? row.lastSeenAt)) - row.startedAt)}</Text>
          </Box>
          <Text dimColor>
            {`  ${runs ? 'running' : row.hasFailed ? 'stopped' : 'done'} · ${row.type} · ${row.model ?? 'model unknown'} · ${row.tools} tool calls`.slice(0, inner)}
          </Text>
        </Box>
      )
    })

    // A subagent's transcript is on screen: the pane is that agent's.
    if (viewedId !== undefined) {
      const row = s.agents.find(one => one.id === viewedId)
      const runs = row !== undefined && isRunning(row, s.now)
      const color = row === undefined ? AMBER : runs ? GREEN : row.hasFailed ? RED : CYAN
      const own = s.assumptions.filter(note => note.agent === viewedId)

      return (
        <Box flexDirection="column">
          <Box key="p-agent" flexDirection="column" borderStyle="single" borderColor={CYAN} paddingX={1}>
            {title('Subagent in view', CYAN)}
            <Text color={color} bold>{(row?.label ?? `agent ${viewedId.slice(0, 6)}`).slice(0, inner)}</Text>
            {row === undefined && <Text dimColor>No activity seen yet</Text>}
            {row !== undefined && line('Status', runs ? 'running' : row.hasFailed ? 'stopped' : 'done', color)}
            {row !== undefined && line('Time', elapsed((runs ? s.now : (row.endedAt ?? row.lastSeenAt)) - row.startedAt), color)}
            {row !== undefined && line('Type', row.type, CYAN)}
            {row !== undefined && line('Model', row.model ?? 'unknown', CYAN)}
            {row !== undefined && line('Tool calls', `${row.tools}`, CYAN)}
            {row !== undefined && line('Tokens read', compact(row.tokensRead), CYAN)}
            {row !== undefined && line('Tokens written', compact(row.tokensOut), GREEN)}
            <Text dimColor>Tokens update each time it finishes a run</Text>
          </Box>
          <Box key="p-assumptions" flexDirection="column" borderStyle="single" borderColor={CYAN} paddingX={1}>
            {title('What this subagent is assuming', CYAN)}
            {own.length === 0 && <Text dimColor>None reported yet</Text>}
            {notes(own)}
          </Box>
          <Box key="p-agents" flexDirection="column" borderStyle="single" borderColor={AMBER} paddingX={1}>
            {title('All subagents')}
            {agentRows(6)}
          </Box>
          <Text dimColor>Context and cache belong to the main session. Switch back to see them.</Text>
        </Box>
      )
    }

    const used = (s.ctxPercent ?? 0) / 100
    const ctxColor = used > 0.8 ? RED : GREEN
    const read_ = tokensRead(s)
    const cached = read_ === 0 ? 0 : Math.round((s.cacheReadTokens / read_) * 100)

    // What the window holds, biggest first, with the free space last; schemas
    // loaded on demand sit outside the window and are listed, not drawn.
    const held = s.slices.filter(one => one.kind === 'used').sort((a, b) => b.tokens - a.tokens)
    const spare = s.slices.filter(one => one.kind === 'free' || one.kind === 'buffer')
    const deferred = s.slices.filter(one => one.kind === 'deferred').reduce((sum, one) => sum + one.tokens, 0)
    const drawn = [...held, ...spare]
    const cells = share(drawn, inner)
    const windowTokens = drawn.reduce((sum, one) => sum + one.tokens, 0)
    const tint = (one: Slice): string =>
      one.kind === 'used' ? (SLICE_COLORS[held.indexOf(one) % SLICE_COLORS.length] ?? CYAN) : GREY
    const cell = (one: Slice): string => (one.kind === 'used' ? '█' : one.kind === 'buffer' ? '▒' : '░')
    // Seven colours' worth of rows, then everything smaller as one, and the
    // free space and compaction reserve always.
    const rest = held.slice(7).reduce((sum, one) => sum + one.tokens, 0)
    const legend = [...held.slice(0, 7), ...spare]

    return (
      <Box flexDirection="column">
        <Box key="p-limits" flexDirection="column" borderStyle="single" borderColor={AMBER} paddingX={1}>
          {title('Plan limits')}
          {s.limits.length === 0 && <Text dimColor>Read after the next reply (subscription only)</Text>}
          {s.limits.map(one => {
            const name = LIMIT_NAMES[one.kind] ?? one.kind
            const color = one.percentUsed >= 80 ? RED : one.percentUsed >= 60 ? AMBER : GREEN
            const filled = Math.max(0, Math.min(inner, Math.round((one.percentUsed / 100) * inner)))
            return (
              <Box flexDirection="column">
                {line(name, `${Math.round(one.percentUsed)}%${resetsIn(one.resetsAt, s.now)}`, color)}
                <Text color={color}>{'█'.repeat(filled)}<Text color={GREY}>{'░'.repeat(inner - filled)}</Text></Text>
              </Box>
            )
          })}
        </Box>
        <Box key="p-goal" flexDirection="column" borderStyle="single" borderColor={GREEN} paddingX={1}>
          {title('This session', GREEN)}
          <Text wrap="wrap">{s.goal === '' ? '—' : s.goal}</Text>
          {s.todos.length > 0 && line('Tasks done', `${s.todos.filter(one => one.status === 'completed').length} of ${s.todos.length}`, GREEN)}
          {s.todos.length === 0 && <Text dimColor>No task list yet</Text>}
          {s.todos.map(one => (
            <Text color={one.status === 'in_progress' ? AMBER : one.status === 'completed' ? GREY : undefined} strikethrough={one.status === 'completed'} wrap="wrap">
              {`${one.status === 'completed' ? '✔' : one.status === 'in_progress' ? '▶' : '○'} ${one.subject}`}
            </Text>
          ))}
        </Box>
        <Box key="p-assumptions" flexDirection="column" borderStyle="single" borderColor={CYAN} paddingX={1}>
          {title('What Claude is assuming', CYAN)}
          {s.assumptions.every(note => note.status === 'cleared') && <Text dimColor>None reported yet. They appear here as Claude makes them.</Text>}
          {notes(s.assumptions)}
          {s.assumptions.some(note => note.status !== 'cleared') && <Button key="notes-clear" label="z Clear all" hotkey="z" onPress={clearNotes} />}
        </Box>
        <Box key="p-undone" flexDirection="column" borderStyle="single" borderColor={RED} paddingX={1}>
          {title('Left undone', RED)}
          {todo.length === 0 && <Text dimColor>Nothing flagged. Work Claude puts off shows up here.</Text>}
          {todo.map((one, i) => (
            <Box key={`undone-${one.id}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={RED} bold>{`U${one.id} · ${elapsed(one.at - s.openedAt)} · ${sources[one.source]}`.slice(0, Math.max(8, inner - 14))}</Text>
                <Button key={`do-${one.id}`} label={`${UNDONE_KEYS[i] ?? ''} Do it now`} hotkey={UNDONE_KEYS[i] ?? 'a'} onPress={() => push(one.id, one.text)} />
              </Box>
              <Text wrap="wrap">{one.text}</Text>
            </Box>
          ))}
          {todo.length > 0 && <Button key="undone-clear" label="x Clear all" hotkey="x" onPress={clear} />}
        </Box>
        <Box key="p-context" flexDirection="column" borderStyle="single" borderColor={AMBER} paddingX={1}>
          {title('Where your context went')}
          {line('Used', s.ctxPercent === null ? '--' : `${Math.round(s.ctxPercent)}% of ${compact(s.ctxWindow ?? 0)}`, ctxColor)}
          {drawn.length === 0 && <Text dimColor>Measured after the next turn</Text>}
          {drawn.length > 0 && (
            <Box flexDirection="row">
              {drawn.map((one, i) => (
                <Text color={held.indexOf(one) >= 7 ? GREY : tint(one)}>{cell(one).repeat(cells[i] ?? 0)}</Text>
              ))}
            </Box>
          )}
          {legend.map(one => (
            <Box flexDirection="row" justifyContent="space-between">
              <Text color={tint(one)}>{`${cell(one) === '█' ? '■' : cell(one)} ${one.name}`.slice(0, Math.max(8, inner - 14))}</Text>
              <Text color={tint(one)} bold>
                {`${compact(one.tokens)} ${`${Math.round((one.tokens / Math.max(1, windowTokens)) * 100)}%`.padStart(4)}`}
              </Text>
            </Box>
          ))}
          {rest > 0 && <Text dimColor>{`■ ${held.length - 7} smaller items, ${compact(rest)}`}</Text>}
          {deferred > 0 && <Text dimColor>{`+ ${compact(deferred)} of tools loaded only when needed`}</Text>}
        </Box>
        <Box key="p-cache" flexDirection="column" borderStyle="single" borderColor={AMBER} paddingX={1}>
          {title('Prompt cache')}
          {s.lastMainAt === 0 && <Text dimColor>Measured after the next turn</Text>}
          {s.lastMainAt !== 0 && line('Right now', kept.isWarm ? `hot, ${minutes(kept.leftMs)} left` : 'cold', kept.isWarm ? RED : CYAN)}
          {s.lastMainAt !== 0 && line('Next message while hot', money(kept.warmUsd), GREEN)}
          {s.lastMainAt !== 0 && line('Next message once cold', money(kept.coldUsd), kept.isWarm ? AMBER : RED)}
          <Text dimColor>
            {`Estimate: resending the conversation at API list price, ${s.ttlMs > 5 * MINUTE ? '1h' : '5m'} cache`}
          </Text>
        </Box>
        <Box key="p-agents" flexDirection="column" borderStyle="single" borderColor={AMBER} paddingX={1}>
          {title('Subagents')}
          {s.agents.length === 0 && <Text dimColor>None started yet</Text>}
          {agentRows(6)}
        </Box>
        <Box key="p-cost" flexDirection="column" borderStyle="single" borderColor={AMBER} paddingX={1}>
          {title('Cost and tokens')}
          {line('Cost, whole session', s.costUsd === null ? '--' : `$${s.costUsd.toFixed(2)}`, AMBER)}
          {line('Tokens read', compact(read_), CYAN)}
          {line('  served from cache', `${cached}%`, CYAN)}
          {line('Tokens written', compact(s.outTokens), GREEN)}
          {line('Turns', `${s.turns}`, CYAN)}
          <Text dimColor>Tokens and turns count from when this loaded</Text>
          {s.tickError !== '' && <Text key="p-timer" color={RED}>{`Timer error, ${s.tickError}`}</Text>}
        </Box>
      </Box>
    )
  })
}
