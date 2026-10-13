import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type WorkRow = { id: string; item_id: string; work_number: number; title: string; status: string; waiting_reason: string | null; next_action: string; blocker: string }
type ItemRow = { id: string; item_number: number; title: string }
type NeedRow = { id: string; work_record_id: string; item_id: string; part_type: string; description: string; status: string }
type AllocationRow = { id: string; work_part_need_id: string; part_id: string; quantity: number; status: string }
type PartRow = { id: string; part_type: string; manufacturer: string; reference: string; description: string; quantity: number }
type FitVerificationRow = { id: string; part_id: string; item_id: string | null; work_record_id: string | null; result: 'confirmed' | 'rejected' | 'conditional'; evidence_note: string; verified_at: string }
type Candidate = {
  candidate_kind: 'owned_part' | 'donor_item'
  candidate_id: string
  part_id: string | null
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

function partLabel(part: PartRow | null) {
  if (!part) return 'Reserved part'
  const identity = [part.manufacturer, part.reference].filter(Boolean).join(' ')
  return identity || part.description || titleCase(part.part_type)
}

export default function WorkbenchPartsDesk() {
  const [visible, setVisible] = useState(() => window.location.hash.startsWith('#/workbench'))
  const [workspaceId, setWorkspaceId] = useState('')
  const [work, setWork] = useState<WorkRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [needs, setNeeds] = useState<NeedRow[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [parts, setParts] = useState<PartRow[]>([])
  const [fitVerifications, setFitVerifications] = useState<FitVerificationRow[]>([])
  const [selectedWorkId, setSelectedWorkId] = useState('')
  const [partType, setPartType] = useState('')
  const [description, setDescription] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [message, setMessage] = useState('Choose a Work record to record a part need and check owned stock.')

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])
  const selectedWork = work.find((record) => record.id === selectedWorkId) ?? null
  const selectedNeed = needs.find((need) => need.work_record_id === selectedWorkId && ['open', 'reserved'].includes(need.status)) ?? null
  const reservedAllocation = selectedNeed ? allocations.find((allocation) => allocation.work_part_need_id === selectedNeed.id && allocation.status === 'reserved') ?? null : null
  const usedAllocation = selectedNeed ? allocations.find((allocation) => allocation.work_part_need_id === selectedNeed.id && allocation.status === 'used') ?? null : null
  const currentAllocation = reservedAllocation ?? usedAllocation
  const currentPart = currentAllocation ? partById.get(currentAllocation.part_id) ?? null : null
  const latestFit = currentAllocation && selectedWork
    ? fitVerifications.find((verification) => verification.part_id === currentAllocation.part_id && verification.work_record_id === selectedWork.id) ?? null
    : null

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
    const [workResult, itemResult, needsResult, allocationResult, partsResult, fitResult] = await Promise.all([
      supabase.from('work_records').select('id,item_id,work_number,title,status,waiting_reason,next_action,blocker').eq('workspace_id', workspaceId).not('status', 'in', '(complete,cancelled)').order('priority', { ascending: false }).order('work_number', { ascending: true }),
      supabase.from('items').select('id,item_number,title').eq('workspace_id', workspaceId).is('archived_at', null),
      supabase.from('work_part_needs').select('id,work_record_id,item_id,part_type,description,status').eq('workspace_id', workspaceId).in('status', ['open', 'reserved']),
      supabase.from('part_allocations').select('id,work_part_need_id,part_id,quantity,status').eq('workspace_id', workspaceId).in('status', ['reserved', 'used']),
      supabase.from('parts').select('id,part_type,manufacturer,reference,description,quantity').eq('workspace_id', workspaceId),
      supabase.from('part_fit_verifications').select('id,part_id,item_id,work_record_id,result,evidence_note,verified_at').eq('workspace_id', workspaceId).order('verified_at', { ascending: false }),
    ])
    const error = workResult.error ?? itemResult.error ?? needsResult.error ?? allocationResult.error ?? partsResult.error ?? fitResult.error
    if (error) {
      setMessage(`Parts Desk failed to load: ${error.message}`)
      return
    }
    setWork((workResult.data ?? []) as WorkRow[])
    setItems((itemResult.data ?? []) as ItemRow[])
    setNeeds((needsResult.data ?? []) as NeedRow[])
    setAllocations((allocationResult.data ?? []) as AllocationRow[])
    setParts((partsResult.data ?? []) as PartRow[])
    setFitVerifications((fitResult.data ?? []) as FitVerificationRow[])
  }

  useEffect(() => { if (visible && workspaceId) void load() }, [visible, workspaceId])

  useEffect(() => {
    if (!selectedWorkId) {
      setPartType('')
      setDescription('')
      setResults([])
      return
    }
    const need = needs.find((row) => row.work_record_id === selectedWorkId && ['open', 'reserved'].includes(row.status))
    setPartType(need?.part_type ?? '')
    setDescription(need?.description ?? '')
    setResults([])
  }, [selectedWorkId, needs])

  async function recordNeedAndCheck(event: FormEvent) {
    event.preventDefault()
    if (!workspaceId || !selectedWork || !partType.trim()) return
    if (selectedNeed?.status === 'reserved') {
      setMessage('Release or use the current reservation before changing this part need.')
      return
    }
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

  async function reserve(candidate: Candidate) {
    if (!workspaceId || !selectedNeed || !candidate.part_id || currentAllocation) return
    setActionBusy(candidate.candidate_id)
    const { error } = await supabase.rpc('reserve_part_for_need', {
      p_workspace_id: workspaceId,
      p_need_id: selectedNeed.id,
      p_part_id: candidate.part_id,
      p_quantity: 1,
      p_note: `Reserved from Parts Desk for Work #${selectedWork?.work_number ?? ''}`,
    })
    setActionBusy('')
    if (error) {
      setMessage(`Could not reserve part: ${error.message}`)
      return
    }
    await load()
    setMessage(`Reserved ${candidate.label} for Work #${selectedWork?.work_number ?? ''}. Stock quantity has not changed.`)
  }

  async function releaseReservation() {
    if (!workspaceId || !reservedAllocation) return
    setActionBusy(reservedAllocation.id)
    const { error } = await supabase.rpc('release_part_reservation', {
      p_workspace_id: workspaceId,
      p_allocation_id: reservedAllocation.id,
    })
    setActionBusy('')
    if (error) {
      setMessage(`Could not release reservation: ${error.message}`)
      return
    }
    await load()
    setMessage('Reservation released. Stock quantity was not changed.')
  }

  async function recordFit(result: 'confirmed' | 'rejected') {
    if (!workspaceId || !reservedAllocation || !selectedWork) return
    setActionBusy(`fit-${result}`)
    const note = `${result === 'confirmed' ? 'Confirmed' : 'Rejected'} at bench from Workbench Parts Desk.`
    const fitResult = await supabase.rpc('record_part_fit_result', {
      p_workspace_id: workspaceId,
      p_part_id: reservedAllocation.part_id,
      p_item_id: selectedWork.item_id,
      p_work_record_id: selectedWork.id,
      p_result: result,
      p_note: note,
    })
    if (fitResult.error) {
      setActionBusy('')
      setMessage(`Could not record fit result: ${fitResult.error.message}`)
      return
    }

    if (result === 'rejected') {
      const releaseResult = await supabase.rpc('release_part_reservation', {
        p_workspace_id: workspaceId,
        p_allocation_id: reservedAllocation.id,
      })
      setActionBusy('')
      if (releaseResult.error) {
        setMessage(`Fit was rejected and recorded, but the reservation could not be released: ${releaseResult.error.message}`)
        await load()
        return
      }
      await load()
      setMessage('Fit rejected. Negative bench evidence recorded and reservation released. Stock quantity was not changed.')
      return
    }

    setActionBusy('')
    await load()
    setMessage('Fit confirmed. Bench evidence is recorded. Stock quantity is still unchanged until Use part.')
  }

  async function useReservedPart() {
    if (!workspaceId || !reservedAllocation) return
    if (latestFit?.result !== 'confirmed') {
      setMessage('Confirm the bench fit before using this part.')
      return
    }
    if (!window.confirm(`Use 1 × ${partLabel(currentPart)} for this Work? This will reduce inventory quantity by 1.`)) return

    setActionBusy('use-part')
    const { error } = await supabase.rpc('consume_part_allocation', {
      p_workspace_id: workspaceId,
      p_allocation_id: reservedAllocation.id,
    })
    setActionBusy('')
    if (error) {
      setMessage(`Could not use part: ${error.message}`)
      return
    }
    await load()
    setMessage('Part used. Inventory quantity was reduced by 1. Fulfil the Part Need when the repair can resume.')
  }

  async function fulfilNeed() {
    if (!workspaceId || !selectedNeed || !usedAllocation) return
    setActionBusy('fulfil-need')
    const { error } = await supabase.rpc('fulfil_part_need', {
      p_workspace_id: workspaceId,
      p_need_id: selectedNeed.id,
    })
    setActionBusy('')
    if (error) {
      setMessage(`Could not fulfil part need: ${error.message}`)
      return
    }
    await load()
    setResults([])
    setMessage('Part need fulfilled. The Work is Ready again and the parts blocker has been cleared.')
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
          <input value={partType} onChange={(event) => setPartType(event.target.value)} placeholder="e.g. balance staff" required disabled={selectedNeed?.status === 'reserved'} />
        </label>
        <label className="parts-desk-wide">Detail
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional size, reference, symptom or other detail" disabled={selectedNeed?.status === 'reserved'} />
        </label>
        <button type="submit" disabled={!selectedWorkId || !partType.trim() || busy || selectedNeed?.status === 'reserved'}>{busy ? 'Checking…' : selectedNeed?.status === 'reserved' ? 'Part allocated' : 'Mark needs parts & check stock'}</button>
      </form>

      <p className="parts-desk-message">{message}</p>

      {reservedAllocation && (
        <div className="parts-desk-result tier-confirmed">
          <div className="parts-desk-result-head">
            <div><span>Reserved stock</span><h3>{partLabel(currentPart)}</h3><p>{currentPart ? `${titleCase(currentPart.part_type)} · ${currentPart.quantity} currently in stock` : '1 part reserved for this Work'}</p></div>
            <div><span>Bench fit</span><strong>{latestFit ? titleCase(latestFit.result) : 'Untested'}</strong></div>
          </div>
          <p className="parts-desk-evidence">Reservation protects this unit from being allocated elsewhere. Inventory quantity is unchanged until you explicitly use it.</p>
          <div className="parts-desk-action-row">
            <button type="button" className="secondary small" onClick={() => recordFit('confirmed')} disabled={Boolean(actionBusy)}>{actionBusy === 'fit-confirmed' ? 'Recording…' : 'Confirm fit'}</button>
            <button type="button" className="secondary small" onClick={() => recordFit('rejected')} disabled={Boolean(actionBusy)}>{actionBusy === 'fit-rejected' ? 'Recording…' : 'Reject fit'}</button>
            <button type="button" className="secondary small" onClick={releaseReservation} disabled={Boolean(actionBusy)}>{actionBusy === reservedAllocation.id ? 'Releasing…' : 'Release reservation'}</button>
            <button type="button" onClick={useReservedPart} disabled={Boolean(actionBusy) || latestFit?.result !== 'confirmed'}>{actionBusy === 'use-part' ? 'Using…' : 'Use part'}</button>
          </div>
          {latestFit?.result !== 'confirmed' && <p className="parts-desk-warning">Use part stays locked until you confirm the physical fit at the bench.</p>}
        </div>
      )}

      {usedAllocation && (
        <div className="parts-desk-result tier-confirmed">
          <div className="parts-desk-result-head">
            <div><span>Used stock</span><h3>{partLabel(currentPart)}</h3><p>Inventory has been reduced by {usedAllocation.quantity}. The part-use transaction is recorded against this Work.</p></div>
            <div><span>Status</span><strong>Used</strong></div>
          </div>
          <button type="button" onClick={fulfilNeed} disabled={Boolean(actionBusy)}>{actionBusy === 'fulfil-need' ? 'Fulfilling…' : 'Fulfil need & return Work to Ready'}</button>
        </div>
      )}

      {results.length > 0 && <div className="parts-desk-results">
        {results.map((candidate) => {
          const isReservedCandidate = candidate.part_id && reservedAllocation?.part_id === candidate.part_id
          return (
            <article className={`parts-desk-result tier-${candidate.evidence_tier}`} key={`${candidate.candidate_kind}-${candidate.candidate_id}`}>
              <div className="parts-desk-result-head">
                <div><span>{candidate.candidate_kind === 'donor_item' ? 'Donor Item' : titleCase(candidate.part_type)}</span><h3>{candidate.label}</h3>{candidate.detail && <p>{candidate.detail}</p>}</div>
                <div><span>{tierLabel(candidate.evidence_tier)}</span><strong>{candidate.score}</strong></div>
              </div>
              <p className="parts-desk-evidence">{candidate.evidence_label}</p>
              {candidate.reasons?.length > 0 && <ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
              {candidate.modification_required && <p className="parts-desk-warning">Modification may be required — verify exact dimensions before fitting.</p>}
              {candidate.candidate_kind === 'donor_item' && <p className="parts-desk-economics">{candidate.economic_note || `Recorded donor value: ${money(candidate.donor_value, candidate.donor_currency || 'AUD')}`}</p>}
              {candidate.candidate_kind === 'owned_part' && candidate.part_id && (
                <button type="button" className="secondary small" onClick={() => reserve(candidate)} disabled={!selectedNeed || Boolean(currentAllocation) || actionBusy === candidate.candidate_id}>
                  {isReservedCandidate ? 'Reserved for this Work' : currentAllocation ? 'Part already allocated' : actionBusy === candidate.candidate_id ? 'Reserving…' : 'Reserve for Work'}
                </button>
              )}
              {candidate.donor_item_id && <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(candidate.donor_item_id!)}` }}>Open donor Item</button>}
            </article>
          )
        })}
      </div>}
    </aside>
  )
}
