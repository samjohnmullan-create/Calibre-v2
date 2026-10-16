import { useEffect, useMemo, useState } from 'react'
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './lib/supabase'
import ResearchProposalReview from './ResearchProposalReview'
import MarketResearchValues from './MarketResearchValues'
import TechnicalResearchValues from './TechnicalResearchValues'
import IdentificationResearchValues from './IdentificationResearchValues'
import ResearchOutcomePanel from './ResearchOutcomePanel'
import PartsResearchSummary from './PartsResearchSummary'
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
type ResearchScope = 'comprehensive' | 'movement' | 'parts' | 'valuation' | 'identify' | 'history' | 'service'

type ResearchPayload = { finding_count?: number; source_count?: number; summary?: string; error?: string }

const scopes: { key: ResearchScope; label: string; detail: string }[] = [
  { key: 'comprehensive', label: 'Full update', detail: 'Identity, technical data, manuals, parts, faults, history and market.' },
  { key: 'movement', label: 'Technical', detail: 'Movement documents, specifications, service information and current faults.' },
  { key: 'parts', label: 'Parts', detail: 'Part references, compatibility evidence, donors and availability clues.' },
  { key: 'valuation', label: 'Market', detail: 'Sold comparables, asking prices, condition differences and valuation evidence.' },
  { key: 'identify', label: 'Identification', detail: 'Maker, model, references, calibre, date and variant evidence.' },
  { key: 'history', label: 'History', detail: 'Brand and model history, production context, variants, provenance clues and collectability.' },
  { key: 'service', label: 'Service intelligence', detail: 'Known calibre weaknesses, service cautions, common faults, lubrication references and useful bench checks.' },
]

function token() {
  try {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (uuid) return uuid.replaceAll('-', '').slice(0, 8)
  } catch { /* Older WebViews can expose crypto without randomUUID. */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(-8)
}
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
function isFreshActiveRequest(row: ResearchRequest) {
  if (hasCompletedAutonomousResult(row) || !['pending', 'processing'].includes(row.status)) return false
  const requestedAt = Date.parse(row.requested_at)
  return Number.isFinite(requestedAt) && Date.now() - requestedAt < 5 * 60 * 1000
}
function marketSuggestion(row: ResearchRequest | null) {
  const ingestion = row?.requested_scope?.domain_ingestion
  if (!ingestion || typeof ingestion !== 'object') return null
  const market = (ingestion as Record<string, unknown>).market
  return market && typeof market === 'object' ? market as Record<string, unknown> : null
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
    requestQuery = workId ? requestQuery.eq('work_id', workId) : requestQuery.is('work_id', null)

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
  const active = useMemo(() => requests.find(isFreshActiveRequest) ?? null, [requests])
  const retryable = useMemo(() => latest && !hasCompletedAutonomousResult(latest) && ['pending', 'failed'].includes(latest.status) ? latest : null, [latest])
  const stalePending = useMemo(() => latest && latest.status === 'pending' && !hasCompletedAutonomousResult(latest) && !isFreshActiveRequest(latest) ? latest : null, [latest])
  const needsInput = useMemo(() => latest && !hasCompletedAutonomousResult(latest) && latest.status === 'needs_input' ? latest : null, [latest])
  const latestStatus = latest ? (hasCompletedAutonomousResult(latest) ? 'complete' : stalePending ? 'stale' : latest.status) : ''
  const latestFindings = useMemo(() => latest ? findings.filter((row) => row.research_request_id === latest.id) : [], [findings, latest])
  const latestFindingIds = useMemo(() => new Set(latestFindings.map((row) => row.id)), [latestFindings])
  const latestSourceCount = useMemo(() => new Set(links.filter((row) => latestFindingIds.has(row.research_finding_id)).map((row) => row.source_id)).size, [links, latestFindingIds])
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
    setMessage('Research button pressed · creating request…')

    try {
      const requestId = token()
      const question = scopes.find((entry) => entry.key === scope)?.detail ?? scopes[0].detail
      const requestedScope: Record<string, unknown> = {
        token: requestId,
        summary: question,
        source_priority: ['Calibre Knowledge database', 'live web', 'Calibre workshop history'],
        autonomous: true,
        context: workId ? 'work' : 'item',
        handoff_version: 6,
      }

      const insert = await supabase.from('research_requests').insert({
        workspace_id: workspaceId,
        item_id: itemId,
        work_id: workId ?? null,
        request_type: scope,
        requested_scope: requestedScope,
      }).select('id,request_type,status,requested_scope,requested_at,completed_at').single()

      if (insert.error || !insert.data) throw new Error(insert.error?.message ?? 'No research request was returned.')

      let created = insert.data as ResearchRequest
      setRequests((current) => [created, ...current.filter((row) => row.id !== created.id)])
      setMessage(`Research ${requestId} created · attaching available photos…`)

      // Photos improve identification, but they are optional. A media/storage problem must
      // never prevent the request itself from reaching Calibre Research.
      try {
        const mediaResult = await supabase.from('media_assets')
          .select('category,caption,original_filename,storage_path,is_cover')
          .eq('workspace_id', workspaceId)
          .eq('item_id', itemId)
          .not('storage_path', 'is', null)
          .order('is_cover', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(8)

        if (!mediaResult.error && mediaResult.data?.length) {
          const settled = await Promise.allSettled(mediaResult.data.map(async (photo) => {
            if (!photo.storage_path) return null
            const signed = await supabase.storage.from('calibre-media').createSignedUrl(photo.storage_path, 3600)
            if (signed.error || !signed.data?.signedUrl) return null
            return {
              category: photo.category,
              caption: photo.caption || photo.original_filename,
              is_cover: photo.is_cover,
              url: signed.data.signedUrl,
            }
          }))
          const photos = settled
            .filter((result): result is PromiseFulfilledResult<NonNullable<unknown>> => result.status === 'fulfilled' && Boolean(result.value))
            .map((result) => result.value)

          if (photos.length) {
            const enrichedScope = { ...requestedScope, photos, photo_count: photos.length }
            const scopeUpdate = await supabase.from('research_requests')
              .update({ requested_scope: enrichedScope })
              .eq('workspace_id', workspaceId)
              .eq('id', created.id)
              .select('id,request_type,status,requested_scope,requested_at,completed_at')
              .maybeSingle()
            if (!scopeUpdate.error && scopeUpdate.data) {
              created = scopeUpdate.data as ResearchRequest
              setRequests((current) => current.map((row) => row.id === created.id ? created : row))
            }
          }
        }
      } catch {
        // Best-effort only. The Edge Function reads canonical Item/Passport/Work data itself.
      }

      setBusy(false)
      await invokeResearch(created)
    } catch (error) {
      setBusy(false)
      const reason = error instanceof Error ? error.message : 'Research request could not be created.'
      setMessage(`Research could not start: ${reason}`)
    }
  }

  const batchHandled = latest ? ['movement', 'identify', 'comprehensive'].includes(latest.request_type) : false

  return <section className="bench-guided-panel bench-research-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">RESEARCH</p><strong>Autonomous sourced research for this {workId ? 'Work' : 'Item'}</strong></div>{latest && <span>{titleCase(latestStatus)}</span>}</div>
    <p className="bench-guided-help">Choose the kind of decision you need. Calibre gathers sourced evidence first, then presents proposed changes for review instead of silently changing Item data.</p>

    <div className="bench-research-scopes">{scopes.map((entry) => <button type="button" key={entry.key} className={scope === entry.key ? 'selected' : ''} onClick={() => setScope(entry.key)} disabled={busy}><strong>{entry.label}</strong><small>{entry.detail}</small></button>)}</div>
    <div className="bench-guided-actions research-primary-actions">
      <button type="button" className="research-run-button" disabled={busy || Boolean(active)} onClick={() => void createRequest()}>{busy || active ? 'Researching…' : 'Run research'}</button>
      {retryable && !busy && <button type="button" className="secondary" onClick={() => void invokeResearch(retryable)}>Retry research</button>}
      {active && !busy && <button type="button" className="secondary" onClick={() => void load()}>Refresh status</button>}
    </div>
    {stalePending && <p className="bench-guided-message">The previous request stopped before it started processing. It no longer blocks new research. Retry it or run a fresh request.</p>}
    {needsInput && <p className="bench-guided-message">This request is waiting for more evidence or confirmation. It is not still running. Review the research gaps below or run a new request after adding the missing evidence.</p>}

    {latest && <div className="bench-research-latest"><span>Latest</span><strong>{requestToken(latest) || titleCase(latest.request_type)}</strong><small>{new Date(latest.requested_at).toLocaleString('en-AU')} · {titleCase(latest.request_type)} · {titleCase(latestStatus)}</small></div>}

    {latest && latestStatus === 'complete' && <ResearchOutcomePanel request={latest} findings={latestFindings} sourceCount={latestSourceCount} />}

    {latest && latest.request_type === 'movement' && latestStatus === 'complete' && <TechnicalResearchValues
      workspaceId={workspaceId}
      itemId={itemId}
      workId={workId}
      requestId={latest.id}
      findings={latestFindings}
      onChanged={async () => { await load(); await onChanged?.() }}
    />}

    {latest && ['identify', 'comprehensive'].includes(latest.request_type) && latestStatus === 'complete' && <IdentificationResearchValues
      workspaceId={workspaceId}
      itemId={itemId}
      requestId={latest.id}
      findings={latestFindings}
      onChanged={async () => { await load(); await onChanged?.() }}
    />}

    {latest && latest.request_type === 'parts' && latestStatus === 'complete' && <PartsResearchSummary request={latest} findings={latestFindings} />}

    {latest && latest.request_type === 'valuation' && latestStatus === 'complete' && <MarketResearchValues
      workspaceId={workspaceId}
      itemId={itemId}
      requestId={latest.id}
      suggested={marketSuggestion(latest)}
      onChanged={onChanged}
    />}

    {latestFindings.length > 0 && <div className="bench-research-results">
      <div className="bench-guided-heading"><div><p className="eyebrow">EVIDENCE</p><strong>{latestFindings.length} sourced finding{latestFindings.length === 1 ? '' : 's'} behind this research outcome</strong></div></div>
      {latestFindings.map((finding) => {
        const findingSources = (sourceIdsByFinding.get(finding.id) ?? []).map((id) => sourceById.get(id)).filter(Boolean) as Source[]
        return <article key={finding.id} className="bench-research-finding">
          <div className="bench-research-finding-head"><div><span>{titleCase(finding.category)}</span><strong>{finding.finding}</strong></div><span className={`status-pill status-${finding.confidence}`}>{titleCase(finding.confidence)}</span></div>
          {finding.evidence_note && <p>{finding.evidence_note}</p>}
          {finding.proposed_destination && finding.proposed_field && <div className="bench-research-proposal"><span>PROPOSED UPDATE</span><strong>{titleCase(finding.proposed_destination)} · {titleCase(finding.proposed_field)}</strong><small>{typeof finding.proposed_value === 'object' ? JSON.stringify(finding.proposed_value) : String(finding.proposed_value ?? '')}</small><em>{titleCase(finding.proposal_status)}</em></div>}
          {!batchHandled && finding.proposed_destination && finding.proposed_field && <ResearchProposalReview
            finding={finding}
            workspaceId={workspaceId}
            itemId={itemId}
            onChanged={async () => { await load(); await onChanged?.() }}
          />}
          {findingSources.length > 0 && <div className="bench-research-sources">{findingSources.map((source) => source.url ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><small>{source.publisher || titleCase(source.source_type)} · {titleCase(source.reliability)}</small></a> : <div key={source.id}><strong>{source.title}</strong><small>{source.publisher || titleCase(source.source_type)} · {titleCase(source.reliability)}</small></div>)}</div>}
        </article>
      })}
    </div>}

    {message && <p className="bench-guided-message" role="status" aria-live="polite">{message}</p>}
  </section>
}
