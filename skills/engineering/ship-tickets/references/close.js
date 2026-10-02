export const meta = {
  name: 'ship-tickets-close',
  description: 'Close one wave: closer checks + commits + red-proof, then a fresh runs-right verifier per ticket, serially, with fix loop',
  phases: [{ title: 'Close' }, { title: 'Verify' }, { title: 'Fix' }],
}
// args: {wave, run, tickets:[{id, glob}]}. Briefs the orchestrator wrote: ${wave}/close.md, ${wave}/verify.md, ${wave}/<T>-build.md
const W = args.wave
const RUN = args.run
const CMD = { type: 'object', required: ['cmd', 'exit', 'tail'],
  properties: { cmd: { type: 'string' }, exit: { type: 'integer' }, tail: { type: 'string' } } }
const CLOSE = { type: 'object', required: ['leaks', 'suites', 'lint', 'commits', 'red_proof', 'blocking'],
  properties: {
    leaks: { type: 'array', items: { type: 'string' } },
    suites: { type: 'array', items: { type: 'object', required: ['name', 'passed', 'failed', 'vs_baseline'],
      properties: { name: { type: 'string' }, passed: { type: 'integer' }, failed: { type: 'integer' }, vs_baseline: { type: 'string' } } } },
    lint: { type: 'array', items: { type: 'object', required: ['tool', 'vs_baseline'],
      properties: { tool: { type: 'string' }, vs_baseline: { type: 'string' } } } },
    commits: { type: 'array', items: { type: 'object', required: ['ticket', 'sha'],
      properties: { ticket: { type: 'string' }, sha: { type: 'string' } } } },
    red_proof: { type: 'array', items: { type: 'object', required: ['ticket', 'test', 'fails_without_change'],
      properties: { ticket: { type: 'string' }, test: { type: 'string' }, fails_without_change: { type: 'boolean' } } } },
    blocking: { type: 'array', items: { type: 'string' } } } }
const VERIFY = { type: 'object', required: ['verdict', 'claim', 'method', 'steps', 'findings', 'cleanup'],
  properties: {
    verdict: { enum: ['PASS', 'FAIL', 'BLOCKED', 'SKIP'] },
    claim: { type: 'string' }, method: { type: 'string' },
    steps: { type: 'array', items: { type: 'object', required: ['mark', 'did', 'saw', 'evidence'],
      properties: { mark: { enum: ['✅', '❌', '⚠️', '🔍'] }, did: { type: 'string' }, saw: { type: 'string' }, evidence: { type: 'string' } } } },
    findings: { type: 'array', items: { type: 'string' } },
    cleanup: { type: 'string' } } }
const FIX = { type: 'object', required: ['status', 'sha', 'files_written', 'commands', 'notes'],
  properties: {
    status: { enum: ['fixed', 'disputed', 'blocked'] }, sha: { type: 'string' },
    files_written: { type: 'array', items: { type: 'string' } },
    commands: { type: 'array', items: CMD }, notes: { type: 'string' } } }

phase('Close')
const close = await agent(`Read ${W}/close.md and follow it exactly. Report nothing you did not observe.`,
  { label: 'closer', phase: 'Close', schema: CLOSE, model: 'sonnet' })
if (!close) return { close: null, verify: [], stop: 'closer died' }
if (close.blocking.length || close.leaks.length) return { close, verify: [], stop: 'closer found blocking issues' }

// Serial on purpose: verifiers build and serve the app; two at once on one box fake failures.
const verify = []
for (const t of args.tickets) {
  const ctx = `Ticket ${t.id}. Ticket file: ${RUN}/issue-${t.id.slice(1)}.md. Glob: ${t.glob}.`
  const rounds = []
  for (let round = 1; round <= 3; round++) {
    const v = await agent(`Read ${W}/verify.md and follow it. Fresh verifier; you never saw the build.\n\n${ctx}`,
      { label: `verify:${t.id}:r${round}`, phase: 'Verify', schema: VERIFY, model: 'sonnet' })
    rounds.push(v)
    if (!v || v.verdict !== 'FAIL' || round === 3) break
    const fixed = await agent(
      `Read ${W}/${t.id}-build.md (same rules, except: you work alone now, so after your ticket's tests pass, stage only paths in ${t.glob} by name and commit "fix(${t.id} verify): <what>"). A separate verifier ran the app and saw this — fix the cause, or put evidence it is wrong in notes:\n${JSON.stringify({ steps: v.steps, findings: v.findings })}`,
      { label: `fix:${t.id}:r${round}`, phase: 'Fix', schema: FIX, model: 'sonnet' })
    rounds.push({ fix: fixed })
    if (!fixed || fixed.status !== 'fixed') break
  }
  verify.push({ ticket: t.id, rounds })
}
return { close, verify }
