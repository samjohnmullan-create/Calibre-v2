import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import WorkCompatibilityIntelligence from './WorkCompatibilityIntelligence'
import './work-parts-matcher.css'

type PartNeed = { id: string; part_type: string; description: string; status: 'open' | 'reserved' | 'fulfilled' | 'cancelled' }
type Candidate = {
  part_id: string
  part_type: string
  manufacturer: string
  reference: string
  description: string
  condition: string
  stock_quantity: number
  reserved_quantity: number
  available_quantity: number
  unit_cost: number | null
  currency: string
  donor_item_id: string | null
  match_score: number
}
type Allocation = { id: string; work_part_need_id: string; part_id: string; quantity: number; status: 'reserved' | 'used' | 'released'; note: string; used_at: string | null }
type Part = { id: string; part_type: string; manufacturer: string; reference: string; description: string; condition: string; quantity: number }
type FitVerification = {
  id: string
  part_id: string
  work_record_id: string | null
  result: 'confirmed' | 'rejected' | 'conditional'
  evidence_note: string
  modification_required: boolean
  measured_values: Record<string, unknown> | null
  verified_at: string
}

function partName(part: Pick<Candidate, 'manufacturer' | 'reference' | 'part_type'> | Pick<Part, 'manufacturer' | 'reference' | 'part_type'>) {
  return [part.manufacturer, part.reference].filter(Boolean).join(' ') || part.part_type || 'Stock part'
}

export default function WorkPartsMatcher({ workspaceId, itemId, workId }: { workspaceId: string; itemId: string; workId: string }) {
  const [needs, setNeeds] = useState<PartNeed[]>([])
  const [selectedNeedId, setSelectedNeedId] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [partsById, setPartsById] = useState<Map<string, Part>>(new Map())
  const [fits, setFits] = useState<FitVerification[]>([])
  const [query, setQuery] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [fitNote, setFitNote] = useState('')
  const [fitMeasurement, setFitMeasurement] = useState('')
  const [fitModificationRequired, setFitModificationRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const selectedNeed = needs.find((need) => need.id === selectedNeedId) ?? needs.find((need) => need.status === 'open' || need.status === 'reserved') ?? needs[0] ?? null
  const selectedAllocation = selectedNeed ? allocations.find((allocation) => allocation.work_part_need_id === selectedNeed.id && allocation.status === 'reserved') ?? null : null
  const selectedPart = selectedAllocation ? partsById.get(selectedAllocation.part_id) ?? null : null
  const latestFit = selectedAllocation ? fits.find((fit) => fit.part_id === selectedAllocation.part_id && fit.work_record_id === workId) ?? null : null

  async function load() {
    setLoading(true)
    const [needsResult, allocationsResult, fitsResult] = await Promise.all([
      supabase.from('work_part_needs').select('id,part_type,description,status').eq('workspace_id', workspaceId).eq('work_record_id', workId).order('created_at', { ascending: true }),
      supabase.from('part_allocations').select('id,work_part_need_id,part_id,quantity,status,note,used_at').eq('workspace_id', workspaceId).eq('work_record_id', workId).order('created_at', { ascending: false }),
      supabase.from('part_fit_verifications').select('id,part_id,work_record_id,result,evidence_note,modification_required,measured_values,verified_at').eq('workspace_id', workspaceId).eq('work_record_id', workId).order('verified_at', { ascending: false }).limit(50),
    ])
    setLoading(false)
    const error = needsResult.error ?? allocationsResult.error ?? fitsResult.error
    if (error) {
      setMessage(`Part matching could not be loaded: ${error.message}`)
      return
    }
    const nextNeeds = (needsResult.data ?? []) as PartNeed[]
    const nextAllocations = (allocationsResult.data ?? []) as Allocation[]
    setNeeds(nextNeeds)
    setAllocations(nextAllocations)
    setFits((fitsResult.data ?? []) as FitVerification[])
    if (!selectedNeedId || !nextNeeds.some((need) => need.id === selectedNeedId)) {
      setSelectedNeedId(nextNeeds.find((need) => need.status === 'open' || need.status === 'reserved')?.id ?? nextNeeds[0]?.id ?? '')
    }
    const ids = [...new Set(nextAllocations.map((allocation) => allocation.part_id))]
    if (!ids.length) {
      setPartsById(new Map())
      return
    }
    const { data, error: partsError } = await supabase.from('parts').select('id,part_type,manufacturer,reference,description,condition,quantity').eq('workspace_id', workspaceId).in('id', ids)
    if (partsError) {
      setMessage(`Allocated part details could not be loaded: ${partsError.message}`)
      return
    }
    setPartsById(new Map(((data ?? []) as Part[]).map((part) => [part.id, part])))
  }

  async function search() {
    if (!selectedNeed) return
    setSaving(true)
    const { data, error } = await supabase.rpc('search_parts_for_need', { p_workspace_id: workspaceId, p_need_id: selectedNeed.id, p_query: query.trim() })
    setSaving(false)
    if (error) {
      setMessage(`Stock search failed: ${error.message}`)
      return
    }
    setCandidates((data ?? []) as Candidate[])
    setMessage((data ?? []).length ? `${(data ?? []).length} stock candidate${(data ?? []).length === 1 ? '' : 's'} found.` : 'No available stock matched this requirement.')
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId])
  useEffect(() => {
    setCandidates([])
    setQuery('')
    setQuantity('1')
    setFitNote('')
    setFitMeasurement('')
    setFitModificationRequired(false)
  }, [selectedNeed?.id])

  const activeNeeds = useMemo(() => needs.filter((need) => need.status !== 'cancelled' && need.status !== 'fulfilled'), [needs])

  async function reserve(candidate: Candidate) {
    if (!selectedNeed) return
    const parsed = Number(quantity)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setSaving(true)
    const { error } = await supabase.rpc('reserve_part_for_need', { p_workspace_id: workspaceId, p_need_id: selectedNeed.id, p_part_id: candidate.part_id, p_quantity: parsed, p_note: 'Reserved from Work job card' })
    setSaving(false)
    if (error) {
      setMessage(`Part could not be reserved: ${error.message}`)
      return
    }
    setMessage(`${partName(candidate)} reserved for this job.`)
    setCandidates([])
    await load()
  }

  async function release() {
    if (!selectedAllocation) return
    setSaving(true)
    const { error } = await supabase.rpc('release_part_reservation', { p_workspace_id: workspaceId, p_allocation_id: selectedAllocation.id })
    setSaving(false)
    if (error) {
      setMessage(`Reservation could not be released: ${error.message}`)
      return
    }
    setMessage('Reservation released back to stock.')
    await load()
  }

  async function recordFit(result: 'confirmed' | 'rejected' | 'conditional') {
    if (!selectedAllocation || !selectedPart) return
    if (['rejected', 'conditional'].includes(result) && !fitNote.trim()) {
      setMessage(result === 'rejected' ? 'Add a short note explaining why the part does not fit.' : 'Add a short note describing the modification or conditional fit.')
      return
    }

    const modificationRequired = result === 'conditional' ? true : result === 'rejected' ? false : fitModificationRequired
    const measuredValues = fitMeasurement.trim() ? { observation: fitMeasurement.trim() } : {}

    setSaving(true)
    const { error } = await supabase.rpc('record_part_fit_feedback', {
      p_workspace_id: workspaceId,
      p_part_id: selectedAllocation.part_id,
      p_item_id: itemId,
      p_work_record_id: workId,
      p_result: result,
      p_note: fitNote.trim(),
      p_modification_required: modificationRequired,
      p_measured_values: measuredValues,
    })
    if (!error && result === 'rejected') {
      const releaseResult = await supabase.rpc('release_part_reservation', { p_workspace_id: workspaceId, p_allocation_id: selectedAllocation.id })
      if (releaseResult.error) {
        setSaving(false)
        setMessage(`Fit was recorded, but reservation release failed: ${releaseResult.error.message}`)
        await load()
        return
      }
    }
    setSaving(false)
    if (error) {
      setMessage(`Fit evidence could not be recorded: ${error.message}`)
      return
    }
    setFitNote('')
    setFitMeasurement('')
    setFitModificationRequired(false)
    setMessage(result === 'rejected' ? 'Fit rejected and reservation released.' : result === 'conditional' ? 'Conditional fit recorded with modification required.' : 'Bench fit confirmed and added to Calibre learning.')
    await load()
  }

  async function useReservedPart() {
    if (!selectedAllocation || !selectedNeed) return
    if (!latestFit || !['confirmed', 'conditional'].includes(latestFit.result)) {
      setMessage('Record fit evidence before consuming this part from stock.')
      return
    }
    setSaving(true)
    const useResult = await supabase.rpc('consume_part_allocation', { p_workspace_id: workspaceId, p_allocation_id: selectedAllocation.id })
    if (useResult.error) {
      setSaving(false)
      setMessage(`Part could not be consumed: ${useResult.error.message}`)
      return
    }
    const fulfilResult = await supabase.rpc('fulfil_part_need', { p_workspace_id: workspaceId, p_need_id: selectedNeed.id })
    setSaving(false)
    if (fulfilResult.error) {
      setMessage(`Part was used, but the requirement could not be closed: ${fulfilResult.error.message}`)
      await load()
      return
    }
    setMessage('Part consumed from stock and requirement fulfilled.')
    await load()
  }

  const latestObservation = latestFit?.measured_values && typeof latestFit.measured_values.observation === 'string' ? latestFit.measured_values.observation : ''

  if (loading) return <section className="section-card parts-match-card">Loading parts matching…</section>
  if (!needs.length) return null

  return (
    <section className="section-card parts-match-card">
      <div className="parts-match-heading">
        <div><p className="eyebrow">PARTS MATCHING</p><h3>Allocate workshop stock</h3><p className="muted">Calibre checks evidence-ranked owned parts, donor movements and prior workshop fit history. Fit only becomes evidence when you record it on the bench.</p></div>
        <span>{activeNeeds.length} active</span>
      </div>

      {message && <p className="parts-match-message">{message}</p>}

      <label className="parts-match-need">Requirement<select value={selectedNeed?.id ?? ''} onChange={(event) => setSelectedNeedId(event.target.value)}>{needs.map((need) => <option key={need.id} value={need.id}>{need.part_type || 'Part'} · {need.description || 'No description'} · {need.status}</option>)}</select></label>

      <WorkCompatibilityIntelligence workspaceId={workspaceId} itemId={itemId} need={selectedNeed} hasReservation={Boolean(selectedAllocation)} onReserved={load} />

      {selectedNeed && selectedNeed.status === 'open' && !selectedAllocation && (
        <details className="parts-manual-search">
          <summary>Manual stock text search</summary>
          <div className="parts-match-search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Optional maker, reference or description…" />
            <button type="button" disabled={saving} onClick={() => void search()}>{saving ? 'Searching…' : 'Find stock'}</button>
          </div>
          {candidates.length > 0 && <div className="parts-candidate-list">{candidates.map((candidate) => <article className="parts-candidate" key={candidate.part_id}>
            <div><strong>{partName(candidate)}</strong><p>{candidate.description || candidate.condition || 'No description'}</p><small>{candidate.available_quantity} available of {candidate.stock_quantity} · text-match score {candidate.match_score}{candidate.donor_item_id ? ' · donor stock' : ''}</small></div>
            <div className="parts-candidate-action"><input aria-label="Quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><button type="button" disabled={saving || Number(quantity) > Number(candidate.available_quantity)} onClick={() => void reserve(candidate)}>Reserve</button></div>
          </article>)}</div>}
        </details>
      )}

      {selectedNeed && selectedAllocation && selectedPart && (
        <div className="parts-reservation">
          <div className="parts-reservation-top"><div><span>Reserved</span><strong>{partName(selectedPart)}</strong><p>{selectedPart.description || selectedPart.condition || 'Stock part'}</p></div><strong>×{Number(selectedAllocation.quantity)}</strong></div>
          <div className="parts-fit-evidence">
            <label>Fit evidence / note<input value={fitNote} onChange={(event) => setFitNote(event.target.value)} placeholder="What fitted, failed, or needed alteration?" /></label>
            <label>Bench measurement / observation<input value={fitMeasurement} onChange={(event) => setFitMeasurement(event.target.value)} placeholder="Optional dimensions, clearance, endshake, functional observation…" /></label>
            <label className="parts-fit-modification"><input type="checkbox" checked={fitModificationRequired} onChange={(event) => setFitModificationRequired(event.target.checked)} /><span>Modification required for a confirmed fit</span></label>
            <div className="parts-fit-buttons"><button type="button" className="secondary" disabled={saving} onClick={() => void recordFit('rejected')}>Doesn’t fit</button><button type="button" className="secondary" disabled={saving} onClick={() => void recordFit('conditional')}>Fits with modification</button><button type="button" disabled={saving} onClick={() => void recordFit('confirmed')}>Confirm fit</button></div>
          </div>
          {latestFit && <p className={`parts-fit-status fit-${latestFit.result}`}>Latest fit evidence: <strong>{latestFit.result}</strong>{latestFit.modification_required ? ' · modification required' : ''}{latestFit.evidence_note ? ` · ${latestFit.evidence_note}` : ''}{latestObservation ? ` · ${latestObservation}` : ''}</p>}
          <div className="parts-reservation-actions"><button type="button" className="secondary" disabled={saving} onClick={() => void release()}>Release reservation</button><button type="button" disabled={saving || !latestFit || !['confirmed','conditional'].includes(latestFit.result)} onClick={() => void useReservedPart()}>Use part & fulfil need</button></div>
        </div>
      )}

      {selectedNeed && ['fulfilled','cancelled'].includes(selectedNeed.status) && <p className="muted">This requirement is {selectedNeed.status}. Select another requirement to match stock.</p>}
    </section>
  )
}