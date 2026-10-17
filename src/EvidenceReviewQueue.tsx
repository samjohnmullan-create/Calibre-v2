import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './evidence-review-queue.css'

type ReviewStatus = 'candidate' | 'accepted' | 'rejected'
type StatusFilter = ReviewStatus | 'all'
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low'

type FindingRow = {
  id: string
  document_id: string
  topic: string
  finding: string
  page_from: number
  page_to: number
  confidence: string
  evidence_note: string
  review_status: ReviewStatus
  extracted_at: string | null
  created_at: string
}

type DocumentRow = {
  id: string
  title: string
  document_type: string
  url: string
  storage_bucket: string
  storage_path: string
  item_id: string | null
  work_id: string | null
  movement_id: string | null
  reference_text: string
  verification_status: string
}

type ItemRow = { id: string; item_number: number; title: string }
type WorkRow = { id: string; work_number: number; title: string }
type MovementRow = { id: string; maker: string; calibre: string }
type PassportRow = { item_id: string; movement_identification_status: string; knowledge_movement_id: string | null }

const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const pageLabel = (row: FindingRow) => row.page_to && row.page_to !== row.page_from ? `pp. ${row.page_from}–${row.page_to}` : `p. ${row.page_from}`
const confidenceRank = (value: string) => ({ high: 3, medium: 2, low: 1 }[String(value).toLowerCase()] ?? 0)

export default function EvidenceReviewQueue({ workspaceId: suppliedWorkspaceId }: { workspaceId?: string }) {
  const [workspaceId, setWorkspaceId] = useState(suppliedWorkspaceId || '')
  const [findings, setFindings] = useState<FindingRow[]>([])
  const [documents, setDocuments] = useState<Map<string, DocumentRow>>(new Map())
  const [items, setItems] = useState<Map<string, ItemRow>>(new Map())
  const [works, setWorks] = useState<Map<string, WorkRow>>(new Map())
  const [movements, setMovements] = useState<Map<string, MovementRow>>(new Map())
  const [passports, setPassports] = useState<Map<string, PassportRow>>(new Map())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('candidate')
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (suppliedWorkspaceId) {
      setWorkspaceId(suppliedWorkspaceId)
      return
    }
    void (async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (result.error) {
        setMessage(`Evidence workspace could not load: ${result.error.message}`)
        return
      }
      setWorkspaceId(result.data?.id || '')
    })()
  }, [suppliedWorkspaceId])

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setMessage('')

    const findingResult = await supabase.from('knowledge_document_findings')
      .select('id,document_id,topic,finding,page_from,page_to,confidence,evidence_note,review_status,extracted_at,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(750)

    if (findingResult.error) {
      setLoading(false)
      setMessage(`Evidence queue could not load: ${findingResult.error.message}`)
      return
    }

    const nextFindings = (findingResult.data ?? []) as FindingRow[]
    setFindings(nextFindings)

    const documentIds = [...new Set(nextFindings.map((row) => row.document_id).filter(Boolean))]
    let nextDocuments: DocumentRow[] = []
    if (documentIds.length) {
      const documentResult = await supabase.from('knowledge_technical_documents')
        .select('id,title,document_type,url,storage_bucket,storage_path,item_id,work_id,movement_id,reference_text,verification_status')
        .eq('workspace_id', workspaceId)
        .in('id', documentIds)
      if (documentResult.error) {
        setLoading(false)
        setMessage(`Evidence documents could not load: ${documentResult.error.message}`)
        return
      }
      nextDocuments = (documentResult.data ?? []) as DocumentRow[]
    }
    setDocuments(new Map(nextDocuments.map((row) => [row.id, row])))

    const itemIds = [...new Set(nextDocuments.map((row) => row.item_id).filter(Boolean) as string[])]
    const workIds = [...new Set(nextDocuments.map((row) => row.work_id).filter(Boolean) as string[])]
    const movementIds = [...new Set(nextDocuments.map((row) => row.movement_id).filter(Boolean) as string[])]

    const [itemResult, workResult, movementResult, passportResult] = await Promise.all([
      itemIds.length ? supabase.from('items').select('id,item_number,title').eq('workspace_id', workspaceId).in('id', itemIds) : Promise.resolve({ data: [], error: null }),
      workIds.length ? supabase.from('work_records').select('id,work_number,title').eq('workspace_id', workspaceId).in('id', workIds) : Promise.resolve({ data: [], error: null }),
      movementIds.length ? supabase.from('knowledge_movements').select('id,maker,calibre').in('id', movementIds) : Promise.resolve({ data: [], error: null }),
      itemIds.length ? supabase.from('passports').select('item_id,movement_identification_status,knowledge_movement_id').eq('workspace_id', workspaceId).in('item_id', itemIds) : Promise.resolve({ data: [], error: null }),
    ])

    const relatedError = itemResult.error ?? workResult.error ?? movementResult.error ?? passportResult.error
    if (relatedError) {
      setLoading(false)
      setMessage(`Evidence context could not load: ${relatedError.message}`)
      return
    }

    const nextItems = (itemResult.data ?? []) as ItemRow[]
    const nextWorks = (workResult.data ?? []) as WorkRow[]
    const nextMovements = (movementResult.data ?? []) as MovementRow[]
    const nextPassports = (passportResult.data ?? []) as PassportRow[]
    setItems(new Map(nextItems.map((row) => [row.id, row])))
    setWorks(new Map(nextWorks.map((row) => [row.id, row])))
    setMovements(new Map(nextMovements.map((row) => [row.id, row])))
    setPassports(new Map(nextPassports.map((row) => [row.item_id, row])))
    setLoading(false)
  }

  useEffect(() => { void load() }, [workspaceId])

  const counts = useMemo(() => ({
    candidate: findings.filter((row) => row.review_status === 'candidate').length,
    accepted: findings.filter((row) => row.review_status === 'accepted').length,
    rejected: findings.filter((row) => row.review_status === 'rejected').length,
  }), [findings])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return findings
      .filter((row) => statusFilter === 'all' || row.review_status === statusFilter)
      .filter((row) => confidenceFilter === 'all' || row.confidence.toLowerCase() === confidenceFilter)
      .filter((row) => {
        if (!needle) return true
        const doc = documents.get(row.document_id)
        const item = doc?.item_id ? items.get(doc.item_id) : null
        const work = doc?.work_id ? works.get(doc.work_id) : null
        const movement = doc?.movement_id ? movements.get(doc.movement_id) : null
        return [row.topic, row.finding, row.evidence_note, row.confidence, doc?.title, doc?.reference_text, item?.title, work?.title, movement?.maker, movement?.calibre]
          .some((value) => String(value ?? '').toLowerCase().includes(needle))
      })
      .sort((a, b) => {
        if (a.review_status === 'candidate' && b.review_status === 'candidate') {
          const confidenceDelta = confidenceRank(b.confidence) - confidenceRank(a.confidence)
          if (confidenceDelta) return confidenceDelta
        }
        return new Date(b.extracted_at || b.created_at).getTime() - new Date(a.extracted_at || a.created_at).getTime()
      })
  }, [findings, documents, items, works, movements, statusFilter, confidenceFilter, query])

  async function setReviewStatus(row: FindingRow, nextStatus: ReviewStatus) {
    if (!workspaceId || busyId) return
    setBusyId(row.id)
    setMessage('')
    const result = await supabase.from('knowledge_document_findings')
      .update({ review_status: nextStatus })
      .eq('workspace_id', workspaceId)
      .eq('id', row.id)
    setBusyId(null)
    if (result.error) {
      setMessage(`Evidence could not be updated: ${result.error.message}`)
      return
    }
    setFindings((current) => current.map((finding) => finding.id === row.id ? { ...finding, review_status: nextStatus } : finding))
    const action = nextStatus === 'accepted' ? 'Accepted' : nextStatus === 'rejected' ? 'Rejected' : 'Returned to review'
    setMessage(`${action}: ${row.topic} · ${pageLabel(row)}.`)
  }

  async function openDocument(document: DocumentRow | undefined) {
    if (!document || openingId) return
    setOpeningId(document.id)
    setMessage('')
    if (document.storage_bucket && document.storage_path) {
      const signed = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 600)
      setOpeningId(null)
      if (signed.error || !signed.data?.signedUrl) {
        setMessage(`Document could not open: ${signed.error?.message ?? 'No signed link returned.'}`)
        return
      }
      window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer')
      return
    }
    setOpeningId(null)
    if (document.url) window.open(document.url, '_blank', 'noopener,noreferrer')
    else setMessage('This evidence record has no source file or external link.')
  }

  return <section className="evidence-review-queue">
    <div className="evidence-review-head">
      <div><p className="eyebrow">EVIDENCE REVIEW</p><h2>Review extracted facts</h2><p className="muted">Approve source facts before Calibre is allowed to reuse them as movement knowledge. Review does not change Passport fields or diagnose a watch.</p></div>
      <div className="evidence-review-stats" aria-label="Evidence review counts">
        <button type="button" className={statusFilter === 'candidate' ? 'active' : ''} onClick={() => setStatusFilter('candidate')}><strong>{counts.candidate}</strong><span>Pending</span></button>
        <button type="button" className={statusFilter === 'accepted' ? 'active' : ''} onClick={() => setStatusFilter('accepted')}><strong>{counts.accepted}</strong><span>Accepted</span></button>
        <button type="button" className={statusFilter === 'rejected' ? 'active' : ''} onClick={() => setStatusFilter('rejected')}><strong>{counts.rejected}</strong><span>Rejected</span></button>
      </div>
    </div>

    <div className="evidence-review-toolbar">
      <label><span>Search evidence</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Fact, topic, watch, calibre, document…" /></label>
      <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="candidate">Pending review</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="all">All evidence</option></select></label>
      <label><span>Confidence</span><select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value as ConfidenceFilter)}><option value="all">All confidence</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
    </div>

    {loading ? <div className="evidence-review-empty"><strong>Loading evidence…</strong></div> : visible.length === 0 ? <div className="evidence-review-empty"><strong>{statusFilter === 'candidate' ? 'Review queue clear.' : 'No matching evidence.'}</strong><p className="muted">{statusFilter === 'candidate' ? 'New PDF findings will appear here after extraction.' : 'Try another status or confidence filter.'}</p></div> : <div className="evidence-review-list">
      {visible.map((row) => {
        const doc = documents.get(row.document_id)
        const item = doc?.item_id ? items.get(doc.item_id) : null
        const work = doc?.work_id ? works.get(doc.work_id) : null
        const movement = doc?.movement_id ? movements.get(doc.movement_id) : null
        const passport = doc?.item_id ? passports.get(doc.item_id) : null
        const promotionReady = row.review_status === 'accepted' && passport?.movement_identification_status === 'confirmed' && Boolean(passport.knowledge_movement_id)
        return <article className={`evidence-review-card status-${row.review_status}`} key={row.id}>
          <div className="evidence-review-card-top"><div><span className={`confidence-chip confidence-${row.confidence.toLowerCase()}`}>{titleCase(row.confidence || 'unknown')}</span><span className={`review-chip review-${row.review_status}`}>{row.review_status === 'candidate' ? 'Needs review' : titleCase(row.review_status)}</span>{promotionReady && <span className="promotion-ready-chip">Ready for movement link</span>}</div><strong>{pageLabel(row)}</strong></div>
          <div className="evidence-review-fact"><small>{row.topic || 'Extracted fact'}</small><h3>{row.finding}</h3>{row.evidence_note && <p>{row.evidence_note}</p>}</div>
          <div className="evidence-review-source">
            <div><span>Source</span><strong>{doc?.title || 'Calibre Library document'}</strong><small>{[doc?.document_type && titleCase(doc.document_type), doc?.verification_status && titleCase(doc.verification_status)].filter(Boolean).join(' · ')}</small></div>
            <div><span>Context</span><strong>{item ? `#${item.item_number} ${item.title}` : movement ? `${movement.maker} ${movement.calibre}`.trim() : 'Library reference'}</strong><small>{work ? `Work #${work.work_number} · ${work.title}` : movement ? 'Movement reference' : 'No Item / Work link'}</small></div>
          </div>
          <div className="evidence-review-actions">
            <button type="button" className="secondary" disabled={openingId === doc?.id} onClick={() => void openDocument(doc)}>{openingId === doc?.id ? 'Opening…' : 'Open source'}</button>
            {item && <a className="evidence-review-link" href={`#/items/${encodeURIComponent(item.id)}`}>Open Item</a>}
            {work && <a className="evidence-review-link" href={`#/work/${encodeURIComponent(work.id)}`}>Open Work</a>}
            <div className="evidence-review-decisions">
              {row.review_status !== 'candidate' && <button type="button" className="secondary" disabled={busyId === row.id} onClick={() => void setReviewStatus(row, 'candidate')}>Return to review</button>}
              {row.review_status !== 'rejected' && <button type="button" className="secondary danger-lite" disabled={busyId === row.id} onClick={() => void setReviewStatus(row, 'rejected')}>Reject</button>}
              {row.review_status !== 'accepted' && <button type="button" disabled={busyId === row.id} onClick={() => void setReviewStatus(row, 'accepted')}>{busyId === row.id ? 'Saving…' : 'Accept evidence'}</button>}
            </div>
          </div>
        </article>
      })}
    </div>}
    {message && <p className="evidence-review-message" role="status" aria-live="polite">{message}</p>}
  </section>
}
