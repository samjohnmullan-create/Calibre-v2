import { useEffect, useMemo, useState } from 'react'
import MovementFinder, { type MovementCandidate } from './MovementFinder'
import { supabase } from './lib/supabase'

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

export default function PassportMovementFinder({ workspaceId, itemId, current, onApplied }: Props) {
  const [open, setOpen] = useState(false)
  const [markings, setMarkings] = useState('')
  const [proposal, setProposal] = useState<MovementCandidate | null>(null)
  const [sources, setSources] = useState<SourceRow[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.from('item_identity')
        .select('movement_markings')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .maybeSingle()
      if (active) setMarkings(String(data?.movement_markings ?? ''))
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

    const result = existing
      ? await supabase.from('passports').update(patch).eq('workspace_id', workspaceId).eq('item_id', itemId).select('movement_maker,calibre,calibre_family,jewels,beat_rate,power_reserve_hours,escapement,movement_diameter_mm,movement_type,knowledge_movement_id,movement_identification_status').single()
      : await supabase.from('passports').insert({ workspace_id: workspaceId, item_id: itemId, ...patch }).select('movement_maker,calibre,calibre_family,jewels,beat_rate,power_reserve_hours,escapement,movement_diameter_mm,movement_type,knowledge_movement_id,movement_identification_status').single()

    setBusy(false)
    if (result.error || !result.data) {
      setMessage(`Could not apply candidate: ${result.error?.message ?? 'No Passport returned.'}`)
      return
    }

    onApplied(result.data as PassportMovementValues)
    setMessage(`${proposal.maker} ${proposal.calibre} applied as a candidate identification. It is not confirmed yet.`)
    setOpen(false)
    setProposal(null)
    setSources([])
  }

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
        <strong>{evidenceLabel(current.movement_identification_status || 'unlinked')}</strong>
        <span>Knowledge link</span>
        <strong>{current.knowledge_movement_id ? 'Linked' : 'Not linked'}</strong>
      </div>

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
          <p className="passport-proposal-warning">Applying links this Passport to the Knowledge Engine record and copies supported movement fields. It does not mark the identity confirmed.</p>
        </div>
      )}

      {message && <p className={`message ${message.startsWith('Could not') ? 'error' : ''}`}>{message}</p>}
    </section>
  )
}
