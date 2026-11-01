export const meta = {
  name: 'ship-tickets-wave',
  description: 'Build one wave of bundles in parallel (one builder per bundle, its tickets in order); risk-tier bundles also get fresh reads-right reviewers: Spec and Standards in parallel, on agy gemini-3.8-flash-high (Claude fallback)',
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
  properties: { severity: { enum: ['Critical', 'Important', 'Minor'] }, file_line: { type: 'string' }, what: { type: 'string' }, fix: { type: 'string' },
    kind: { enum: ['defect', 'decision for operator'] } } }  // kind optional, default defect; 'decision for operator' never blocks, it goes to the findings log
const SPEC = { type: 'object', required: ['compliant', 'issues'],
  properties: { compliant: { type: 'boolean' }, issues: { type: 'array', items: ISSUE } } }
const QUAL = { type: 'object', required: ['ready_to_merge', 'issues', 'strengths'],
  properties: { ready_to_merge: { enum: ['Yes', 'No', 'With fixes'] }, issues: { type: 'array', items: ISSUE }, strengths: { type: 'string' } } }
// The agy runner returns the same shape plus agy_ok (false = agy missing / usage exhausted / no parsable review → Claude fallback).
const withAgy = (S) => ({ ...S, required: ['agy_ok', ...S.required], properties: { agy_ok: { type: 'boolean' }, agy_note: { type: 'string' }, ...S.properties } })

// args: {wave, run, bundles:[{id:'B1', tickets:['T1','T2'], glob, model?, build_model?, review_model?, fix_model?, effort?, risk?}], reviewer?:'agy'|'claude'}
// Model per role (shared/models.md): t.build_model / t.review_model / t.fix_model, each falling back to t.model, then 'sonnet'.
//   build = the builder; fix = the fixer; review = the CLAUDE reviewer, used only when agy is off or down (agy reviews run on gemini-3.8-flash-high).
//   One 'opus' ticket no longer means Opus builder + reviewer + fixer: set only the role that is hard.
// t.risk: true → per-ticket reads-right review (Spec + Standards in parallel); otherwise build only (the review loop reads it at the end).
const M = (t, role, effort) => { const model = t[role + '_model'] || t.model || 'sonnet'; return { model, effort: model === 'opus' ? 'high' : (t.effort || effort) } }
const isDecision = (i) => i.kind === 'decision for operator'
const blocking = (issues) => issues.filter(i => i.severity !== 'Minor' && !isDecision(i))
const decisions = []   // 'decision for operator' items from every review; written to $RUN/findings.md at the end, never block
let agyDown = args.reviewer === 'claude'   // set true on the first agy failure; later reviews in this wave skip agy

// Route: a small Sonnet agent runs the agy launch line from shared/models.md (Bash) and returns agy's review in the schema.
// wave.js can only call Claude agents; agy is a CLI, so this runner is the simplest working bridge.
async function viaAgy(t, kind, tmpl, ctx, round, schema) {
  const base = `${W}/agy-${kind}-${t.id}-r${round}`
  const reply = kind === 'spec' ? '{"compliant": bool, "issues": [...]}' : '{"ready_to_merge": "Yes"|"No"|"With fixes", "issues": [...], "strengths": "..."}'
  const prompt = `Write the text between the markers to ${base}.prompt (cat heredoc), then run the agy launch line from the plugin's shared/models.md ("Agy launch") with WORKDIR=$(git rev-parse --show-toplevel), PROMPT=${base}.prompt, OUT=${base}.out, model gemini-3.8-flash-high. You only run agy and relay its review; never review yourself, never edit project files.\n` +
    `After agy exits: read ${base}.out. It must end with one json code block ${reply}; each issue is {severity: Critical|Important|Minor, file_line, what, fix, kind: defect|"decision for operator"}. Copy it into your structured answer with agy_ok=true. ` +
    `If agy is missing, hit a usage / quota / rate limit (look in ${base}.out and ${base}.out.log), crashed, or gave no parsable review: agy_ok=false, agy_note=one line why, empty issues, compliant=false / ready_to_merge="No" / strengths="". Never invent a review.\n` +
    `<<<AGY PROMPT\nRead ${W}/${tmpl} and follow it. This review is READ-ONLY: edit nothing, run no app. Finish your answer with the json code block described there.\n\n${ctx}\nAGY PROMPT>>>`
  return agent(prompt, { label: `agy-${kind}:${t.id}:r${round}`, phase: kind === 'spec' ? 'Spec review' : 'Quality review', schema: withAgy(schema), model: 'sonnet', effort: 'low' })
}

// One reviewer: agy first; Claude (t.review_model) when agy is off, down, or fails.
async function review(t, kind, tmpl, ctx, round, schema) {
  if (!agyDown) {
    const r = await viaAgy(t, kind, tmpl, ctx, round, schema)
    if (r && r.agy_ok) return r
    agyDown = true   // usage exhausted or agy broken: the rest of this wave uses the Claude reviewer
  }
  return agent(`Read ${W}/${tmpl} and follow it.\n\n${ctx}`,
    { label: `${kind}:${t.id}:r${round}`, phase: kind === 'spec' ? 'Spec review' : 'Quality review', schema, ...M(t, 'review', 'medium') })
}

async function reviewOnce(t, build, round) {
  const files = t.tickets.map(x => `${RUN}/issue-${x.slice(1)}.md`).join(', ')
  const ctx = `Bundle ${t.id}: tickets ${t.tickets.join(', ')} — review each ticket against its own file: ${files}. Your glob: ${t.glob}.\nBuilder's report (a claim, verify it):\n${JSON.stringify(build)}\nAn issue that is a choice only the operator can make (a trade-off, a product call), not a defect, gets kind "decision for operator": it never blocks the ticket and goes to the findings log. Everything else is kind "defect".`
  // Spec and Standards run at the same time: they read the same code and neither needs the other's verdict.
  const [spec, qual] = await Promise.all([
    review(t, 'spec', 'review-spec.md', ctx, round, SPEC),
    review(t, 'quality', 'review-quality.md', ctx, round, QUAL)])
  const all = [...((spec && spec.issues) || []), ...((qual && qual.issues) || [])]
  decisions.push(...all.filter(isDecision).map(i => ({ bundle: t.id, ...i })))
  const open = []
  if (!spec) open.push({ severity: 'Important', file_line: '-', what: 'spec reviewer died', fix: 'controller reviews' })
  else open.push(...blocking(spec.issues))
  if (!qual) open.push({ severity: 'Important', file_line: '-', what: 'quality reviewer died', fix: 'controller reviews' })
  else open.push(...blocking(qual.issues))
  return { spec, qual, open }
}

const results = await pipeline(args.bundles,
  t => agent(`Read your brief at ${W}/${t.id}-build.md and follow it exactly. Report nothing you did not observe.`,
    { label: `build:${t.id}`, phase: 'Build', schema: BUILD, ...M(t, 'build', 'medium') }),
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
        { label: `fix:${t.id}:r${round}`, phase: 'Fix', schema: BUILD, ...M(t, 'fix', 'high') })
      if (!fixed) return { bundle: t.id, tickets: t.tickets, build: cur, reviews: history, open: r.open }
      cur = fixed
    }
  })
// 'decision for operator' items: one agent appends them to the findings log (only when there are any). They do not block the ticket.
if (decisions.length) {
  const uniq = [...new Map(decisions.map(d => [`${d.bundle}|${d.file_line}|${d.what}`, d])).values()]
  const lines = uniq.map((d, n) => `OP${n + 1} | ${W.split('/').pop()} ${d.bundle} | DECISION-FOR-OPERATOR | ${d.file_line}: ${d.what} (suggested: ${d.fix})`.replace(/\n/g, ' '))
  await agent(`Append these lines, exactly as given, to ${RUN}/findings.md (create it if missing; use cat >> with a quoted heredoc). Touch nothing else. Report one word: done.\n\n${lines.join('\n')}`,
    { label: 'findings-log', phase: 'Fix', model: 'sonnet', effort: 'low' })
}
// Short return: the orchestrator's context is the scarcest thing in the run.
const short = (s) => (s || '').slice(0, 220)
return results.map(r => r && ({ bundle: r.bundle, tickets: r.tickets, status: r.build && r.build.status, rounds: r.reviews.length,
  per_ticket: ((r.build && r.build.per_ticket) || []).map(p => `${p.ticket}: ${p.files.length} files`),
  open: (r.open || []).map(i => typeof i === 'string' ? i : `${i.severity} ${short(i.file_line)}: ${short(i.what)}`),
  minors: r.reviews.flatMap(x => [...((x.spec && x.spec.issues) || []), ...((x.qual && x.qual.issues) || [])]).filter(i => i.severity === 'Minor').map(i => short(i.what)).slice(0, 6),
  unresolved: ((r.build && r.build.unresolved) || []).map(short),
  decisions_logged: decisions.filter(d => d.bundle === r.bundle).length, reviewer: agyDown ? 'claude (agy off/down)' : 'agy' }))
