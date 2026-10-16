import './research-workspace.css'

type Finding = {
  id: string
  category: string
  finding: string
  confidence: string
  proposed_destination: string | null
  proposed_field: string | null
  proposed_value: unknown
}

type ResearchRequest = { requested_scope: Record<string, unknown> }

type Candidate = Record<string, unknown>

function ingestion(request: ResearchRequest | null) {
  const value = request?.requested_scope?.domain_ingestion
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function compatibility(request: ResearchRequest | null) {
  const value = ingestion(request)?.compatibility
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function movementCandidates(request: ResearchRequest | null) {
  const values = compatibility(request)?.movements
  return Array.isArray(values) ? values.filter((value): value is Candidate => Boolean(value && typeof value === 'object')) : []
}

function partCandidates(request: ResearchRequest | null) {
  const values = compatibility(request)?.parts
  return Array.isArray(values) ? values.filter((value): value is Candidate => Boolean(value && typeof value === 'object')) : []
}

function label(value: unknown, fallback = 'Unknown') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function candidateClass(value: Candidate) {
  const notes = `${value.scope ?? ''} ${value.notes ?? ''} ${value.condition_text ?? ''}`.toLowerCase()
  if (notes.includes('failed') || notes.includes('incompatible') || notes.includes('does not fit')) return 'Known incompatible'
  if (notes.includes('exact') || notes.includes('same calibre') || notes.includes('manufacturer documented')) return 'Exact / documented'
  if (notes.includes('donor') || notes.includes('family')) return 'Donor / family'
  return 'Possible compatible'
}

export default function PartsResearchSummary({ request, findings }: { request: ResearchRequest | null; findings: Finding[] }) {
  const movements = movementCandidates(request)
  const parts = partCandidates(request)
  const compatibilityFindings = findings.filter((finding) => {
    const text = `${finding.category} ${finding.finding}`.toLowerCase()
    return finding.proposed_destination === 'compatibility' || /part|stem|donor|compatib|interchange|movement family/.test(text)
  })

  if (!movements.length && !parts.length && !compatibilityFindings.length) return null

  const groups = new Map<string, Candidate[]>()
  for (const candidate of [...movements.map((value) => ({ ...value, candidate_kind: 'movement' })), ...parts.map((value) => ({ ...value, candidate_kind: 'part' }))]) {
    const group = candidateClass(candidate)
    groups.set(group, [...(groups.get(group) ?? []), candidate])
  }

  return <section className="parts-research-summary">
    <div className="bench-guided-heading"><div><p className="eyebrow">PARTS INTELLIGENCE</p><strong>Compatibility leads — verify before fitting</strong></div><span>{movements.length + parts.length || compatibilityFindings.length} candidates</span></div>
    <p className="bench-guided-help">Research candidates are evidence leads, not confirmed fit. Calibre keeps the reason, source and confidence so bench verification can later promote or reject the relationship.</p>

    {[...groups.entries()].map(([group, candidates]) => <div className="parts-candidate-group" key={group}>
      <h4>{group}</h4>
      {candidates.map((candidate, index) => <article key={`${group}-${index}`}>
        <div><strong>{candidate.candidate_kind === 'part'
          ? `${label(candidate.part_type, 'Part')} · ${label(candidate.part_reference, 'No reference')}`
          : `${label(candidate.maker, 'Movement')} ${label(candidate.calibre, '')}`}</strong>
          <span>{label(candidate.confidence, 'candidate')}</span></div>
        {candidate.description && <p>{String(candidate.description)}</p>}
        {candidate.notes && <p>{String(candidate.notes)}</p>}
        {candidate.modification_required === true && <small>Modification required</small>}
      </article>)}
    </div>)}

    {!groups.size && compatibilityFindings.length > 0 && <div className="parts-candidate-group"><h4>Research evidence</h4>{compatibilityFindings.map((finding) => <article key={finding.id}><div><strong>{finding.category}</strong><span>{finding.confidence}</span></div><p>{finding.finding}</p></article>)}</div>}
  </section>
}
