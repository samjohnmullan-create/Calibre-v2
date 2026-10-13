import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type WorkRow = { id: string; item_id: string; work_number: number; title: string; status: string; waiting_reason: string | null; next_action: string; blocker: string }
type ItemRow = { id: string; item_number: number; title: string }
type NeedRow = { id: string; work_record_id: string; item_id: string; part_type: string; description: string; status: string }
type Candidate = {
  candidate_kind: 'owned_part' | 'donor_item'
  candidate_id: string
  donor_item_id: string | null
  label: string
  detail: string | null
  part_type: string
  quantity: number
  condition: string
  evidence_tier: 'confirmed' | 'documented' | 'candidate' | 'family_lead' | 'unverified'
  evidence_label: string
  score: number
  modification_required: boolean
  donor_value: number | null
  donor_currency: string | null
  economic_note: string
  reasons: string[]
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

function tierLabel(value: Candidate['evidence_tier']) {
  return value === 'family_lead' ? 'Family lead only' : titleCase(value)
}

export default function WorkbenchPartsDesk() {
  const [visible, setVisible] = useState(() => window.location.hash.startsWith('#/workbench'))
  const [workspaceId, setWorkspaceId] = useState('')
  const [work, setWork] = useState<WorkRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [needs, setNeeds] = useState<NeedRow[]>([])
  const [selectedWorkId, setSelectedWorkId] = useState('')
  const [partType, setPartType] = useState('')
  const [description, setDescription] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Choose a Work record to record a part need and check owned stock.')

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selectedWork = work.find((record) => record.id === selectedWorkId) ?? null
  const selectedNeed = needs.find((need) => need.work_record_id === selectedWorkId && need.status === 'open') ?? null

  useEffect(() => {
    const sync = () => setVisible(window.location.hash.startsWith('#/workbench'))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!visible) return
    let active = true
    ;(async () => {
      const { data, error } = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active) return
      if (error || !data) {
        setMessage(`Parts Desk unavailable: ${error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(data.id)
    })()
    return () => { active = false }
  }, [visible])

  async function load() {
    if (!workspaceId) return
    const [workResult, itemResult, needsResult] = await Promise.all([
      supabase.from('work_records').select('id,item_id,work_number,title,status,waiting_reason,next_action,blocker').eq('workspace_id', workspaceId).not('status', 'in', '(complete,cancelled)').order('priority', { ascending: false }).order('work_number', { ascending: true }),
      supabase.from('items').select('id,item_number,title').eq('workspace_id', workspaceId).is('archived_at', null),
      supabase.from('work_part_needs').select('id,work_record_id,item_id,part_type,description,status').eq('workspace_id', workspaceId).in('status', ['open', 'reserved']),
    ])
    const error = workResult.error ?? itemResult.error ?? needsResult.error
    if (error) {
      setMessage(`Parts Desk failed to load: ${error.message}`)
      return
    }
    setWork((workResult.data ?? []) as WorkRow[])
    setItems((itemResult.data ?? []) as ItemRow[])
    setNeeds((needsResult.data ?? []) as NeedRow[])
  }

  useEffect(() => { if (visible && workspaceId) void load() }, [visible, workspaceId])

  useEffect(() => {
    if (!selectedWorkId) {
      setPartType('')
      setDescription('')
      setResults([])
      return
    }
    const need = needs.find((row) => row.work_record_id === selectedWorkId && row.status === 'open')
    setPartType(need?.part_type ?? '')
    setDescription(need?.description ?? '')
    setResults([])
  }, [selectedWorkId, needs])

  async function recordNeedAndCheck(event: FormEvent) {
    event.preventDefault()
    if (!workspaceId || !selectedWork || !partType.trim()) return
    setBusy(true)
    setResults([])
    setMessage('Recording part need…')

    const cleanPartType = partType.trim()
    const cleanDescription = description.trim()
    const blockerSummary = cleanDescription ? `${cleanPartType} · ${cleanDescription}` : cleanPartType
    const nextAction = selectedWork.next_action.trim() || `Source ${cleanPartType}`

    const workUpdate = await supabase.from('work_records')
      .update({ status: 'waiting', waiting_reason: 'parts', blocker: blockerSummary, next_action: nextAction })
      .eq('workspace_id', workspaceId)
      .eq('id', selectedWork.id)

    if (workUpdate.error) {
      setBusy(false)
      setMessage(`Could not mark Work #${selectedWork.work_number} as waiting for parts: ${workUpdate.error.message}`)
      return
    }

    const needPayload = {
      workspace_id: workspaceId,
      work_record_id: selectedWork.id,
      item_id: selectedWork.item_id,
      part_type: cleanPartType,
      description: cleanDescription,
      status: 'open',
      updated_at: new Date().toISOString(),
    }

    const needResult = selectedNeed
      ? await supabase.from('work_part_needs').update(needPayload).eq('workspace_id', workspaceId).eq('id', selectedNeed.id)
      : await supabase.from('work_part_needs').insert(needPayload)

    if (needResult.error) {
      setBusy(false)
      setMessage(`Work was moved to Waiting → Parts, but the part need could not be saved: ${needResult.error.message}`)
      return
    }

    setMessage('Checking owned parts and donors…')
    const matchResult = await supabase.rpc('find_owned_compatibility_candidates', {
      p_workspace_id: workspaceId,
      p_item_id: selectedWork.item_id,
      p_part_type: cleanPartType,
      p_limit: 30,
    })
    setBusy(false)

    if (matchResult.error) {
      setMessage(`Part need saved, but compatibility search failed: ${matchResult.error.message}`)
      await load()
      return
    }

    const supported = ((matchResult.data ?? []) as Candidate[]).filter((candidate) => candidate.evidence_tier !== 'unverified')
    setResults(supported)
    setMessage(supported.length
      ? `${supported.length} evidence-backed candidate${supported.length === 1 ? '' : 's'} found. Rank is evidence strength, not fit probability.`
      : 'Part need saved. No evidence-backed owned match was found; Calibre has not guessed.')
    await load()
  }

  if (!visible) return null

  return (
    <aside className="workbench-parts-desk" aria-label="Workbench Parts Desk">
      <div className="parts-desk-heading">
        <div><p className="eyebrow">PARTS DESK</p><h2>Needs parts</h2><p className="muted">Record the need, move the Work to Waiting → Parts, then check your own stock and donors.</p></div>
      </div>

      <form className="parts-desk-form" onSubmit={recordNeedAndCheck}>
        <label>Work record
          <select value={selectedWorkId} onChange={(event) => setSelectedWorkId(event.target.value)}>
            <option value="">Choose Work…</option>
            {work.map((record) => {
              const item = itemById.get(record.item_id)
              return <option key={record.id} value={record.id}>Work #{record.work_number} · {item ? `#${item.item_number} ${item.title}` : record.title}{record.waiting_reason === 'parts' ? ' · waiting for parts' : ''}</option>
            })}
          </select>
        </label>
        <label>Part needed
          <input value={partType} onChange={(event) => setPartType(event.target.value)} placeholder="e.g. balance staff" required />
        </label>
        <label className="parts-desk-wide">Detail
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional size, reference, symptom or other detail" />
        </label>
        <button type="submit" disabled={!selectedWorkId || !partType.trim() || busy}>{busy ? 'Checking…' : 'Mark needs parts & check stock'}</button>
      </form>

      <p className="parts-desk-message">{message}</p>

      {results.length > 0 && <div className="parts-desk-results">
        {results.map((candidate) => (
          <article className={`parts-desk-result tier-${candidate.evidence_tier}`} key={`${candidate.candidate_kind}-${candidate.candidate_id}`}>
            <div className="parts-desk-result-head">
              <div><span>{candidate.candidate_kind === 'donor_item' ? 'Donor Item' : titleCase(candidate.part_type)}</span><h3>{candidate.label}</h3>{candidate.detail && <p>{candidate.detail}</p>}</div>
              <div><span>{tierLabel(candidate.evidence_tier)}</span><strong>{candidate.score}</strong></div>
            </div>
            <p className="parts-desk-evidence">{candidate.evidence_label}</p>
            {candidate.reasons?.length > 0 && <ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
            {candidate.modification_required && <p className="parts-desk-warning">Modification may be required — verify exact dimensions before fitting.</p>}
            {candidate.candidate_kind === 'donor_item' && <p className="parts-desk-economics">{candidate.economic_note || `Recorded donor value: ${money(candidate.donor_value, candidate.donor_currency || 'AUD')}`}</p>}
            {candidate.donor_item_id && <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(candidate.donor_item_id!)}` }}>Open donor Item</button>}
          </article>
        ))}
      </div>}
    </aside>
  )
}
