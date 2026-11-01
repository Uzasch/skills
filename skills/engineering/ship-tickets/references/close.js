export const meta = {
  name: 'ship-tickets-close',
  description: 'Close one wave: closer checks + commits + red-proof, then a fresh runs-right verifier per ticket, serially, with fix loop',
  phases: [{ title: 'Close' }, { title: 'Verify' }, { title: 'Fix' }],
}
// args: {wave, run, tickets:[{id, bundle, glob, model?, fix_model?, skipVerify?}]} — one entry per TICKET (bundles flattened; glob = its bundle's glob). fix_model (falls back to model, then sonnet) is the fixer's model; the closer and verifiers stay sonnet. skipVerify: "<why>" for a ticket with no user surface. Briefs the orchestrator wrote: ${wave}/close.md, ${wave}/verify.md, ${wave}/<B>-build.md
const W = args.wave
const RUN = args.run
const CMD = { type: 'object', required: ['cmd', 'exit', 'tail'],
  properties: { cmd: { type: 'string' }, exit: { type: 'integer' }, tail: { type: 'string' } } }
const CLOSE = { type: 'object', required: ['leaks', 'suites', 'lint', 'commits', 'red_proof', 'blocking', 'notes'],
  properties: {
    // leaks: file PATHS found outside the wave's globs, nothing else (any non-empty array stops the wave). Anything free-text goes in notes.
    leaks: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    suites: { type: 'array', items: { type: 'object', required: ['name', 'passed', 'failed', 'vs_baseline'],
      properties: { name: { type: 'string' }, passed: { type: 'integer' }, failed: { type: 'integer' }, vs_baseline: { type: 'string' } } } },
    lint: { type: 'array', items: { type: 'object', required: ['tool', 'vs_baseline'],
      properties: { tool: { type: 'string' }, vs_baseline: { type: 'string' } } } },
    commits: { type: 'array', items: { type: 'object', required: ['ticket', 'sha'],
      properties: { ticket: { type: 'string' }, sha: { type: 'string' } } } },
    red_proof: { type: 'array', items: { type: 'object', required: ['ticket', 'test', 'kind', 'fails_without_change'],
      // kind: 'new' = a test written for this ticket (must fail without the change); 'guard' = an existing test that stays green (fails_without_change is just what you saw, never blocking).
      properties: { ticket: { type: 'string' }, test: { type: 'string' }, kind: { enum: ['new', 'guard'] }, fails_without_change: { type: 'boolean' } } } },
    blocking: { type: 'array', items: { type: 'string' } } } }
const VERIFY = { type: 'object', required: ['verdict', 'claim', 'method', 'steps', 'findings', 'cleanup'],
  properties: {
    verdict: { enum: ['PASS', 'FAIL', 'BLOCKED', 'SKIP'] },
    blocked_on: { type: 'string' },   // BLOCKED only: the check that could not run (no Supabase branch, no sign-in, ...) and why
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
  { label: 'closer', phase: 'Close', schema: CLOSE, model: 'sonnet', effort: 'medium' })
if (!close) return { close: null, verify: [], stop: 'closer died' }
if (close.blocking.length || close.leaks.length) return { stop: 'closer found blocking issues', leaks: close.leaks, blocking: close.blocking.map(b => b.slice(0, 300)), commits: close.commits }

// Serial on purpose: verifiers build and serve the app; two at once on one box fake failures.
const verify = []
for (const t of args.tickets) {
  if (t.skipVerify) { verify.push({ ticket: t.id, rounds: [], skipped: t.skipVerify }); continue }
  const ctx = `Ticket ${t.id}. Ticket file: ${RUN}/issue-${t.id.slice(1)}.md. Glob: ${t.glob}.`
  const rounds = []
  for (let round = 1; round <= 3; round++) {
    const v = await agent(`Read ${W}/verify.md and follow it. Fresh verifier; you never saw the build.\n\n${ctx}`,
      { label: `verify:${t.id}:r${round}`, phase: 'Verify', schema: VERIFY, model: 'sonnet', effort: 'medium' })
    rounds.push(v)
    // Only FAIL enters the fix loop. BLOCKED = the check could not run: reported, never fixed by a fixer, ticket not failed.
    if (!v || v.verdict !== 'FAIL' || round === 3) break
    const fixed = await agent(
      `Read ${W}/${t.bundle || t.id}-build.md (same rules, except: you work alone now, so after your ticket's tests pass, stage only paths in ${t.glob} by name and commit "fix(${t.id} verify): <what>"). A separate verifier ran the app and saw this — fix the cause, or put evidence it is wrong in notes:\n${JSON.stringify({ steps: v.steps, findings: v.findings })}`,
      { label: `fix:${t.id}:r${round}`, phase: 'Fix', schema: FIX, model: t.fix_model || t.model || 'sonnet', effort: 'high' })
    rounds.push({ fix: fixed })
    if (!fixed || fixed.status !== 'fixed') break
  }
  verify.push({ ticket: t.id, rounds })
}
// Short return: the orchestrator's context is the scarcest thing in the run.
const short = (s) => (s || '').slice(0, 220)
return { commits: close.commits, suites: close.suites.map(s => `${s.name} ${s.passed}/${s.failed} ${short(s.vs_baseline)}`),
  lint: close.lint.map(l => `${l.tool} ${short(l.vs_baseline)}`),
  red_proof_dead: close.red_proof.filter(r => r.kind === 'new' && !r.fails_without_change).map(r => `${r.ticket} ${r.test}`),
  guards: close.red_proof.filter(r => r.kind === 'guard').length, closer_notes: short(close.notes),
  verify: verify.map(v => ({ ticket: v.ticket, skipped: v.skipped, rounds: v.rounds.map(x => x && (x.fix ? `fix:${x.fix.status} ${x.fix.sha}` : `${x.verdict}`)),
    blocked_on: short(((v.rounds.filter(x => x && x.verdict === 'BLOCKED').slice(-1)[0]) || {}).blocked_on),
    findings: ((v.rounds.filter(x => x && x.verdict).slice(-1)[0] || {}).findings || []).map(short).slice(0, 5) })) }

