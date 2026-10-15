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
function handoffText(row: ResearchRequest | null) { return row && typeof row.requested_scope.handoff === 'string' ? row.requested_scope.handoff : '' }

export default function BenchResearchPanel({ workspaceId, itemId, workId, onChanged }: { workspaceId: string; itemId: string; workId: string; onChanged?: () => void | Promise<void> }) {
  const [requests, setRequests] = useState<ResearchRequest[]>([])
  const [scope, setScope] = useState<ResearchScope>('comprehensive')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    const result = await supabase.from('research_requests')
      .select('id,request_type,status,requested_scope,requested_at,completed_at')
      .eq('workspace_id', workspaceId).eq('item_id', itemId).eq('work_id', workId)
      .order('requested_at', { ascending: false }).limit(8)
    if (result.error) return setMessage(`Research requests could not load: ${result.error.message}`)
    setRequests((result.data ?? []) as ResearchRequest[])
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId])
  const latest = requests[0] ?? null
  const active = useMemo(() => requests.find((row) => ['pending', 'processing', 'needs_input'].includes(row.status)) ?? null, [requests])

  async function createRequest() {
    if (busy) return
    setBusy(true)
    setMessage('Preparing live Work research context…')

    const [itemResult, identityResult, passportResult, workResult, findingsResult, planResult, partsResult, timingResult, mediaResult] = await Promise.all([
      supabase.from('items').select('item_number,type,purpose,status,title,notes').eq('workspace_id', workspaceId).eq('id', itemId).single(),
      supabase.from('item_identity').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('passports').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('work_records').select('id,work_number,title,status,diagnosis,blocker,next_action,induction_status,job_plan_status').eq('workspace_id', workspaceId).eq('id', workId).single(),
      supabase.from('work_findings').select('id,finding_type,severity,title,details,status,created_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('created_at', { ascending: true }),
      supabase.from('work_plan_actions').select('action_key,label,status,notes,sequence').eq('workspace_id', workspaceId).eq('work_id', workId).order('sequence'),
      supabase.from('work_part_needs').select('part_type,description,status,created_at,updated_at').eq('workspace_id', workspaceId).eq('work_record_id', workId),
      supabase.from('timing_runs').select('checkpoint,bph,rate_seconds_per_day,beat_error_ms,lift_angle_deg,position,duration_seconds,confidence,device,notes,recorded_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('recorded_at', { ascending: false }).limit(40),
      supabase.from('media_assets').select('category,caption,original_filename,storage_path,is_cover').eq('workspace_id', workspaceId).eq('item_id', itemId).order('is_cover', { ascending: false }).order('created_at', { ascending: true }).limit(24),
    ])

    const firstError = itemResult.error ?? identityResult.error ?? passportResult.error ?? workResult.error ?? findingsResult.error ?? planResult.error ?? partsResult.error ?? timingResult.error ?? mediaResult.error
    if (firstError || !itemResult.data || !workResult.data) {
      setBusy(false)
      setMessage(`Research context could not be prepared: ${firstError?.message ?? 'Work context unavailable.'}`)
      return
    }

    const photos = await Promise.all((mediaResult.data ?? []).map(async (photo) => {
      const signed = await supabase.storage.from('calibre-media').createSignedUrl(photo.storage_path, 86400)
      return { category: photo.category, caption: photo.caption || photo.original_filename, is_cover: photo.is_cover, url: signed.data?.signedUrl || '' }
    }))

    const requestId = token()
    const previous = latest ? { id: latest.id, token: requestToken(latest), requested_at: latest.requested_at, request_type: latest.request_type } : null
    const sourcePriority = ['Google Drive watchmaking library', 'Calibre Knowledge database', 'live web', 'Calibre workshop history']
    const question = scopes.find((entry) => entry.key === scope)?.detail ?? scopes[0].detail
    const photoLines = photos.filter((row) => row.url).map((row, index) => `${index + 1}. ${titleCase(row.category)} — ${row.caption}\n${row.url}`).join('\n') || 'No temporary photo links available.'

    const handoff = [
      `CALIBRE WORK RESEARCH REQUEST ${requestId}`,
      '',
      `Research scope: ${titleCase(scope)}`,
      `Purpose: ${question}`,
      '',
      'SOURCE PRIORITY',
      '1. Search the connected Google Drive watchmaking books, course material, manuals and PDFs first.',
      '2. Check existing Calibre Knowledge records and previous accepted research.',
      '3. Search the live web for movement manuals, manufacturer documents, technical references, compatible parts, donor evidence and current market evidence that are missing or newer.',
      '4. Compare against Calibre workshop history where relevant.',
      '',
      'RESEARCH RULES',
      '- Treat compatibility as evidence-graded: manufacturer documented, technical reference, same calibre, measured match, successfully fitted, failed fit, or unknown.',
      '- Separate sold comparables from asking prices and explain condition differences.',
      '- For faults, return possible causes and discriminating checks; do not present a hypothesis as a confirmed diagnosis.',
      '- Register useful movement documents, part applications and compatibility evidence for reuse by future Work.',
      '- Compare with the previous research request when present and explicitly identify new, changed and unresolved information.',
      '- Write structured findings and sources back to this Calibre research request. Important Item/Passport/valuation changes must remain reviewable proposals rather than silent canonical edits.',
      '',
      `Item snapshot:\n${JSON.stringify(itemResult.data, null, 2)}`,
      `Identity snapshot:\n${JSON.stringify(identityResult.data ?? {}, null, 2)}`,
      `Passport snapshot:\n${JSON.stringify(passportResult.data ?? {}, null, 2)}`,
      `Work snapshot:\n${JSON.stringify(workResult.data, null, 2)}`,
      `Current findings:\n${JSON.stringify(findingsResult.data ?? [], null, 2)}`,
      `Job plan:\n${JSON.stringify(planResult.data ?? [], null, 2)}`,
      `Part needs:\n${JSON.stringify(partsResult.data ?? [], null, 2)}`,
      `Timing history:\n${JSON.stringify(timingResult.data ?? [], null, 2)}`,
      previous ? `Previous research:\n${JSON.stringify(previous, null, 2)}` : 'Previous research: none for this Work.',
      `Temporary photo links (24h):\n${photoLines}`,
      '',
      `Token: ${requestId}`,
    ].join('\n\n')

    const requestedScope = {
      token: requestId,
      summary: question,
      source_priority: sourcePriority,
      handoff,
      handoff_version: 3,
      previous_request: previous,
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
    }

    const insert = await supabase.from('research_requests').insert({ workspace_id: workspaceId, item_id: itemId, work_id: workId, request_type: scope, requested_scope: requestedScope })
      .select('id,request_type,status,requested_scope,requested_at,completed_at').single()
    setBusy(false)
    if (insert.error || !insert.data) {
      setMessage(`Research request could not be created: ${insert.error?.message ?? 'No request returned.'}`)
      return
    }

    setRequests((current) => [insert.data as ResearchRequest, ...current])
    setMessage(`Research ${requestId} queued with the current Work context.`)
    await onChanged?.()
  }

  async function copyLatest() {
    const text = handoffText(latest)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setMessage(`Research ${requestToken(latest)} copied for ChatGPT.`)
    } catch {
      setMessage('Browser clipboard access was blocked. Open the Research workspace to copy the handoff manually.')
    }
  }

  return <section className="bench-guided-panel bench-research-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">REQUEST RESEARCH</p><strong>Refresh what Calibre knows about this job</strong></div>{latest && <span>{titleCase(latest.status)}</span>}</div>
    <p className="bench-guided-help">Uses the current Work evidence. The research pass checks your Google Drive watchmaking library first, then Calibre Knowledge, the live web and prior workshop history.</p>
    <div className="bench-research-scopes">{scopes.map((entry) => <button type="button" key={entry.key} className={scope === entry.key ? 'selected' : ''} onClick={() => setScope(entry.key)}><strong>{entry.label}</strong><small>{entry.detail}</small></button>)}</div>
    <div className="bench-guided-actions"><button type="button" disabled={busy} onClick={() => void createRequest()}>{busy ? 'Preparing…' : active ? 'Request another update' : 'Request research'}</button>{latest && <button type="button" className="secondary" onClick={() => void copyLatest()}>Copy latest handoff</button>}</div>
    {latest && <div className="bench-research-latest"><span>Latest</span><strong>{requestToken(latest) || titleCase(latest.request_type)}</strong><small>{new Date(latest.requested_at).toLocaleString('en-AU')} · {titleCase(latest.request_type)}</small></div>}
    {message && <p className="bench-guided-message">{message}</p>}
  </section>
}
