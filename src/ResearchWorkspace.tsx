import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type Destination = 'item' | 'identity' | 'passport' | 'commerce' | 'work'
type ProposalStatus = 'none' | 'pending' | 'applied' | 'kept' | 'ignored'

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
  proposed_destination: Destination | null
  proposed_field: string | null
  proposed_value: unknown
  proposal_status: ProposalStatus
  applied_at: string | null
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

type LiveContext = {
  item: Record<string, unknown> | null
  identity: Record<string, unknown> | null
  passport: Record<string, unknown> | null
}

const requestTypes = ['comprehensive', 'identify', 'history', 'movement', 'parts', 'valuation', 'listing', 'other']
const requestStatuses = ['pending', 'processing', 'needs_input', 'complete', 'cancelled', 'failed']
const findingFields = 'id,research_request_id,category,finding,confidence,decision,evidence_note,accepted_at,created_at,proposed_destination,proposed_field,proposed_value,proposal_status,applied_at'

const allowedFields: Record<'item' | 'identity' | 'passport', Set<string>> = {
  item: new Set(['title', 'type', 'purpose', 'status', 'notes']),
  identity: new Set(['maker', 'model', 'reference', 'serial', 'year_from', 'year_to', 'era', 'country', 'materials', 'dimensions_text', 'dial_markings', 'case_markings', 'movement_markings', 'notes']),
  passport: new Set(['movement_maker', 'calibre', 'calibre_family', 'jewels', 'beat_rate', 'power_reserve_hours', 'escapement', 'movement_diameter_mm', 'movement_type', 'setting_system', 'complications', 'case_material', 'case_style', 'caseback_type', 'crystal_type', 'crown_type', 'lug_width_mm', 'width_mm', 'height_mm', 'thickness_mm', 'water_resistance_marking', 'hallmarks', 'provenance_summary', 'technical_notes']),
}

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
  const handoff = request.requested_scope.handoff
  return typeof handoff === 'string' ? handoff : ''
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Blank / unverified'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Blank / unverified'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function ResearchWorkspace({ workspaceId, itemId }: Props) {
  const [requests, setRequests] = useState<ResearchRequest[]>([])
  const [findings, setFindings] = useState<ResearchFinding[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [links, setLinks] = useState<FindingSource[]>([])
  const [live, setLive] = useState<LiveContext>({ item: null, identity: null, passport: null })
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [requestType, setRequestType] = useState('comprehensive')
  const [requestScope, setRequestScope] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')
    const [requestResult, findingResult, sourceResult, itemResult, identityResult, passportResult] = await Promise.all([
      supabase.from('research_requests')
        .select('id,request_type,status,requested_scope,requested_at,completed_at')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .order('requested_at', { ascending: false }),
      supabase.from('research_findings')
        .select(findingFields)
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .order('created_at', { ascending: false }),
      supabase.from('sources')
        .select('id,source_type,title,publisher,url,reference_text,reliability,notes')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase.from('items').select('*').eq('workspace_id', workspaceId).eq('id', itemId).maybeSingle(),
      supabase.from('item_identity').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('passports').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
    ])

    const firstError = requestResult.error ?? findingResult.error ?? sourceResult.error ?? itemResult.error ?? identityResult.error ?? passportResult.error
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
    setLive({
      item: itemResult.data as Record<string, unknown> | null,
      identity: identityResult.data as Record<string, unknown> | null,
      passport: passportResult.data as Record<string, unknown> | null,
    })
    setSelectedRequestId((current) => current || nextRequests[0]?.id || '')

    if (nextFindings.length) {
      const { data: linkData, error: linkError } = await supabase.from('research_finding_sources')
        .select('research_finding_id,source_id')
        .eq('workspace_id', workspaceId)
        .in('research_finding_id', nextFindings.map((finding) => finding.id))
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
      'For any finding that safely maps to one canonical Item, Identity or Passport field, also set proposed_destination, proposed_field and proposed_value. If a finding is compound, contradictory, speculative, or unsafe to promote, leave the proposal fields unset.',
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
      handoff_version: 2,
    }

    const { data, error } = await supabase.from('research_requests')
      .insert({ workspace_id: workspaceId, item_id: itemId, request_type: requestType, requested_scope: requestedScope })
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
    const proposal_status = decision === 'accepted' && finding.proposed_destination && finding.proposed_field && finding.proposal_status === 'none'
      ? 'pending'
      : finding.proposal_status
    const { data, error } = await supabase.from('research_findings')
      .update({ decision, accepted_at: decision === 'accepted' ? new Date().toISOString() : null, proposal_status })
      .eq('workspace_id', workspaceId)
      .eq('id', finding.id)
      .select(findingFields)
      .single()
    setBusy(false)
    if (error || !data) {
      setMessage(`Could not update finding: ${error?.message ?? 'No record returned.'}`)
      return
    }
    setFindings((current) => current.map((row) => row.id === finding.id ? data as ResearchFinding : row))
    setMessage(decision === 'accepted' && proposal_status === 'pending'
      ? 'Finding accepted. Review the proposed data change before applying it.'
      : `Finding ${decision}. Canonical Item and Passport data were not changed.`)
  }

  function currentValue(finding: ResearchFinding) {
    if (!finding.proposed_destination || !finding.proposed_field) return undefined
    if (finding.proposed_destination === 'item') return live.item?.[finding.proposed_field]
    if (finding.proposed_destination === 'identity') return live.identity?.[finding.proposed_field]
    if (finding.proposed_destination === 'passport') return live.passport?.[finding.proposed_field]
    return undefined
  }

  async function setProposalStatus(finding: ResearchFinding, proposalStatus: ProposalStatus) {
    setBusy(true)
    const patch = { proposal_status: proposalStatus, applied_at: proposalStatus === 'applied' ? new Date().toISOString() : null }
    const { data, error } = await supabase.from('research_findings')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', finding.id)
      .select(findingFields)
      .single()
    setBusy(false)
    if (error || !data) {
      setMessage(`Could not update proposal: ${error?.message ?? 'No record returned.'}`)
      return false
    }
    setFindings((current) => current.map((row) => row.id === finding.id ? data as ResearchFinding : row))
    return true
  }

  async function applyProposal(finding: ResearchFinding) {
    const destination = finding.proposed_destination
    const field = finding.proposed_field
    if (!destination || !field || !['item', 'identity', 'passport'].includes(destination)) {
      setMessage('This finding does not have a supported canonical destination.')
      return
    }
    const supportedDestination = destination as 'item' | 'identity' | 'passport'
    if (!allowedFields[supportedDestination].has(field)) {
      setMessage(`Calibre blocked an unsupported ${titleCase(destination)} field proposal.`)
      return
    }

    setBusy(true)
    const valuePatch = { [field]: finding.proposed_value }
    let error: { message: string } | null = null

    if (supportedDestination === 'item') {
      const result = await supabase.from('items').update(valuePatch).eq('workspace_id', workspaceId).eq('id', itemId)
      error = result.error
    } else if (supportedDestination === 'identity') {
      if (live.identity) {
        const result = await supabase.from('item_identity').update(valuePatch).eq('workspace_id', workspaceId).eq('item_id', itemId)
        error = result.error
      } else {
        const result = await supabase.from('item_identity').insert({ workspace_id: workspaceId, item_id: itemId, ...valuePatch })
        error = result.error
      }
    } else {
      if (live.passport) {
        const result = await supabase.from('passports').update(valuePatch).eq('workspace_id', workspaceId).eq('item_id', itemId)
        error = result.error
      } else {
        const result = await supabase.from('passports').insert({ workspace_id: workspaceId, item_id: itemId, ...valuePatch })
        error = result.error
      }
    }

    if (error) {
      setBusy(false)
      setMessage(`Could not apply proposal: ${error.message}`)
      return
    }

    const applied = await setProposalStatus(finding, 'applied')
    if (!applied) return
    await load()
    setMessage(`${titleCase(destination)} · ${titleCase(field)} updated from the accepted research finding.`)
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
            <p className="muted">Create a tokenised handoff with Item context, Passport data and temporary photo links. Findings return here for review before any canonical data changes.</p>
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
              const hasProposal = Boolean(finding.proposed_destination && finding.proposed_field)
              return (
                <article className={`research-finding decision-${finding.decision}`} key={finding.id}>
                  <div className="research-finding-top">
                    <div><span className="research-category">{finding.category}</span><span className="research-confidence">{titleCase(finding.confidence)}</span></div>
                    <strong>{titleCase(finding.decision)}</strong>
                  </div>
                  <p className="research-finding-text">{finding.finding}</p>
                  {finding.evidence_note && <p className="research-evidence">{finding.evidence_note}</p>}

                  {linkedSources.length > 0 && (
                    <div className="research-source-links">
                      {linkedSources.map((source) => source.url ? (
                        <a key={source.id} className="research-source-link" href={source.url} target="_blank" rel="noreferrer">
                          <span>{source.title}</span><small>{titleCase(source.reliability)} · Open source ↗</small>
                        </a>
                      ) : (
                        <span key={source.id}>{source.title} · {titleCase(source.reliability)}</span>
                      ))}
                    </div>
                  )}

                  {finding.decision === 'accepted' && hasProposal && (
                    <div className={`research-proposal proposal-${finding.proposal_status}`}>
                      <div className="research-proposal-heading">
                        <div><span>PROPOSED UPDATE</span><strong>{titleCase(finding.proposed_destination!)} · {titleCase(finding.proposed_field!)}</strong></div>
                        <em>{titleCase(finding.proposal_status)}</em>
                      </div>
                      <div className="research-proposal-values">
                        <div><span>Current</span><strong>{displayValue(currentValue(finding))}</strong></div>
                        <div><span>Research proposes</span><strong>{displayValue(finding.proposed_value)}</strong></div>
                      </div>
                      {finding.proposal_status === 'pending' && (
                        <div className="research-proposal-actions">
                          <button type="button" disabled={busy} onClick={() => applyProposal(finding)}>Apply to {titleCase(finding.proposed_destination!)}</button>
                          <button type="button" className="secondary" disabled={busy} onClick={() => setProposalStatus(finding, 'kept')}>Keep current</button>
                          <button type="button" className="secondary" disabled={busy} onClick={() => setProposalStatus(finding, 'ignored')}>Ignore</button>
                        </div>
                      )}
                    </div>
                  )}

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
