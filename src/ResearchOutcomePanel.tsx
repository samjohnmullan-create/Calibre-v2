import './research-workspace.css'

type Finding = {
  proposed_destination: string | null
  proposed_field: string | null
  proposal_status: string
  confidence: string
}

type ResearchRequest = {
  request_type: string
  requested_scope: Record<string, unknown>
}

function autonomous(request: ResearchRequest | null) {
  const value = request?.requested_scope?.autonomous_research
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function domain(request: ResearchRequest | null) {
  const value = request?.requested_scope?.domain_ingestion
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function countCompatibility(request: ResearchRequest | null) {
  const ingestion = domain(request)
  const compatibility = ingestion?.compatibility
  if (!compatibility || typeof compatibility !== 'object') return 0
  const value = compatibility as Record<string, unknown>
  return (Array.isArray(value.movements) ? value.movements.length : 0) + (Array.isArray(value.parts) ? value.parts.length : 0)
}

function countDocuments(request: ResearchRequest | null) {
  const docs = domain(request)?.technical_documents
  return Array.isArray(docs) ? docs.length : 0
}

export default function ResearchOutcomePanel({ request, findings, sourceCount }: { request: ResearchRequest | null; findings: Finding[]; sourceCount: number }) {
  if (!request) return null
  const result = autonomous(request)
  const unresolved = Array.isArray(result?.unresolved) ? result?.unresolved.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : []
  const pending = findings.filter((finding) => finding.proposed_destination && finding.proposed_field && finding.proposal_status === 'pending').length
  const applied = findings.filter((finding) => finding.proposal_status === 'applied').length
  const documents = countDocuments(request)
  const compatibility = countCompatibility(request)
  const summary = typeof result?.summary === 'string' ? result.summary : ''

  return <section className="research-outcome-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">RESEARCH OUTCOME</p><strong>What Calibre found and what needs your decision</strong></div><span>{findings.length} findings</span></div>
    {summary && <p className="research-outcome-summary">{summary}</p>}
    <div className="research-outcome-stats">
      <div><strong>{pending}</strong><span>Proposed updates</span></div>
      <div><strong>{applied}</strong><span>Confirmed updates</span></div>
      <div><strong>{documents}</strong><span>Documents found</span></div>
      <div><strong>{compatibility}</strong><span>Parts / compatibility</span></div>
      <div><strong>{sourceCount}</strong><span>Sources</span></div>
      <div><strong>{unresolved.length}</strong><span>Research gaps</span></div>
    </div>
    {unresolved.length > 0 && <div className="research-gaps">
      <div><p className="eyebrow">RESEARCH GAPS</p><strong>What would make the next research run stronger</strong></div>
      <ul>{unresolved.map((gap, index) => <li key={`${index}-${gap.slice(0, 24)}`}>{gap}</li>)}</ul>
    </div>}
  </section>
}
