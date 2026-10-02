export const meta = {
  name: 'ship-tickets-wave',
  description: 'Build one wave of tickets in parallel; each ticket gets a separate fresh reads-right reviewer (spec, then quality)',
  phases: [{ title: 'Build' }, { title: 'Spec review' }, { title: 'Quality review' }, { title: 'Fix' }],
}
const W = args.wave
const RUN = args.run
const BUILD = { type: 'object', required: ['status', 'files_written', 'tests_added', 'commands', 'unresolved', 'notes'],
  properties: {
    status: { enum: ['done', 'done_with_concerns', 'needs_context', 'blocked'] },
    files_written: { type: 'array', items: { type: 'string' } },
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

const blocking = (issues) => issues.filter(i => i.severity !== 'Minor')

async function reviewOnce(t, build, round) {
  const ctx = `Ticket ${t.id}. Ticket file: ${RUN}/issue-${t.id.slice(1)}.md. Your glob: ${t.glob}.\nBuilder's report (a claim, verify it):\n${JSON.stringify(build)}`
  const spec = await agent(`Read ${W}/review-spec.md and follow it.\n\n${ctx}`,
    { label: `spec:${t.id}:r${round}`, phase: 'Spec review', schema: SPEC })
  if (!spec) return { spec: null, qual: null, open: [{ severity: 'Important', file_line: '-', what: 'spec reviewer died', fix: 'controller reviews' }] }
  if (!spec.compliant || blocking(spec.issues).length) return { spec, qual: null, open: blocking(spec.issues) }
  const qual = await agent(`Read ${W}/review-quality.md and follow it.\n\n${ctx}`,
    { label: `quality:${t.id}:r${round}`, phase: 'Quality review', schema: QUAL })
  if (!qual) return { spec, qual: null, open: [{ severity: 'Important', file_line: '-', what: 'quality reviewer died', fix: 'controller reviews' }] }
  return { spec, qual, open: blocking(qual.issues) }
}

const results = await pipeline(args.tickets,
  t => agent(`Read your brief at ${W}/${t.id}-build.md and follow it exactly. Report nothing you did not observe.`,
    { label: `build:${t.id}`, phase: 'Build', schema: BUILD }),
  async (build, t) => {
    const history = []
    if (!build || build.status === 'blocked' || build.status === 'needs_context' || !build.files_written.length) {
      return { ticket: t.id, build, reviews: history, open: ['builder did not finish'] }
    }
    let cur = build
    for (let round = 1; round <= 3; round++) {
      const r = await reviewOnce(t, cur, round)
      history.push(r)
      if (!r.open.length || round === 3) return { ticket: t.id, build: cur, reviews: history, open: r.open }
      const fixed = await agent(
        `Read your brief at ${W}/${t.id}-build.md (same rules). You built this ticket already; the code is in the tree. A separate reviewer found these issues — fix each one, or explain in notes why it is wrong with evidence:\n${JSON.stringify(r.open)}\nRe-run your test files after. Report the full structured output again.`,
        { label: `fix:${t.id}:r${round}`, phase: 'Fix', schema: BUILD })
      if (!fixed) return { ticket: t.id, build: cur, reviews: history, open: r.open }
      cur = fixed
    }
  })
return results