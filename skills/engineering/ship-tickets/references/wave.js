export const meta = {
  name: 'ship-tickets-wave',
  description: 'Build one wave of bundles in parallel (one builder per bundle, its tickets in order); risk-tier bundles also get a fresh reads-right reviewer (spec, then quality)',
  phases: [{ title: 'Build' }, { title: 'Spec review' }, { title: 'Quality review' }, { title: 'Fix' }],
}
const W = args.wave
const RUN = args.run
const BUILD = { type: 'object', required: ['status', 'files_written', 'per_ticket', 'tests_added', 'commands', 'unresolved', 'notes'],
  properties: {
    status: { enum: ['done', 'done_with_concerns', 'needs_context', 'blocked'] },
    files_written: { type: 'array', items: { type: 'string' } },
    per_ticket: { type: 'array', items: { type: 'object', required: ['ticket', 'files'],
      properties: { ticket: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } } } },
    tests_added: { type: 'array', items: { type: 'object', required: ['path', 'name', 'red_output'],
      properties: { path: { type: 'string' }, name: { type: 'string' }, red_output: { type: 'string' } } } },
    commands: { type: 'array', items: { type: 'object', required: ['cmd', 'exit', 'tail'],
      properties: { cmd: { type: 'string' }, exit: { type: 'integer' }, tail: { type: 'string' } } } },
    unresolved: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' } } }
const ISSUE = { type: 'object', required: ['severity', 'file_line', 'what', 'fix'],
  properties: { severity: { enum: ['Critical', 'Important', 'Minor'] }, file_line: { type: 'string' }, what: { type: 'string' }, fix: { type: 'string' } } }
const SPEC = { type: 'object', required: ['compliant', 'issues'],
  properties: { compliant: { type: 'boolean' }, issues: { type: 'array', items: ISSUE } } }
const QUAL = { type: 'object', required: ['ready_to_merge', 'issues', 'strengths'],
  properties: { ready_to_merge: { enum: ['Yes', 'No', 'With fixes'] }, issues: { type: 'array', items: ISSUE }, strengths: { type: 'string' } } }

// args: {wave, run, bundles:[{id:'B1', tickets:['T1','T2'], glob, model?, effort?, risk?}]}
// t.model: 'sonnet' default; 'opus' for risk-tier tickets (orchestration.md says which).
// t.risk: true → per-ticket reads-right review; otherwise build only (the review loop reads it at the end).
const M = (t, effort) => ({ model: t.model || 'sonnet', effort: t.model === 'opus' ? 'high' : (t.effort || effort) })
const blocking = (issues) => issues.filter(i => i.severity !== 'Minor')

async function reviewOnce(t, build, round) {
  const files = t.tickets.map(x => `${RUN}/issue-${x.slice(1)}.md`).join(', ')
  const ctx = `Bundle ${t.id}: tickets ${t.tickets.join(', ')} — review each ticket against its own file: ${files}. Your glob: ${t.glob}.\nBuilder's report (a claim, verify it):\n${JSON.stringify(build)}`
  const spec = await agent(`Read ${W}/review-spec.md and follow it.\n\n${ctx}`,
    { label: `spec:${t.id}:r${round}`, phase: 'Spec review', schema: SPEC, ...M(t, 'medium') })
  if (!spec) return { spec: null, qual: null, open: [{ severity: 'Important', file_line: '-', what: 'spec reviewer died', fix: 'controller reviews' }] }
  if (!spec.compliant || blocking(spec.issues).length) return { spec, qual: null, open: blocking(spec.issues) }
  const qual = await agent(`Read ${W}/review-quality.md and follow it.\n\n${ctx}`,
    { label: `quality:${t.id}:r${round}`, phase: 'Quality review', schema: QUAL, ...M(t, 'medium') })
  if (!qual) return { spec, qual: null, open: [{ severity: 'Important', file_line: '-', what: 'quality reviewer died', fix: 'controller reviews' }] }
  return { spec, qual, open: blocking(qual.issues) }
}

const results = await pipeline(args.bundles,
  t => agent(`Read your brief at ${W}/${t.id}-build.md and follow it exactly. Report nothing you did not observe.`,
    { label: `build:${t.id}`, phase: 'Build', schema: BUILD, ...M(t, 'medium') }),
  async (build, t) => {
    const history = []
    if (!build || build.status === 'blocked' || build.status === 'needs_context' || !build.files_written.length) {
      return { bundle: t.id, tickets: t.tickets, build, reviews: history, open: ['builder did not finish'] }
    }
    if (!t.risk) return { bundle: t.id, tickets: t.tickets, build, reviews: history, open: [] }
    let cur = build
    for (let round = 1; round <= 3; round++) {
      const r = await reviewOnce(t, cur, round)
      history.push(r)
      if (!r.open.length || round === 3) return { bundle: t.id, tickets: t.tickets, build: cur, reviews: history, open: r.open }
      const fixed = await agent(
        `Read your brief at ${W}/${t.id}-build.md (same rules). A previous agent built this bundle; the code is in the project. A separate reviewer found these issues — fix each one, or explain in notes why it is wrong with evidence:\n${JSON.stringify(r.open)}\nRe-run your test files after. Report the full structured output again.`,
        { label: `fix:${t.id}:r${round}`, phase: 'Fix', schema: BUILD, ...M(t, 'high') })
      if (!fixed) return { bundle: t.id, tickets: t.tickets, build: cur, reviews: history, open: r.open }
      cur = fixed
    }
  })
// Short return: the orchestrator's context is the scarcest thing in the run.
const short = (s) => (s || '').slice(0, 220)
return results.map(r => r && ({ bundle: r.bundle, tickets: r.tickets, status: r.build && r.build.status, rounds: r.reviews.length,
  per_ticket: ((r.build && r.build.per_ticket) || []).map(p => `${p.ticket}: ${p.files.length} files`),
  open: (r.open || []).map(i => typeof i === 'string' ? i : `${i.severity} ${short(i.file_line)}: ${short(i.what)}`),
  minors: r.reviews.flatMap(x => [...((x.spec && x.spec.issues) || []), ...((x.qual && x.qual.issues) || [])]).filter(i => i.severity === 'Minor').map(i => short(i.what)).slice(0, 6),
  unresolved: ((r.build && r.build.unresolved) || []).map(short) }))
