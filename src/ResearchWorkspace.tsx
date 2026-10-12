import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type ResearchRequest = {
  id: string
  request_type: string
  status: string
  requested_scope: Record<string, unknown>
  requested_at: string
  completed_at: string | null
}

type ResearchFinding = {
  id: string
  research_request_id: string
  category: string
  finding: string
  confidence: 'confirmed' | 'strong' | 'probable' | 'possible' | 'unknown'
  decision: 'pending' | 'accepted' | 'rejected' | 'superseded'
  evidence_note: string
  accepted_at: string | null
  created_at: string
}

type Source = {
  id: string
  source_type: string
  title: string
  publisher: string
  url: string
  reference_text: string
  reliability: string
  notes: string
}

type FindingSource = {
  research_finding_id: string
  source_id: string
}

type Props = {
  workspaceId: string
  itemId: string
}

const requestTypes = ['comprehensive', 'identify', 'history', 'movement', 'parts', 'valuation', 'listing', 'other']
const requestStatuses = ['pending', 'processing', 'needs_input', 'complete', 'cancelled', 'failed']
const confidences: ResearchFinding['confidence'][] = ['confirmed', 'strong', 'probable', 'possible', 'unknown']
const sourceTypes = ['manufacturer', 'catalogue', 'book', 'website', 'auction', 'sold_comp', 'invoice', 'email', 'document', 'bench_note', 'other']
const reliabilities = ['primary', 'high', 'medium', 'low', 'unknown']

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function ResearchWorkspace({ workspaceId, itemId }: Props) {
  const [requests, setRequests] = useState<ResearchRequest[]>([])
  const [findings, setFindings] = useState<ResearchFinding[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [links, setLinks] = useState<FindingSource[]>([])
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const [requestType, setRequestType] = useState('comprehensive')
  const [requestScope, setRequestScope] = useState('')

  const [category, setCategory] = useState('identity')
  const [findingText, setFindingText] = useState('')
  const [confidence, setConfidence] = useState<ResearchFinding['confidence']>('unknown')
  const [evidenceNote, setEvidenceNote] = useState('')

  const [sourceType, setSourceType] = useState('website')
  const [sourceTitle, setSourceTitle] = useState('')
  const [publisher, setPublisher] = useState('')
  const [url, setUrl] = useState('')
  const [referenceText, setReferenceText] = useState('')
  const [reliability, setReliability] = useState('unknown')
  const [sourceNotes, setSourceNotes] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')
    const [requestResult, findingResult, sourceResult] = await Promise.all([
      supabase.from('research_requests')
        .select('id,request_type,status,requested_scope,requested_at,completed_at')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .order('requested_at', { ascending: false }),
      supabase.from('research_findings')
        .select('id,research_request_id,category,finding,confidence,decision,evidence_note,accepted_at,created_at')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .order('created_at', { ascending: false }),
      supabase.from('sources')
        .select('id,source_type,title,publisher,url,reference_text,reliability,notes')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
    ])

    const firstError = requestResult.error ?? findingResult.error ?? sourceResult.error
    if (firstError) {
      setLoading(false)
      setMessage(`Research failed to load: ${firstError.message}`)
      return
    }

    const nextRequests = (requestResult.data ?? []) as ResearchRequest[]
    const nextFindings = (findingResult.data ?? []) as ResearchFinding[]
    setRequests(nextRequests)
    setFindings(nextFindings)
    setSources((sourceResult.data ?? []) as Source[])
    setSelectedRequestId((current) => current || nextRequests[0]?.id || '')

    if (nextFindings.length) {
      const findingIds = nextFindings.map((finding) => finding.id)
      const { data: linkData, error: linkError } = await supabase.from('research_finding_sources')
        .select('research_finding_id,source_id')
        .eq('workspace_id', workspaceId)
        .in('research_finding_id', findingIds)
      if (linkError) setMessage(`Research loaded, but source links failed: ${linkError.message}`)
      setLinks((linkData ?? []) as FindingSource[])
    } else {
      setLinks([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, itemId])

  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? null
  const selectedFindings = useMemo(
    () => findings.filter((finding) => finding.research_request_id === selectedRequestId),
    [findings, selectedRequestId],
  )

  async function createRequest(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.from('research_requests')
      .insert({
        workspace_id: workspaceId,
        item_id: itemId,
        request_type: requestType,
        requested_scope: requestScope.trim() ? { summary: requestScope.trim() } : {},
      })
      .select('id,request_type,status,requested_scope,requested_at,completed_at')
      .single()
    setBusy(false)
    if (error || !data) {
      setMessage(`Could not create research request: ${error?.message ?? 'No record returned.'}`)
      return
    }
    setRequests((current) => [data as ResearchRequest, ...current])
    setSelectedRequestId(data.id)
    setRequestScope('')
    setMessage('Research request created.')
  }

  async function updateRequestStatus(request: ResearchRequest, status: string) {
    setBusy(true)
    const patch = { status, completed_at: status === 'complete' ? new Date().toISOString() : null }
    const { data, error } = await supabase.from('research_requests')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', request.id)
      .select('id,request_type,status,requested_scope,requested_at,completed_at')
      .single()
    setBusy(false)
    if (error || !data) {
      setMessage(`Could not update research request: ${error?.message ?? 'No record returned.'}`)
      return
    }
    setRequests((current) => current.map((row) => row.id === request.id ? data as ResearchRequest : row))
    setMessage(`Research marked ${titleCase(status)}.`)
  }

  async function createFinding(event: FormEvent) {
    event.preventDefault()
    if (!selectedRequestId || !category.trim() || !findingText.trim()) return
    setBusy(true)
    const { data, error } = await supabase.from('research_findings')
      .insert({
        workspace_id: workspaceId,
        item_id: itemId,
        research_request_id: selectedRequestId,
        category: category.trim(),
        finding: findingText.trim(),
        confidence,
        evidence_note: evidenceNote.trim(),
      })
      .select('id,research_request_id,category,finding,confidence,decision,evidence_note,accepted_at,created_at')
      .single()
    setBusy(false)
    if (error || !data) {
      setMessage(`Could not add finding: ${error?.message ?? 'No record returned.'}`)
      return
    }
    setFindings((current) => [data as ResearchFinding, ...current])
    setFindingText('')
    setEvidenceNote('')
    setConfidence('unknown')
    setMessage('Finding added for review.')
  }

  async function setDecision(finding: ResearchFinding, decision: ResearchFinding['decision']) {
    setBusy(true)
    const { data, error } = await supabase.from('research_findings')
      .update({ decision, accepted_at: decision === 'accepted' ? new Date().toISOString() : null })
      .eq('workspace_id', workspaceId)
      .eq('id', finding.id)
      .select('id,research_request_id,category,finding,confidence,decision,evidence_note,accepted_at,created_at')
      .single()
    setBusy(false)
    if (error || !data) {
      setMessage(`Could not update finding: ${error?.message ?? 'No record returned.'}`)
      return
    }
    setFindings((current) => current.map((row) => row.id === finding.id ? data as ResearchFinding : row))
    setMessage(`Finding ${decision}. No Item or Passport facts were changed automatically.`)
  }

  async function createSource(event: FormEvent) {
    event.preventDefault()
    if (!sourceTitle.trim()) return
    setBusy(true)
    const { data, error } = await supabase.from('sources')
      .insert({
        workspace_id: workspaceId,
        source_type: sourceType,
        title: sourceTitle.trim(),
        publisher: publisher.trim(),
        url: url.trim(),
        reference_text: referenceText.trim(),
        reliability,
        notes: sourceNotes.trim(),
      })
      .select('id,source_type,title,publisher,url,reference_text,reliability,notes')
      .single()
    setBusy(false)
    if (error || !data) {
      setMessage(`Could not add source: ${error?.message ?? 'No record returned.'}`)
      return
    }
    setSources((current) => [data as Source, ...current])
    setSourceTitle('')
    setPublisher('')
    setUrl('')
    setReferenceText('')
    setSourceNotes('')
    setReliability('unknown')
    setMessage('Source added. Attach it to a finding to record the evidence link.')
  }

  async function attachSource(findingId: string, sourceId: string) {
    if (!sourceId) return
    const exists = links.some((link) => link.research_finding_id === findingId && link.source_id === sourceId)
    if (exists) return
    setBusy(true)
    const { error } = await supabase.from('research_finding_sources')
      .insert({ workspace_id: workspaceId, research_finding_id: findingId, source_id: sourceId })
    setBusy(false)
    if (error) {
      setMessage(`Could not attach source: ${error.message}`)
      return
    }
    setLinks((current) => [...current, { research_finding_id: findingId, source_id: sourceId }])
    setMessage('Source linked to finding.')
  }

  if (loading) return <div className="loading-card">Loading research…</div>

  return (
    <div className="research-stack">
      <section className="section-card research-hero">
        <div className="research-heading">
          <div>
            <p className="eyebrow">RESEARCH WORKSPACE</p>
            <h3>Evidence before conclusions</h3>
            <p className="muted">Requests, sources and findings stay reviewable. Accepting a finding does not silently rewrite the Item or Passport.</p>
          </div>
          <span className="research-count">{findings.filter((finding) => finding.decision === 'pending').length} pending</span>
        </div>
        {message && <p className="message research-message">{message}</p>}
      </section>

      <div className="research-columns">
        <section className="section-card">
          <p className="eyebrow">REQUESTS</p>
          <form className="research-form" onSubmit={createRequest}>
            <label>Research type
              <select value={requestType} onChange={(event) => setRequestType(event.target.value)}>
                {requestTypes.map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}
              </select>
            </label>
            <label>Scope / question
              <textarea rows={3} value={requestScope} onChange={(event) => setRequestScope(event.target.value)} placeholder="What are we trying to establish?" />
            </label>
            <button disabled={busy}>Create request</button>
          </form>

          <div className="research-request-list">
            {requests.length === 0 && <p className="muted">No research requests yet.</p>}
            {requests.map((request) => (
              <button key={request.id} type="button" className={`research-request ${selectedRequestId === request.id ? 'selected' : ''}`} onClick={() => setSelectedRequestId(request.id)}>
                <span>{titleCase(request.request_type)}</span>
                <small>{titleCase(request.status)}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="section-card">
          <div className="research-heading compact">
            <div><p className="eyebrow">ACTIVE REQUEST</p><h3>{selectedRequest ? titleCase(selectedRequest.request_type) : 'Select a request'}</h3></div>
            {selectedRequest && (
              <select className="research-status" value={selectedRequest.status} disabled={busy} onChange={(event) => updateRequestStatus(selectedRequest, event.target.value)}>
                {requestStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </select>
            )}
          </div>
          {selectedRequest && typeof selectedRequest.requested_scope?.summary === 'string' && selectedRequest.requested_scope.summary && (
            <p className="research-scope">{selectedRequest.requested_scope.summary}</p>
          )}

          {selectedRequest && (
            <form className="research-form research-finding-form" onSubmit={createFinding}>
              <div className="research-form-grid">
                <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="identity, movement, date…" /></label>
                <label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value as ResearchFinding['confidence'])}>{confidences.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
              </div>
              <label>Finding<textarea rows={3} value={findingText} onChange={(event) => setFindingText(event.target.value)} placeholder="State the claim clearly." /></label>
              <label>Evidence note<textarea rows={2} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Why does the evidence support this?" /></label>
              <button disabled={busy || !findingText.trim()}>Add finding</button>
            </form>
          )}
        </section>
      </div>

      {selectedRequest && (
        <section className="section-card">
          <div className="research-heading compact"><div><p className="eyebrow">FINDINGS</p><h3>Review queue</h3></div><span className="research-count">{selectedFindings.length}</span></div>
          <div className="research-findings">
            {selectedFindings.length === 0 && <p className="muted">No findings recorded for this request yet.</p>}
            {selectedFindings.map((finding) => {
              const linkedSources = links.filter((link) => link.research_finding_id === finding.id).map((link) => sources.find((source) => source.id === link.source_id)).filter(Boolean) as Source[]
              return (
                <article className={`research-finding decision-${finding.decision}`} key={finding.id}>
                  <div className="research-finding-top">
                    <div><span className="research-category">{finding.category}</span><span className="research-confidence">{titleCase(finding.confidence)}</span></div>
                    <strong>{titleCase(finding.decision)}</strong>
                  </div>
                  <p className="research-finding-text">{finding.finding}</p>
                  {finding.evidence_note && <p className="research-evidence">{finding.evidence_note}</p>}
                  <div className="research-source-links">
                    {linkedSources.map((source) => <span key={source.id}>{source.title} · {titleCase(source.reliability)}</span>)}
                    <label>Attach source
                      <select defaultValue="" disabled={busy || sources.length === 0} onChange={(event) => { attachSource(finding.id, event.target.value); event.currentTarget.value = '' }}>
                        <option value="">Choose…</option>
                        {sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="research-decisions">
                    <button type="button" disabled={busy || finding.decision === 'accepted'} onClick={() => setDecision(finding, 'accepted')}>Accept</button>
                    <button type="button" className="secondary" disabled={busy || finding.decision === 'rejected'} onClick={() => setDecision(finding, 'rejected')}>Reject</button>
                    <button type="button" className="secondary" disabled={busy || finding.decision === 'superseded'} onClick={() => setDecision(finding, 'superseded')}>Supersede</button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className="section-card">
        <div className="research-heading compact"><div><p className="eyebrow">SOURCE LIBRARY</p><h3>Add evidence source</h3></div><span className="research-count">{sources.length}</span></div>
        <form className="research-form" onSubmit={createSource}>
          <div className="research-form-grid">
            <label>Source type<select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>{sourceTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label>Reliability<select value={reliability} onChange={(event) => setReliability(event.target.value)}>{reliabilities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label className="span-2">Title<input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /></label>
            <label>Publisher / provider<input value={publisher} onChange={(event) => setPublisher(event.target.value)} /></label>
            <label>URL<input value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" /></label>
            <label className="span-2">Reference / page / document note<input value={referenceText} onChange={(event) => setReferenceText(event.target.value)} /></label>
            <label className="span-2">Source notes<textarea rows={3} value={sourceNotes} onChange={(event) => setSourceNotes(event.target.value)} /></label>
          </div>
          <button disabled={busy || !sourceTitle.trim()}>Add source</button>
        </form>
      </section>
    </div>
  )
}
