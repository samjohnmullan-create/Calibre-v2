import { useEffect, useMemo, useState } from 'react'
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './lib/supabase'
import ResearchProposalReview from './ResearchProposalReview'
import './bench-guided-job.css'

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
  confidence: string
  evidence_note: string
  decision: string
  proposed_destination: string | null
  proposed_field: string | null
  proposed_value: unknown
  proposal_status: string
  created_at: string
}

type Source = {
  id: string
  source_type: string
  title: string
  publisher: string
  url: string
  reliability: string
  reference_text: string
}

type FindingSource = { research_finding_id: string; source_id: string }
type ResearchScope = 'comprehensive' | 'movement' | 'parts' | 'valuation' | 'identify'

type ResearchPayload = { finding_count?: number; source_count?: number; summary?: string; error?: string }

const scopes: { key: ResearchScope; label: string; detail: string }[] = [
  { key: 'comprehensive', label: 'Full update', detail: 'Identity, technical data, manuals, parts, faults, history and market.' },
  { key: 'movement', label: 'Technical', detail: 'Movement documents, specifications, service information and current faults.' },
  { key: 'parts', label: 'Parts', detail: 'Part references, compatibility evidence, donors and availability clues.' },
  { key: 'valuation', label: 'Market', detail: 'Sold comparables, asking prices, condition differences and valuation evidence.' },
  { key: 'identify', label: 'Identification', detail: 'Maker, model, references, calibre, date and variant evidence.' },
]

function token() { return crypto.randomUUID().replaceAll('-', '').slice(0, 8) }
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function requestToken(row: ResearchRequest | null) { return row && typeof row.requested_scope.token === 'string' ? row.requested_scope.token : '' }
function autonomousResult(row: ResearchRequest | null) {
  if (!row || !row.requested_scope.autonomous_research || typeof row.requested_scope.autonomous_research !== 'object') return null
  return row.requested_scope.autonomous_research as Record<string, unknown>
}
function autonomousSummary(row: ResearchRequest | null) {
  const result = autonomousResult(row)
  const value = result?.summary
  return typeof value === 'string' ? value : ''
}
function hasCompletedAutonomousResult(row: ResearchRequest | null) {
  const result = autonomousResult(row)
  return typeof result?.completed_at === 'string' && Boolean(result.completed_at)
}

export default function BenchResearchPanel({ workspaceId, itemId, workId, onChanged }: { workspaceId: string; itemId: string; workId?: string | null; onChanged?: () => void | Promise<void> }) {
  const [requests, setRequests] = useState<ResearchRequest[]>([])
  const [findings, setFindings] = useState<ResearchFinding[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [links, setLinks] = useState<FindingSource[]>([])
  const [scope, setScope] = useState<ResearchScope>('comprehensive')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    let requestQuery = supabase.from('research_requests')
      .select('id,request_type,status,requested_scope,requested_at,completed_at')
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
    if (workId) requestQuery = requestQuery.eq('work_id', workId)

    const requestResult = await requestQuery.order('requested_at', { ascending: false }).limit(8)
    if (requestResult.error) return setMessage(`Research requests could not load: ${requestResult.error.message}`)

    const nextRequests = (requestResult.data ?? []) as ResearchRequest[]
    setRequests(nextRequests)
    if (!nextRequests.length) { setFindings([]); setSources([]); setLinks([]); return }

    const requestIds = nextRequests.map((row) => row.id)
    const findingResult = await supabase.from('research_findings')
      .select('id,research_request_id,category,finding,confidence,evidence_note,decision,proposed_destination,proposed_field,proposed_value,proposal_status,created_at')
      .eq('workspace_id', workspaceId).in('research_request_id', requestIds)
      .order('created_at', { ascending: false })
    if (findingResult.error) return setMessage(`Research findings could not load: ${findingResult.error.message}`)

    const nextFindings = (findingResult.data ?? []) as ResearchFinding[]
    setFindings(nextFindings)
    if (!nextFindings.length) { setSources([]); setLinks([]); return }

    const linkResult = await supabase.from('research_finding_sources')
      .select('research_finding_id,source_id')
      .eq('workspace_id', workspaceId).in('research_finding_id', nextFindings.map((row) => row.id))
    if (linkResult.error) return setMessage(`Research source links could not load: ${linkResult.error.message}`)
    const nextLinks = (linkResult.data ?? []) as FindingSource[]
    setLinks(nextLinks)

    const sourceIds = [...new Set(nextLinks.map((row) => row.source_id))]
    if (!sourceIds.length) { setSources([]); return }
    const sourceResult = await supabase.from('sources')
      .select('id,source_type,title,publisher,url,reliability,reference_text')
      .eq('workspace_id', workspaceId).in('id', sourceIds)
    if (sourceResult.error) return setMessage(`Research sources could not load: ${sourceResult.error.message}`)
    setSources((sourceResult.data ?? []) as Source[])
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId])
  const latest = requests[0] ?? null
  const active = useMemo(() => requests.find((row) => row.requested_scope.autonomous === true && !hasCompletedAutonomousResult(row) && ['pending', 'processing'].includes(row.status)) ?? null, [requests])
  const retryable = useMemo(() => latest && !hasCompletedAutonomousResult(latest) && ['pending', 'failed'].includes(latest.status) ? latest : null, [latest])
  const needsInput = useMemo(() => latest && !hasCompletedAutonomousResult(latest) && latest.status === 'needs_input' ? latest : null, [latest])
  const latestStatus = latest ? (hasCompletedAutonomousResult(latest) ? 'complete' : latest.status) : ''
  const latestFindings = useMemo(() => latest ? findings.filter((row) => row.research_request_id === latest.id) : [], [findings, latest])
  const sourceById = useMemo(() => new Map(sources.map((row) => [row.id, row])), [sources])
  const sourceIdsByFinding = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const link of links) map.set(link.research_finding_id, [...(map.get(link.research_finding_id) ?? []), link.source_id])
    return map
  }, [links])

  async function invokeResearch(request: ResearchRequest) {
    const label = requestToken(request) || request.id.slice(0, 8)
    setBusy(true)
    setMessage(`Research ${label} is running…`)

    try {
      const sessionResult = await supabase.auth.getSession()
      const accessToken = sessionResult.data.session?.access_token
      if (!accessToken) throw new Error('Your Calibre session has expired. Sign in again and retry.')

      const response = await fetch(`${SUPABASE_URL}/functions/v1/calibre-research`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ research_request_id: request.id }),
      })

      let payload: ResearchPayload | null = null
      try { payload = await response.json() as ResearchPayload } catch { payload = null }
      if (!response.ok) throw new Error(payload?.error || `Research service returned ${response.status}.`)

      setMessage(`Research ${label} complete · ${payload?.finding_count ?? 0} findings · ${payload?.source_count ?? 0} sources.`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Research request could not be sent.'
      await supabase.from('research_requests').update({ status: 'failed' }).eq('workspace_id', workspaceId).eq('id', request.id)
      setMessage(`Research ${label} failed: ${reason}. You can retry this request.`)
    } finally {
      setBusy(false)
      await load()
      await onChanged?.()
    }
  }

  async function createRequest() {
    if (busy) return
    setBusy(true)
    setMessage('Preparing research context…')

    const [itemResult, identityResult, passportResult, mediaResult] = await Promise.all([
      supabase.from('items').select('item_number,type,purpose,status,title,notes').eq('workspace_id', workspaceId).eq('id', itemId).single(),
      supabase.from('item_identity').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('passports').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('media_assets').select('category,caption,original_filename,storage_path,is_cover').eq('workspace_id', workspaceId).eq('item_id', itemId).order('is_cover', { ascending: false }).order('created_at', { ascending: true }).limit(12),
    ])

    let workSnapshot: Record<string, unknown> | null = null
    let findingsSnapshot: unknown[] = []
    let planSnapshot: unknown[] = []
    let partNeedsSnapshot: unknown[] = []
    let timingSnapshot: unknown[] = []
    let workError: { message: string } | null = null

    if (workId) {
      const [workResult, findingsResult, planResult, partsResult, timingResult] = await Promise.all([
        supabase.from('work_records').select('id,work_number,title,type,status,diagnosis,blocker,induction_status,job_plan_status').eq('workspace_id', workspaceId).eq('id', workId).single(),
        supabase.from('work_findings').select('id,finding_type,severity,title,details,status,created_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('created_at', { ascending: true }),
        supabase.from('work_plan_actions').select('action_key,label,status,notes,sequence').eq('workspace_id', workspaceId).eq('work_id', workId).order('sequence'),
        supabase.from('work_part_needs').select('part_type,description,status,created_at,updated_at').eq('workspace_id', workspaceId).eq('work_record_id', workId),
        supabase.from('timing_runs').select('checkpoint,bph,rate_seconds_per_day,beat_error_ms,lift_angle_deg,position,duration_seconds,confidence,device,notes,recorded_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('recorded_at', { ascending: false }).limit(40),
      ])
      workError = workResult.error ?? findingsResult.error ?? planResult.error ?? partsResult.error ?? timingResult.error
      workSnapshot = (workResult.data ?? null) as Record<string, unknown> | null
      findingsSnapshot = findingsResult.data ?? []
      planSnapshot = planResult.data ?? []
      partNeedsSnapshot = partsResult.data ?? []
      timingSnapshot = timingResult.data ?? []
    }

    const firstError = itemResult.error ?? identityResult.error ?? passportResult.error ?? mediaResult.error ?? workError
    if (firstError || !itemResult.data) {
      setBusy(false)
      setMessage(`Research context could not be prepared: ${firstError?.message ?? 'Item context unavailable.'}`)
      return
    }

    const photos = await Promise.all((mediaResult.data ?? []).map(async (photo) => {
      const signed = await supabase.storage.from('calibre-media').createSignedUrl(photo.storage_path, 3600)
      return { category: photo.category, caption: photo.caption || photo.original_filename, is_cover: photo.is_cover, url: signed.data?.signedUrl || '' }
    }))

    const requestId = token()
    const question = scopes.find((entry) => entry.key === scope)?.detail ?? scopes[0].detail
    const requestedScope = {
      token: requestId,
      summary: question,
      source_priority: ['Calibre Knowledge database', 'live web', 'Calibre workshop history'],
      item_snapshot: itemResult.data,
      identity_snapshot: identityResult.data ?? {},
      passport_snapshot: passportResult.data ?? {},
      work_snapshot: workSnapshot ?? {},
      findings_snapshot: findingsSnapshot,
      job_plan_snapshot: planSnapshot,
      part_needs_snapshot: partNeedsSnapshot,
      timing_snapshot: timingSnapshot,
      photos,
      photo_count: photos.filter((row) => row.url).length,
      autonomous: true,
      context: workId ? 'work' : 'item',
      handoff_version: 4,
    }

    const insert = await supabase.from('research_requests').insert({ workspace_id: workspaceId, item_id: itemId, work_id: workId ?? null, request_type: scope, requested_scope: requestedScope })
      .select('id,request_type,status,requested_scope,requested_at,completed_at').single()
    if (insert.error || !insert.data) {
      setBusy(false)
      setMessage(`Research request could not be created: ${insert.error?.message ?? 'No request returned.'}`)
      return
    }

    const created = insert.data as ResearchRequest
    setRequests((current) => [created, ...current])
    setBusy(false)
    await invokeResearch(created)
  }

  return <section className="bench-guided-panel bench-research-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">RESEARCH</p><strong>Autonomous sourced research for this {workId ? 'Work' : 'Item'}</strong></div>{latest && <span>{titleCase(latestStatus)}</span>}</div>
    <p className="bench-guided-help">Calibre checks existing Movement/Knowledge records first, then uses web research for gaps, corroboration and current market or parts evidence. Results are saved as sourced findings and proposals for review — never silently promoted into canonical Item or Passport data.</p>

    <div className="bench-research-scopes">{scopes.map((entry) => <button type="button" key={entry.key} className={scope === entry.key ? 'selected' : ''} onClick={() => setScope(entry.key)} disabled={busy}><strong>{entry.label}</strong><small>{entry.detail}</small></button>)}</div>
    <div className="bench-guided-actions">
      <button type="button" disabled={busy || Boolean(active)} onClick={() => void createRequest()}>{busy || active ? 'Researching…' : 'Run research'}</button>
      {retryable && !busy && <button type="button" className="secondary" onClick={() => void invokeResearch(retryable)}>Retry research</button>}
      {active && !busy && <button type="button" className="secondary" onClick={() => void load()}>Refresh status</button>}
    </div>
    {needsInput && <p className="bench-guided-message">This request is waiting for more evidence or confirmation. It is not still running. Review the findings below or run a new research request.</p>}

    {latest && <div className="bench-research-latest"><span>Latest</span><strong>{requestToken(latest) || titleCase(latest.request_type)}</strong><small>{new Date(latest.requested_at).toLocaleString('en-AU')} · {titleCase(latest.request_type)} · {titleCase(latestStatus)}</small>{autonomousSummary(latest) && <p>{autonomousSummary(latest)}</p>}</div>}

    {latestFindings.length > 0 && <div className="bench-research-results">
      <div className="bench-guided-heading"><div><p className="eyebrow">FINDINGS</p><strong>{latestFindings.length} sourced result{latestFindings.length === 1 ? '' : 's'} · review each proposed detail before it becomes Item data</strong></div></div>
      {latestFindings.map((finding) => {
        const findingSources = (sourceIdsByFinding.get(finding.id) ?? []).map((id) => sourceById.get(id)).filter(Boolean) as Source[]
        return <article key={finding.id} className="bench-research-finding">
          <div className="bench-research-finding-head"><div><span>{titleCase(finding.category)}</span><strong>{finding.finding}</strong></div><span className={`status-pill status-${finding.confidence}`}>{titleCase(finding.confidence)}</span></div>
          {finding.evidence_note && <p>{finding.evidence_note}</p>}
          {finding.proposed_destination && finding.proposed_field && <>
            <div className="bench-research-proposal"><span>PROPOSED UPDATE</span><strong>{titleCase(finding.proposed_destination)} · {titleCase(finding.proposed_field)}</strong><small>{typeof finding.proposed_value === 'object' ? JSON.stringify(finding.proposed_value) : String(finding.proposed_value ?? '')}</small><em>{titleCase(finding.proposal_status)}</em></div>
            <ResearchProposalReview
              finding={finding}
              workspaceId={workspaceId}
              itemId={itemId}
              onChanged={async () => { await load(); await onChanged?.() }}
            />
          </>}
          {findingSources.length > 0 && <div className="bench-research-sources">{findingSources.map((source) => source.url ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><small>{source.publisher || titleCase(source.source_type)} · {titleCase(source.reliability)}</small></a> : <div key={source.id}><strong>{source.title}</strong><small>{source.publisher || titleCase(source.source_type)} · {titleCase(source.reliability)}</small></div>)}</div>}
        </article>
      })}
    </div>}

    {message && <p className="bench-guided-message">{message}</p>}
  </section>
}
