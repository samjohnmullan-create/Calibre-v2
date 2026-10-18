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

type FitLearning = {
  part_id: string
  fit_state: 'confirmed' | 'conditional' | 'rejected' | 'mixed'
  successful_fits: number
  conditional_fits: number
  rejected_fits: number
  latest_verified_at: string
  score: number
  confidence: number | null
  modification_required: boolean
  evidence_label: string
  reasons: string[]
}

type Passport = {
  movement_maker: string
  calibre: string
  calibre_family: string
  movement_diameter_mm: number | null
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

function matchLevel(candidate: Candidate) {
  if (candidate.evidence_tier === 'confirmed') return 'Confirmed / exact'
  if (candidate.evidence_tier === 'workshop_proven') return 'Workshop-proven component'
  if (candidate.evidence_tier === 'documented') return 'Documented match'
  if (candidate.evidence_tier === 'workshop_conditional') return 'Conditional workshop evidence'
  if (candidate.evidence_tier === 'workshop_rejected') return 'Rejected workshop lineage'
  if (candidate.evidence_tier === 'workshop_mixed') return 'Mixed workshop evidence'
  if (candidate.source_kind === 'passport_exact_calibre') return 'Exact calibre lead'
  if (candidate.source_kind === 'passport_dimensions') return 'Dimensional lead'
  if (candidate.evidence_tier === 'candidate') return 'Compatibility candidate'
  if (candidate.evidence_tier === 'family_lead') return 'Same-family lead'
  return 'Unverified lead'
}

function applyFitLearning(candidates: Candidate[], learning: FitLearning[]) {
  const byPart = new Map(learning.map((entry) => [entry.part_id, entry]))
  return candidates.map((candidate) => {
    if (candidate.candidate_kind !== 'owned_part' || !candidate.part_id) return candidate
    const learned = byPart.get(candidate.part_id)
    if (!learned) return candidate

    // Exact-part bench evidence and manufacturer/documented evidence remain stronger than lineage inference.
    if (candidate.source_kind === 'bench' || ['confirmed', 'documented'].includes(candidate.evidence_tier)) return candidate

    const learnedReasons = [...(learned.reasons ?? []), ...(candidate.reasons ?? [])]
    if (learned.fit_state === 'rejected') {
      return {
        ...candidate,
        evidence_tier: 'workshop_rejected',
        evidence_label: learned.evidence_label,
        score: 0,
        confidence: learned.confidence,
        source_kind: 'component_fit_learning',
        modification_required: learned.modification_required,
        reasons: learnedReasons,
      }
    }

    if (learned.score <= candidate.score) return candidate

    return {
      ...candidate,
      evidence_tier: learned.fit_state === 'confirmed'
        ? 'workshop_proven'
        : learned.fit_state === 'conditional'
          ? 'workshop_conditional'
          : 'workshop_mixed',
      evidence_label: learned.evidence_label,
      score: learned.score,
      confidence: learned.confidence,
      source_kind: 'component_fit_learning',
      modification_required: candidate.modification_required || learned.modification_required,
      reasons: learnedReasons,
    }
  })
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
    const [passportResult, candidateResult, learningResult] = await Promise.all([
      supabase.from('passports')
        .select('movement_maker,calibre,calibre_family,movement_diameter_mm,movement_identification_status,movement_identification_confidence,knowledge_movement_id')
        .eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.rpc('find_owned_compatibility_candidates', {
        p_workspace_id: workspaceId,
        p_item_id: itemId,
        p_part_type: need.part_type || null,
        p_limit: 40,
      }),
      supabase.rpc('find_component_fit_learning_candidates', {
        p_workspace_id: workspaceId,
        p_item_id: itemId,
        p_part_type: need.part_type || null,
      }),
    ])
    setLoading(false)
    if (passportResult.error || candidateResult.error) {
      setMessage(`Compatibility intelligence could not load: ${passportResult.error?.message ?? candidateResult.error?.message}`)
      return
    }
    setPassport((passportResult.data ?? null) as Passport | null)
    const baseCandidates = (candidateResult.data ?? []) as Candidate[]
    if (learningResult.error) {
      setCandidates(baseCandidates)
      setMessage(`Workshop fit learning could not load, so Calibre is showing the existing evidence ranking only: ${learningResult.error.message}`)
      return
    }
    setCandidates(applyFitLearning(baseCandidates, (learningResult.data ?? []) as FitLearning[]))
  }

  useEffect(() => { void load() }, [workspaceId, itemId, need?.id, need?.part_type, need?.status, hasReservation])

  const visible = useMemo(() => {
    const sorted = [...candidates].sort((a, b) => b.score - a.score)
    return showLowerConfidence
      ? sorted
      : sorted.filter((candidate) => ['confirmed', 'documented', 'candidate', 'workshop_proven', 'workshop_conditional'].includes(candidate.evidence_tier) || candidate.source_kind === 'passport_exact_calibre')
  }, [candidates, showLowerConfidence])

  const donorCount = candidates.filter((candidate) => candidate.candidate_kind === 'donor_item' && candidate.score >= 30).length
  const strongCount = candidates.filter((candidate) => ['confirmed', 'documented', 'workshop_proven'].includes(candidate.evidence_tier)).length

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
        <p>Calibre checks loose stock, donor watches and your own bench-fit history together. Component-level learning can strengthen or weaken a lead, but it never becomes a blanket movement-compatibility claim.</p>
      </div>
      <div className="work-compat-summary">
        <span>{strongCount} strong</span>
        <span>{donorCount} donor lead{donorCount === 1 ? '' : 's'}</span>
      </div>
    </div>

    {passport && <div className="work-compat-target">
      <span>Target movement</span>
      <strong>{[passport.movement_maker, passport.calibre].filter(Boolean).join(' ') || 'Not identified'}</strong>
      <small>{pretty(passport.movement_identification_status)} · {pretty(passport.movement_identification_confidence)} confidence{passport.calibre_family ? ` · ${passport.calibre_family} family` : ''}{passport.movement_diameter_mm ? ` · ${passport.movement_diameter_mm} mm` : ''}</small>
    </div>}

    {!loading && passport && !passport.knowledge_movement_id && <div className="work-compat-notice">Passport-only matching is active. Calibre can also learn component-specific fit history from maker/calibre snapshots when a Knowledge movement is not yet linked.</div>}
    {!loading && (!passport || (!passport.calibre && !passport.knowledge_movement_id)) && <div className="work-compat-notice">Identify at least the target calibre in Passport to make donor matching useful. Movement family and diameter improve lower-confidence matching.</div>}
    {loading && <p className="work-compat-message">Checking owned stock, complete donors, documented compatibility and workshop fit history…</p>}
    {message && <p className={`work-compat-message ${message.includes('could not') ? 'error' : ''}`}>{message}</p>}

    {!loading && visible.length > 0 && <div className="work-compat-list">
      {visible.map((candidate) => <article key={`${candidate.candidate_kind}-${candidate.candidate_id}`} className={`work-compat-candidate tier-${candidate.evidence_tier}`}>
        <div className="work-compat-candidate-main">
          <div className="work-compat-badges">
            <span>{candidate.candidate_kind === 'donor_item' ? 'COMPLETE DONOR' : 'OWNED PART'}</span>
            <span>{matchLevel(candidate)}</span>
            <span>Score {candidate.score}</span>
          </div>
          <h4>{candidate.label}</h4>
          {candidate.detail && <p>{candidate.detail}</p>}
          <strong className="work-compat-evidence">{candidate.evidence_label}</strong>
          {candidate.reasons?.length > 0 && <ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          {candidate.modification_required && <div className="work-compat-warning">Workshop evidence indicates modification or a caveat may be required. Verify dimensions and function before use.</div>}
          {candidate.candidate_kind === 'donor_item' && <div className="work-compat-economics">
            <span>{candidate.donor_value != null ? `Recorded donor value ${money(candidate.donor_value, candidate.donor_currency || 'AUD')}` : 'No donor valuation recorded'}</span>
            <small>{candidate.economic_note}</small>
          </div>}
        </div>
        <div className="work-compat-actions">
          {candidate.candidate_kind === 'owned_part' && candidate.part_id && <button type="button" onClick={() => void reserve(candidate)} disabled={Boolean(busyId)}>{busyId === candidate.candidate_id ? 'Reserving…' : 'Reserve part'}</button>}
          {candidate.candidate_kind === 'donor_item' && <button type="button" className="secondary" onClick={() => openDonor(candidate)}>Inspect donor</button>}
        </div>
      </article>)}
    </div>}

    {!loading && candidates.length > visible.length && <button type="button" className="secondary work-compat-lower" onClick={() => setShowLowerConfidence((value) => !value)}>{showLowerConfidence ? 'Hide weak / rejected leads' : `Show ${candidates.length - visible.length} lower-confidence or rejected lead${candidates.length - visible.length === 1 ? '' : 's'}`}</button>}
    {!loading && passport && (passport.calibre || passport.knowledge_movement_id) && candidates.length === 0 && <div className="work-compat-notice">No owned stock or complete donor watches currently match this movement strongly enough to surface.</div>}
  </section>
}
