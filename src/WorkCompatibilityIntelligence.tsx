import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-compatibility-intelligence.css'

type Need = { id: string; part_type: string; description: string; status: string }
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
  evidence_tier: string
  evidence_label: string
  score: number
  confidence: number | null
  source_kind: string
  modification_required: boolean
  donor_value: number | null
  donor_currency: string | null
  economic_note: string
  reasons: string[]
}

type Passport = {
  movement_maker: string
  calibre: string
  movement_identification_status: string
  movement_identification_confidence: string
  knowledge_movement_id: string | null
}

function pretty(value: string) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown'
}

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value) }
  catch { return `${currency} ${value}` }
}

export default function WorkCompatibilityIntelligence({
  workspaceId,
  itemId,
  need,
  hasReservation,
  onReserved,
}: {
  workspaceId: string
  itemId: string
  need: Need | null
  hasReservation: boolean
  onReserved: () => void | Promise<void>
}) {
  const [passport, setPassport] = useState<Passport | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [showLowerConfidence, setShowLowerConfidence] = useState(false)

  async function load() {
    if (!workspaceId || !itemId || !need || hasReservation || !['open', 'reserved'].includes(need.status)) {
      setCandidates([])
      return
    }
    setLoading(true)
    setMessage('')
    const [passportResult, candidateResult] = await Promise.all([
      supabase.from('passports')
        .select('movement_maker,calibre,movement_identification_status,movement_identification_confidence,knowledge_movement_id')
        .eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.rpc('find_owned_compatibility_candidates', {
        p_workspace_id: workspaceId,
        p_item_id: itemId,
        p_part_type: need.part_type || null,
        p_limit: 40,
      }),
    ])
    setLoading(false)
    if (passportResult.error || candidateResult.error) {
      setMessage(`Compatibility intelligence could not load: ${passportResult.error?.message ?? candidateResult.error?.message}`)
      return
    }
    setPassport((passportResult.data ?? null) as Passport | null)
    setCandidates((candidateResult.data ?? []) as Candidate[])
  }

  useEffect(() => { void load() }, [workspaceId, itemId, need?.id, need?.part_type, need?.status, hasReservation])

  const visible = useMemo(() => {
    const sorted = [...candidates].sort((a, b) => b.score - a.score)
    return showLowerConfidence ? sorted : sorted.filter((candidate) => ['confirmed', 'documented', 'candidate'].includes(candidate.evidence_tier))
  }, [candidates, showLowerConfidence])

  const donorCount = candidates.filter((candidate) => candidate.candidate_kind === 'donor_item' && candidate.score >= 30).length
  const strongCount = candidates.filter((candidate) => ['confirmed', 'documented'].includes(candidate.evidence_tier)).length

  async function reserve(candidate: Candidate) {
    if (!need || !candidate.part_id || busyId) return
    setBusyId(candidate.candidate_id)
    setMessage('Reserving evidence-ranked stock candidate…')
    const { error } = await supabase.rpc('reserve_part_for_need', {
      p_workspace_id: workspaceId,
      p_need_id: need.id,
      p_part_id: candidate.part_id,
      p_quantity: 1,
      p_note: `Reserved from compatibility intelligence · ${candidate.evidence_label}`,
    })
    setBusyId('')
    if (error) {
      setMessage(`Candidate could not be reserved: ${error.message}`)
      return
    }
    setMessage(`${candidate.label} reserved. Fit still needs to be verified on the bench.`)
    await onReserved()
  }

  function openDonor(candidate: Candidate) {
    if (!candidate.donor_item_id) return
    window.location.hash = `#/items/${encodeURIComponent(candidate.donor_item_id)}`
  }

  if (!need || hasReservation || !['open', 'reserved'].includes(need.status)) return null

  return <section className="work-compat-intelligence">
    <div className="work-compat-heading">
      <div>
        <p className="eyebrow">PARTS & DONOR INTELLIGENCE</p>
        <strong>Owned compatibility candidates</strong>
        <p>Calibre ranks stock and donor Items by evidence. Same-family matches are leads only — never proof of interchangeability.</p>
      </div>
      <div className="work-compat-summary">
        <span>{strongCount} strong</span>
        <span>{donorCount} donor lead{donorCount === 1 ? '' : 's'}</span>
      </div>
    </div>

    {passport && <div className="work-compat-target">
      <span>Target movement</span>
      <strong>{[passport.movement_maker, passport.calibre].filter(Boolean).join(' ') || 'Not identified'}</strong>
      <small>{pretty(passport.movement_identification_status)} · {pretty(passport.movement_identification_confidence)} confidence</small>
    </div>}

    {!loading && !passport?.knowledge_movement_id && <div className="work-compat-notice">Link a Knowledge movement in Passport before Calibre can compare donor movements and documented applications.</div>}
    {loading && <p className="work-compat-message">Checking owned stock, donors and compatibility evidence…</p>}
    {message && <p className={`work-compat-message ${message.includes('could not') ? 'error' : ''}`}>{message}</p>}

    {!loading && visible.length > 0 && <div className="work-compat-list">
      {visible.map((candidate) => <article key={`${candidate.candidate_kind}-${candidate.candidate_id}`} className={`work-compat-candidate tier-${candidate.evidence_tier}`}>
        <div className="work-compat-candidate-main">
          <div className="work-compat-badges">
            <span>{candidate.candidate_kind === 'donor_item' ? 'DONOR ITEM' : 'OWNED PART'}</span>
            <span>{pretty(candidate.evidence_tier)}</span>
            <span>Score {candidate.score}</span>
          </div>
          <h4>{candidate.label}</h4>
          {candidate.detail && <p>{candidate.detail}</p>}
          <strong className="work-compat-evidence">{candidate.evidence_label}</strong>
          {candidate.reasons?.length > 0 && <ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          {candidate.modification_required && <div className="work-compat-warning">Modification may be required. Verify dimensions and function before use.</div>}
          {candidate.candidate_kind === 'donor_item' && <div className="work-compat-economics">
            <span>{candidate.donor_value != null ? `Recorded donor value ${money(candidate.donor_value, candidate.donor_currency || 'AUD')}` : 'No donor valuation recorded'}</span>
            <small>{candidate.economic_note}</small>
          </div>}
        </div>
        <div className="work-compat-actions">
          {candidate.candidate_kind === 'owned_part' && candidate.part_id && <button type="button" onClick={() => void reserve(candidate)} disabled={Boolean(busyId)}>{busyId === candidate.candidate_id ? 'Reserving…' : 'Reserve part'}</button>}
          {candidate.candidate_kind === 'donor_item' && <button type="button" className="secondary" onClick={() => openDonor(candidate)}>Open donor</button>}
        </div>
      </article>)}
    </div>}

    {!loading && candidates.length > visible.length && <button type="button" className="secondary work-compat-lower" onClick={() => setShowLowerConfidence((value) => !value)}>{showLowerConfidence ? 'Hide weak leads' : `Show ${candidates.length - visible.length} lower-confidence lead${candidates.length - visible.length === 1 ? '' : 's'}`}</button>}
    {!loading && passport?.knowledge_movement_id && candidates.length === 0 && <div className="work-compat-notice">No owned stock or donor Items currently have compatibility evidence for this movement and part type.</div>}
  </section>
}
