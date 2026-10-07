export type Assumption = {
  id: number
  text: string
  basis: string
  affects: string
  at: number
  agent: string | null
  status: 'open' | 'replaced' | 'flagged'
  replacedBy: number | null
}

export type Undone = {
  id: number
  text: string
  source: 'said' | 'code' | 'checker'
  at: number
  status: 'open' | 'sent' | 'cleared'
}

export type Slice ={ name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }

export type AgentRow = {
  id: string
  label: string
  type: string
  model: string | null
  startedAt: number
  endedAt: number | null
  lastSeenAt: number
  isSpawned: boolean
  tools: number
  tokensRead: number
  tokensOut: number
  hasFailed: boolean
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Todo = { subject: string; status: 'pending' | 'in_progress' | 'completed' }

export type Stats = {
  openedAt: number
  now: number
  turns: number
  tools: number
  fails: number
  freshTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outTokens: number
  costUsd: number | null
  ctxPercent: number | null
  ctxTokens: number | null
  ctxWindow: number | null
  slices: Slice[]
  stamps: number[]
  assumptions: Assumption[]
  nextNote: number
  agents: AgentRow[]
  lastMainAt: number
  model: string | null
  ttlMs: number
  needsMeasure: boolean
  undone: Undone[]
  nextUndone: number
  lastPrompt: string
  turnTools: number
  isChecking: boolean
  tickError: string
  limits: Limit[]
  todos: Todo[]
  goal: string
}

declare module 'claude-code' {
  interface PluginState {
    'terminal-desk': { stats: Stats; isHidden: boolean }
  }
}
