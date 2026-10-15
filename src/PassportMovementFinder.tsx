import { useEffect, useMemo, useState } from 'react'
import MovementFinder, { type MovementCandidate } from './MovementFinder'
import { supabase } from './lib/supabase'

type IdentificationBasis = {
  type?: string
  status?: string
  note?: string
  at?: string
  candidate_id?: string
  candidate_label?: string
  confidence?: string
  score?: number
  reasons?: string[]
  source_count?: number
  evidence_grade?: string
}

type PassportMovementValues = {
  movement_maker: string
  calibre: string
  calibre_family: string
  jewels: number | null
  beat_rate: number | null
  power_reserve_hours: number | null
  escapement: string
  movement_diameter_mm: number | null
  movement_type: string
  knowledge_movement_id?: string | null
  movement_identification_status?: string
  movement_identification_confidence?: string
  movement_identification_basis?: IdentificationBasis[]
}

type SourceRow = {
  evidence_class: string
  reference_text: string
  notes: string
  knowledge_sources: {
    title: string
    url: string
    reliability: string
    publisher: string
  } | null
}

type IdentityState = {
  knowledge_movement_id: string | null
  movement_identification_status: string
  movement_identification_confidence: string
  movement_identification_basis: IdentificationBasis[]
}

type Props = {
  workspaceId: string
  itemId: string
  current: PassportMovementValues
  onApplied: (next: PassportMovementValues) => void
}

function windingFromMovementType(value: string) {
  const lower = value.toLowerCase()
  if (lower.includes('auto')) return 'automatic'
  if (lower.includes('quartz')) return 'quartz'
  if (lower.includes('manual') || lower.includes('hand')) return 'manual'
  return ''
}

function movementTypeFromWinding(value: string, fallback: string) {
  if (value === 'manual') return 'Manual wind'
  if (value === 'automatic') return 'Automatic'
  if (value === 'quartz') return 'Quartz'
  return fallback
}

function evidenceLabel(value: string) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Unknown'
}

function initialState(current: PassportMovementValues): IdentityState {
  return {
    knowledge_movement_id: current.knowledge_movement_id ?? null,
    movement_identification_status: current.movement_identification_status ?? 'unlinked',
    movement_identification_confidence: current.movement_identification_confidence ?? 'unknown',
    movement_identification_basis: current.movement_identification_basis ?? [],
  }
}

export default function PassportMovementFinder({ workspaceId, itemId, current, onApplied }: Props) {
  const [open, setOpen] = useState(false)
  const [markings, setMarkings] = useState('')
  const [proposal, setProposal] = useState<MovementCandidate | null>(null)
  const [sources, setSources] = useState<SourceRow[]>([])
  const [identity, setIdentity] = useState<IdentityState>(() => initialState(current))
  const [statusNote, setStatusNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function loadIdentity() {
    const { data, error } = await supabase.from('passports')
      .select('knowledge_movement_id,movement_identification_status,movement_identification_confidence,movement_identification_basis')
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
      .maybeSingle()
    if (!error && data) {
      setIdentity({
        knowledge_movement_id: data.knowledge_movement_id ?? null,
        movement_identification_status: data.movement_identification_status ?? 'unlinked',
        movement_identification_confidence: data.movement_identification_confidence ?? 'unknown',
        movement_identification_basis: Array.isArray(data.movement_identification_basis) ? data.movement_identification_basis as IdentificationBasis[] : [],
      })
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.from('item_identity')
        .select('movement_markings')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .maybeSingle()
      if (active) setMarkings(String(data?.movement_markings ?? ''))
      if (active) await loadIdentity()
    })()
    return () => { active = false }
  }, [workspaceId, itemId])

  const initialClues = useMemo(() => ({
    markings: current.calibre || markings,
    maker: current.movement_maker,
    diameter: current.movement_diameter_mm,
    jewels: current.jewels,
    bph: current.beat_rate,
    winding: windingFromMovementType(current.movement_type),
  }), [current, markings])

  async function choose(candidate: MovementCandidate) {
    setProposal(candidate)
    setSources([])
    setMessage('Loading evidence for this candidate…')
    const { data, error } = await supabase.from('knowledge_movement_sources')
      .select('evidence_class,reference_text,notes,knowledge_sources(title,url,reliability,publisher)')
      .eq('movement_id', candidate.id)
      .order('created_at', { ascending: true })
    if (error) {
      setMessage(`Candidate selected. Evidence links could not load: ${error.message}`)
      return
    }
    setSources((data ?? []) as unknown as SourceRow[])
    setMessage('Candidate selected. Review the changes and evidence before applying.')
  }

  async function applyCandidate() {
    if (!proposal || busy) return
    setBusy(true)
    setMessage('Applying candidate to Passport…')

    const candidateBasis: IdentificationBasis = {
      type: 'movement_finder_candidate',
      candidate_id: proposal.id,
      candidate_label: `${proposal.maker} ${proposal.calibre}`.trim(),
      confidence: proposal.confidence_band,
      score: Number(proposal.score),
      reasons: proposal.reasons ?? [],
      source_count: proposal.source_count ?? sources.length,
      evidence_grade: proposal.evidence_grade || '',
      at: new Date().toISOString(),
    }
    const existingBasis = identity.movement_identification_basis ?? []

    const patch = {
      movement_maker: proposal.maker || current.movement_maker,
      calibre: proposal.calibre || current.calibre,
      calibre_family: proposal.calibre_family || current.calibre_family,
      jewels: proposal.jewels ?? current.jewels,
      beat_rate: proposal.bph ?? current.beat_rate,
      power_reserve_hours: proposal.power_reserve_hours ?? current.power_reserve_hours,
      escapement: proposal.escapement || current.escapement,
      movement_diameter_mm: proposal.diameter_mm ?? current.movement_diameter_mm,
      movement_type: movementTypeFromWinding(proposal.winding, current.movement_type),
      knowledge_movement_id: proposal.id,
      movement_identification_status: 'candidate',
      movement_identification_confidence: proposal.confidence_band,
      movement_identification_basis: [...existingBasis, candidateBasis],
      updated_at: new Date().toISOString(),
    }

    const { data: existing, error: readError } = await supabase.from('passports')
      .select('item_id')
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
      .maybeSingle()

    if (readError) {
      setBusy(false)
      setMessage(`Could not check Passport: ${readError.message}`)
      return
    }

    const select = 'movement_maker,calibre,calibre_family,jewels,beat_rate,power_reserve_hours,escapement,movement_diameter_mm,movement_type,knowledge_movement_id,movement_identification_status,movement_identification_confidence,movement_identification_basis'
    const result = existing
      ? await supabase.from('passports').update(patch).eq('workspace_id', workspaceId).eq('item_id', itemId).select(select).single()
      : await supabase.from('passports').insert({ workspace_id: workspaceId, item_id: itemId, ...patch }).select(select).single()

    setBusy(false)
    if (result.error || !result.data) {
      setMessage(`Could not apply candidate: ${result.error?.message ?? 'No Passport returned.'}`)
      return
    }

    const next = result.data as PassportMovementValues
    onApplied(next)
    setIdentity(initialState(next))
    setMessage(`${proposal.maker} ${proposal.calibre} applied as a ${evidenceLabel(proposal.confidence_band).toLowerCase()}-confidence candidate. It is not confirmed yet.`)
    setOpen(false)
    setProposal(null)
    setSources([])
  }

  async function setIdentificationStatus(status: 'candidate' | 'probable' | 'confirmed' | 'rejected') {
    if (busy || !identity.knowledge_movement_id) return
    setBusy(true)
    setMessage(`Marking movement identification ${status}…`)
    const { error } = await supabase.rpc('set_passport_movement_identification_state', {
      p_workspace_id: workspaceId,
      p_item_id: itemId,
      p_status: status,
      p_note: statusNote.trim(),
    })
    setBusy(false)
    if (error) {
      setMessage(`Identification status could not change: ${error.message}`)
      return
    }
    setStatusNote('')
    await loadIdentity()
    onApplied({ ...current, knowledge_movement_id: identity.knowledge_movement_id, movement_identification_status: status, movement_identification_confidence: identity.movement_identification_confidence })
    setMessage(status === 'probable' ? 'Movement marked Probable. Sourced movement-specific guidance and diagnostic effects may now be used.' : status === 'confirmed' ? 'Movement identity confirmed by the watchmaker. Movement-specific intelligence is fully enabled.' : `Movement identification marked ${evidenceLabel(status)}.`)
  }

  const latestBasis = identity.movement_identification_basis.at(-1)
  const canPromote = Boolean(identity.knowledge_movement_id) && !['confirmed', 'rejected'].includes(identity.movement_identification_status)

  return (
    <section className="section-card passport-finder-bridge">
      <div className="passport-finder-heading">
        <div>
          <p className="eyebrow">MOVEMENT IDENTIFICATION</p>
          <h3>Find from this Passport</h3>
          <p className="muted">Use recorded markings and measurements to rank the Knowledge Engine without overwriting the Passport automatically.</p>
        </div>
        <button type="button" className="secondary small" onClick={() => { setOpen((value) => !value); setProposal(null); setSources([]); setMessage('') }}>{open ? 'Close Finder' : 'Open Finder'}</button>
      </div>

      <div className="passport-linked-movement">
        <span>Status</span>
        <strong>{evidenceLabel(identity.movement_identification_status)}</strong>
        <span>Confidence</span>
        <strong>{evidenceLabel(identity.movement_identification_confidence)}</strong>
        <span>Knowledge link</span>
        <strong>{identity.knowledge_movement_id ? 'Linked' : 'Not linked'}</strong>
      </div>

      {identity.knowledge_movement_id && <div className="passport-identification-review">
        <div><strong>Identity gate</strong><p>{identity.movement_identification_status === 'candidate' ? 'Candidate guidance can be reviewed, but it cannot alter the live diagnostic graph or add movement-specific checks yet.' : identity.movement_identification_status === 'probable' ? 'Probable identity enables sourced movement-specific guidance and diagnostic effects. Confirmation remains a watchmaker decision.' : identity.movement_identification_status === 'confirmed' ? 'Confirmed identity. Exact-movement guidance may be used wherever a source supports it.' : 'Review the linked movement before using movement-specific intelligence.'}</p></div>
        {latestBasis && <small>{latestBasis.type === 'movement_finder_candidate' ? `Last candidate evidence: ${evidenceLabel(latestBasis.confidence || 'unknown')} confidence · ${latestBasis.source_count ?? 0} linked source${latestBasis.source_count === 1 ? '' : 's'}` : `Latest identity event: ${evidenceLabel(latestBasis.status || latestBasis.type || 'recorded')}`}</small>}
        {canPromote && <label>Identification note<textarea rows={2} value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="What independent clue did you verify? Marking, bridge layout, exact dimensions, trusted reference…" /></label>}
        {canPromote && <div className="passport-proposal-actions">
          {identity.movement_identification_status !== 'probable' && <button type="button" className="secondary" onClick={() => void setIdentificationStatus('probable')} disabled={busy}>Mark probable</button>}
          <button type="button" onClick={() => void setIdentificationStatus('confirmed')} disabled={busy}>Confirm identification</button>
        </div>}
      </div>}

      {open && <MovementFinder initialClues={initialClues} onSelectCandidate={choose} selectLabel="Review for Passport" compact />}

      {proposal && (
        <div className="passport-movement-proposal">
          <div className="passport-proposal-heading">
            <div><p className="eyebrow">PROPOSED IDENTIFICATION</p><h3>{proposal.maker} {proposal.calibre}</h3></div>
            <span className={`evidence-badge evidence-${proposal.evidence_grade || 'unknown'}`}>{evidenceLabel(proposal.evidence_grade)}</span>
          </div>

          <div className="passport-proposal-compare">
            <div><span>Current</span><strong>{current.movement_maker || '—'} {current.calibre || ''}</strong><p>{current.movement_diameter_mm ?? '—'} mm · {current.beat_rate ?? '—'} BPH · {current.movement_type || '—'}</p></div>
            <div><span>Proposed</span><strong>{proposal.maker} {proposal.calibre}</strong><p>{proposal.diameter_mm ?? '—'} mm · {proposal.bph ?? '—'} BPH · {movementTypeFromWinding(proposal.winding, '—')}</p></div>
          </div>

          <div className="candidate-badges"><span className={`verification-badge confidence-${proposal.confidence_band}`}>{evidenceLabel(proposal.confidence_band)} confidence</span><span className="verification-badge">{proposal.source_count} linked source{proposal.source_count === 1 ? '' : 's'}</span></div>
          <div className="passport-proposal-reasons">{proposal.reasons?.map((reason) => <span key={reason}>{reason}</span>)}</div>

          <div className="passport-proposal-sources">
            <div className="passport-proposal-source-heading"><strong>Evidence</strong><span>{sources.length ? `${sources.length} linked source${sources.length === 1 ? '' : 's'}` : 'No linked source rows'}</span></div>
            {sources.map((row, index) => (
              <div className="passport-proposal-source" key={`${row.knowledge_sources?.title ?? 'source'}-${index}`}>
                <div><strong>{row.knowledge_sources?.title || 'Knowledge source'}</strong><span>{evidenceLabel(row.evidence_class)} · {evidenceLabel(row.knowledge_sources?.reliability || '')}</span></div>
                {row.reference_text && <p>{row.reference_text}</p>}
                {row.knowledge_sources?.url && <a href={row.knowledge_sources.url} target="_blank" rel="noreferrer">Open source ↗</a>}
              </div>
            ))}
          </div>

          <div className="passport-proposal-actions">
            <button type="button" onClick={applyCandidate} disabled={busy}>{busy ? 'Applying…' : 'Apply as candidate'}</button>
            <button type="button" className="secondary" onClick={() => { setProposal(null); setSources([]); setMessage('') }} disabled={busy}>Keep current</button>
          </div>
          <p className="passport-proposal-warning">Applying links this Passport to the Knowledge Engine record and records the score, clue matches, confidence band and source count. It does not mark the identity probable or confirmed.</p>
        </div>
      )}

      {message && <p className={`message ${message.startsWith('Could not') || message.startsWith('Identification status could not') ? 'error' : ''}`}>{message}</p>}
    </section>
  )
}
