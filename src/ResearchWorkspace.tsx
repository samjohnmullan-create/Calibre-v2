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

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function token() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8)
}

function scopeString(scope: Record<string, unknown>, key: string) {
  const value = scope[key]
  return typeof value === 'string' ? value : ''
}

function handoffText(request: ResearchRequest | null) {
  if (!request) return ''
  const scope = request.requested_scope
  const handoff = scope.handoff
  return typeof handoff === 'string' ? handoff : ''
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
      const { data: linkData } = await supabase.from('research_finding_sources')
        .select('research_finding_id,source_id')
        .eq('workspace_id', workspaceId)
        .in('research_finding_id', nextFindings.map((finding) => finding.id))
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
    setMessage('Preparing ChatGPT research package…')

    const [itemResult, identityResult, passportResult, mediaResult] = await Promise.all([
      supabase.from('items')
        .select('item_number,type,purpose,status,title,notes')
        .eq('workspace_id', workspaceId)
        .eq('id', itemId)
        .single(),
      supabase.from('item_identity')
        .select('maker,model,reference,serial,year_from,year_to,era,country,materials,dimensions_text,dial_markings,case_markings,movement_markings,notes')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .maybeSingle(),
      supabase.from('passports')
        .select('movement_maker,calibre,calibre_family,jewels,beat_rate,power_reserve_hours,escapement,movement_diameter_mm,movement_type,setting_system,complications,case_material,case_style,caseback_type,crystal_type,crown_type,lug_width_mm,width_mm,height_mm,thickness_mm,water_resistance_marking,hallmarks,provenance_summary,technical_notes')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .maybeSingle(),
      supabase.from('media_assets')
        .select('category,caption,original_filename,storage_path,is_cover')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .order('is_cover', { ascending: false })
        .order('created_at', { ascending: true }),
    ])

    const contextError = itemResult.error ?? identityResult.error ?? passportResult.error ?? mediaResult.error
    if (contextError || !itemResult.data) {
      setBusy(false)
      setMessage(`Could not prepare research context: ${contextError?.message ?? 'Item not found.'}`)
      return
    }

    const photoRows = mediaResult.data ?? []
    const photos = await Promise.all(photoRows.map(async (photo) => {
      const { data } = await supabase.storage.from('calibre-media').createSignedUrl(photo.storage_path, 86400)
      return {
        category: photo.category,
        caption: photo.caption || photo.original_filename,
        is_cover: photo.is_cover,
        url: data?.signedUrl || '',
      }
    }))

    const requestToken = token()
    const item = itemResult.data
    const identity = identityResult.data ?? {}
    const passport = passportResult.data ?? {}
    const question = requestScope.trim() || 'Comprehensive identification, technical and market research.'
    const photoLines = photos.filter((photo) => photo.url).map((photo, index) => `${index + 1}. ${titleCase(photo.category)} — ${photo.caption}\n${photo.url}`).join('\n') || 'No photos attached.'
    const handoff = [
      `CALIBRE RESEARCH REQUEST ${requestToken}`,
      '',
      `Research type: ${titleCase(requestType)}`,
      `Question / scope: ${question}`,
      '',
      'Use the supplied Calibre context and temporary photo links below. Research this item comprehensively where relevant. Then write structured findings and sources back to the Calibre research request with this token. Do not silently promote findings into Item or Passport facts.',
      '',
      `Item: #${item.item_number} — ${item.title}`,
      `Type: ${item.type} | Purpose: ${item.purpose} | Status: ${item.status}`,
      item.notes ? `Item notes: ${item.notes}` : '',
      '',
      `Identity snapshot:\n${JSON.stringify(identity, null, 2)}`,
      '',
      `Passport snapshot:\n${JSON.stringify(passport, null, 2)}`,
      '',
      `Temporary photo links (valid for 24 hours):\n${photoLines}`,
      '',
      `Token: ${requestToken}`,
    ].filter(Boolean).join('\n')

    const requestedScope = {
      token: requestToken,
      summary: question,
      handoff,
      photo_count: photos.filter((photo) => photo.url).length,
      photos,
      item_snapshot: item,
      identity_snapshot: identity,
      passport_snapshot: passport,
      handoff_version: 1,
    }

    const { data, error } = await supabase.from('research_requests')
      .insert({
        workspace_id: workspaceId,
        item_id: itemId,
        request_type: requestType,
        requested_scope: requestedScope,
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
    setMessage(`Request ${requestToken} ready with ${requestedScope.photo_count} temporary photo link${requestedScope.photo_count === 1 ? '' : 's'}. Copy it into ChatGPT.`)
  }

  async function copyHandoff() {
    const text = handoffText(selectedRequest)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setMessage(`Request ${scopeString(selectedRequest?.requested_scope ?? {}, 'token')} copied. Paste it into ChatGPT.`)
    } catch {
      setMessage('Copy was blocked by the browser. Select the handoff text and copy it manually.')
    }
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
    setMessage(`Finding ${decision}. Item and Passport remain unchanged until explicitly applied.`)
  }

  if (loading) return <div className="loading-card">Loading research…</div>

  const selectedToken = selectedRequest ? scopeString(selectedRequest.requested_scope, 'token') : ''
  const handoff = handoffText(selectedRequest)
  const selectedPhotoCount = selectedRequest && typeof selectedRequest.requested_scope.photo_count === 'number' ? selectedRequest.requested_scope.photo_count : 0

  return (
    <div className="research-stack">
      <section className="section-card research-hero">
        <div className="research-heading">
          <div>
            <p className="eyebrow">CHATGPT RESEARCH HANDOFF</p>
            <h3>Package the Item for research</h3>
            <p className="muted">Create a tokenised handoff with Item context, Passport data and temporary photo links. Copy it into ChatGPT; findings come back into this request for review.</p>
          </div>
          <span className="research-count">{findings.filter((finding) => finding.decision === 'pending').length} pending</span>
        </div>
        {message && <p className="message research-message">{message}</p>}
      </section>

      <div className="research-columns">
        <section className="section-card">
          <p className="eyebrow">CREATE REQUEST</p>
          <form className="research-form" onSubmit={createRequest}>
            <label>Research type
              <select value={requestType} onChange={(event) => setRequestType(event.target.value)}>
                {requestTypes.map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}
              </select>
            </label>
            <label>Question / scope
              <textarea rows={4} value={requestScope} onChange={(event) => setRequestScope(event.target.value)} placeholder="What do you want ChatGPT to establish?" />
            </label>
            <button disabled={busy}>{busy ? 'Preparing…' : 'Create ChatGPT request'}</button>
          </form>

          <div className="research-request-list">
            {requests.length === 0 && <p className="muted">No research requests yet.</p>}
            {requests.map((request) => {
              const requestToken = scopeString(request.requested_scope, 'token')
              return (
                <button key={request.id} type="button" className={`research-request ${selectedRequestId === request.id ? 'selected' : ''}`} onClick={() => setSelectedRequestId(request.id)}>
                  <span>{requestToken || titleCase(request.request_type)}</span>
                  <small>{titleCase(request.status)}</small>
                </button>
              )
            })}
          </div>
        </section>

        <section className="section-card research-handoff-card">
          <div className="research-heading compact">
            <div><p className="eyebrow">COPY TO CHATGPT</p><h3>{selectedToken ? `Request ${selectedToken}` : 'Create a request first'}</h3></div>
            {selectedRequest && (
              <select className="research-status" value={selectedRequest.status} disabled={busy} onChange={(event) => updateRequestStatus(selectedRequest, event.target.value)}>
                {requestStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </select>
            )}
          </div>

          {selectedRequest && (
            <>
              <div className="research-handoff-meta">
                <span>{titleCase(selectedRequest.request_type)}</span>
                <span>{selectedPhotoCount} photo link{selectedPhotoCount === 1 ? '' : 's'}</span>
                <span>24h links</span>
              </div>
              <textarea className="research-handoff-text" readOnly value={handoff} rows={14} />
              <button type="button" onClick={copyHandoff} disabled={!handoff}>Copy for ChatGPT</button>
              <p className="muted research-copy-note">Paste the copied block into this ChatGPT project. The token tells me exactly which Calibre request to update.</p>
            </>
          )}
        </section>
      </div>

      {selectedRequest && (
        <section className="section-card">
          <div className="research-heading compact">
            <div><p className="eyebrow">FINDINGS FROM CHATGPT</p><h3>Review queue</h3></div>
            <span className="research-count">{selectedFindings.length}</span>
          </div>
          <div className="research-findings">
            {selectedFindings.length === 0 && <p className="muted">No findings yet. Copy the request into ChatGPT and ask me to research it.</p>}
            {selectedFindings.map((finding) => {
              const linkedSources = links
                .filter((link) => link.research_finding_id === finding.id)
                .map((link) => sources.find((source) => source.id === link.source_id))
                .filter(Boolean) as Source[]
              return (
                <article className={`research-finding decision-${finding.decision}`} key={finding.id}>
                  <div className="research-finding-top">
                    <div><span className="research-category">{finding.category}</span><span className="research-confidence">{titleCase(finding.confidence)}</span></div>
                    <strong>{titleCase(finding.decision)}</strong>
                  </div>
                  <p className="research-finding-text">{finding.finding}</p>
                  {finding.evidence_note && <p className="research-evidence">{finding.evidence_note}</p>}
                  {linkedSources.length > 0 && <div className="research-source-links">{linkedSources.map((source) => <span key={source.id}>{source.title} · {titleCase(source.reliability)}</span>)}</div>}
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
    </div>
  )
}
