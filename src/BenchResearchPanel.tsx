import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
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
function autonomousSummary(row: ResearchRequest | null) {
  if (!row || !row.requested_scope.autonomous_research || typeof row.requested_scope.autonomous_research !== 'object') return ''
  const value = (row.requested_scope.autonomous_research as Record<string, unknown>).summary
  return typeof value === 'string' ? value : ''
}

export default function BenchResearchPanel({ workspaceId, itemId, workId, onChanged }: { workspaceId: string; itemId: string; workId: string; onChanged?: () => void | Promise<void> }) {
  const [requests, setRequests] = useState<ResearchRequest[]>([])
  const [findings, setFindings] = useState<ResearchFinding[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [links, setLinks] = useState<FindingSource[]>([])
  const [scope, setScope] = useState<ResearchScope>('comprehensive')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    const requestResult = await supabase.from('research_requests')
      .select('id,request_type,status,requested_scope,requested_at,completed_at')
      .eq('workspace_id', workspaceId).eq('item_id', itemId).eq('work_id', workId)
      .order('requested_at', { ascending: false }).limit(8)
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
  const active = useMemo(() => requests.find((row) => row.requested_scope.autonomous === true && ['pending', 'processing', 'needs_input'].includes(row.status)) ?? null, [requests])
  const latestFindings = useMemo(() => latest ? findings.filter((row) => row.research_request_id === latest.id) : [], [findings, latest])
  const sourceById = useMemo(() => new Map(sources.map((row) => [row.id, row])), [sources])
  const sourceIdsByFinding = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const link of links) map.set(link.research_finding_id, [...(map.get(link.research_finding_id) ?? []), link.source_id])
    return map
  }, [links])

  async function createRequest() {
    if (busy) return
    setBusy(true)
    setMessage('Preparing research context…')

    const [itemResult, identityResult, passportResult, workResult, findingsResult, planResult, partsResult, timingResult, mediaResult] = await Promise.all([
      supabase.from('items').select('item_number,type,purpose,status,title,notes').eq('workspace_id', workspaceId).eq('id', itemId).single(),
      supabase.from('item_identity').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('passports').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('work_records').select('id,work_number,title,type,status,diagnosis,blocker,induction_status,job_plan_status').eq('workspace_id', workspaceId).eq('id', workId).single(),
      supabase.from('work_findings').select('id,finding_type,severity,title,details,status,created_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('created_at', { ascending: true }),
      supabase.from('work_plan_actions').select('action_key,label,status,notes,sequence').eq('workspace_id', workspaceId).eq('work_id', workId).order('sequence'),
      supabase.from('work_part_needs').select('part_type,description,status,created_at,updated_at').eq('workspace_id', workspaceId).eq('work_record_id', workId),
      supabase.from('timing_runs').select('checkpoint,bph,rate_seconds_per_day,beat_error_ms,lift_angle_deg,position,duration_seconds,confidence,device,notes,recorded_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('recorded_at', { ascending: false }).limit(40),
      supabase.from('media_assets').select('category,caption,original_filename,storage_path,is_cover').eq('workspace_id', workspaceId).eq('item_id', itemId).order('is_cover', { ascending: false }).order('created_at', { ascending: true }).limit(12),
    ])

    const firstError = itemResult.error ?? identityResult.error ?? passportResult.error ?? workResult.error ?? findingsResult.error ?? planResult.error ?? partsResult.error ?? timingResult.error ?? mediaResult.error
    if (firstError || !itemResult.data || !workResult.data) {
      setBusy(false)
      setMessage(`Research context could not be prepared: ${firstError?.message ?? 'Work context unavailable.'}`)
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
      work_snapshot: workResult.data,
      findings_snapshot: findingsResult.data ?? [],
      job_plan_snapshot: planResult.data ?? [],
      part_needs_snapshot: partsResult.data ?? [],
      timing_snapshot: timingResult.data ?? [],
      photos,
      photo_count: photos.filter((row) => row.url).length,
      autonomous: true,
      handoff_version: 4,
    }

    const insert = await supabase.from('research_requests').insert({ workspace_id: workspaceId, item_id: itemId, work_id: workId, request_type: scope, requested_scope: requestedScope })
      .select('id,request_type,status,requested_scope,requested_at,completed_at').single()
    if (insert.error || !insert.data) {
      setBusy(false)
      setMessage(`Research request could not be created: ${insert.error?.message ?? 'No request returned.'}`)
      return
    }

    setRequests((current) => [insert.data as ResearchRequest, ...current])
    setMessage(`Research ${requestId} is running…`)

    const run = await supabase.functions.invoke('calibre-research', { body: { research_request_id: insert.data.id } })
    setBusy(false)
    await load()
    await onChanged?.()

    if (run.error) {
      setMessage(`Research ${requestId} failed: ${run.error.message}`)
      return
    }
    const payload = run.data as { finding_count?: number; source_count?: number; summary?: string } | null
    setMessage(`Research ${requestId} complete · ${payload?.finding_count ?? 0} findings · ${payload?.source_count ?? 0} sources.`)
  }

  return <section className="bench-guided-panel bench-research-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">RESEARCH</p><strong>Autonomous sourced research for this Work</strong></div>{latest && <span>{titleCase(latest.status)}</span>}</div>
    <p className="bench-guided-help">Calibre checks existing Movement/Knowledge records first, then uses web research for gaps, corroboration and current market or parts evidence. Results are saved as sourced findings and proposals for review — never silently promoted into canonical Item or Passport data.</p>

    <div className="bench-research-scopes">{scopes.map((entry) => <button type="button" key={entry.key} className={scope === entry.key ? 'selected' : ''} onClick={() => setScope(entry.key)} disabled={busy}><strong>{entry.label}</strong><small>{entry.detail}</small></button>)}</div>
    <div className="bench-guided-actions"><button type="button" disabled={busy || Boolean(active)} onClick={() => void createRequest()}>{busy || active ? 'Researching…' : 'Run research'}</button>{active && !busy && <button type="button" className="secondary" onClick={() => void load()}>Refresh status</button>}</div>

    {latest && <div className="bench-research-latest"><span>Latest</span><strong>{requestToken(latest) || titleCase(latest.request_type)}</strong><small>{new Date(latest.requested_at).toLocaleString('en-AU')} · {titleCase(latest.request_type)} · {titleCase(latest.status)}</small>{autonomousSummary(latest) && <p>{autonomousSummary(latest)}</p>}</div>}

    {latestFindings.length > 0 && <div className="bench-research-results">
      <div className="bench-guided-heading"><div><p className="eyebrow">FINDINGS</p><strong>{latestFindings.length} sourced result{latestFindings.length === 1 ? '' : 's'}</strong></div></div>
      {latestFindings.map((finding) => {
        const findingSources = (sourceIdsByFinding.get(finding.id) ?? []).map((id) => sourceById.get(id)).filter(Boolean) as Source[]
        return <article key={finding.id} className="bench-research-finding">
          <div className="bench-research-finding-head"><div><span>{titleCase(finding.category)}</span><strong>{finding.finding}</strong></div><span className={`status-pill status-${finding.confidence}`}>{titleCase(finding.confidence)}</span></div>
          {finding.evidence_note && <p>{finding.evidence_note}</p>}
          {finding.proposed_destination && finding.proposed_field && <div className="bench-research-proposal"><span>PROPOSED UPDATE</span><strong>{titleCase(finding.proposed_destination)} · {titleCase(finding.proposed_field)}</strong><small>{typeof finding.proposed_value === 'object' ? JSON.stringify(finding.proposed_value) : String(finding.proposed_value ?? '')}</small><em>{titleCase(finding.proposal_status)}</em></div>}
          {findingSources.length > 0 && <div className="bench-research-sources">{findingSources.map((source) => source.url ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><small>{source.publisher || titleCase(source.source_type)} · {titleCase(source.reliability)}</small></a> : <div key={source.id}><strong>{source.title}</strong><small>{source.publisher || titleCase(source.source_type)} · {titleCase(source.reliability)}</small></div>)}</div>}
        </article>
      })}
    </div>}

    {message && <p className="bench-guided-message">{message}</p>}
  </section>
}
