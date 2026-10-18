import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  donorComponentCatalog,
  scoreComplementaryDonorPair,
  scoreDonorMovementCompatibility,
  type DonorAssessmentConfidence,
  type DonorComponentAssessment,
  type DonorComponentCondition,
  type DonorMovementProfile,
} from './lib/donorIntelligence'

type DonorItem = {
  id: string
  item_number: number
  title: string
}

type PassportRow = {
  item_id: string
  knowledge_movement_id: string | null
  movement_maker: string
  calibre: string
  calibre_family: string
  movement_type: string
  movement_diameter_mm: number | null
  setting_system: string
  beat_rate: number | null
}

type AssessmentRow = {
  id: string
  item_id: string
  component_key: string
  component_label: string
  condition: DonorComponentCondition
  confidence: DonorAssessmentConfidence
  evidence_note: string
}

type ComplementaryPair = {
  left: DonorItem
  right: DonorItem
  score: number
  compatibilityScore: number
  complements: string[]
  gaps: string[]
  reasons: string[]
}

const conditions: DonorComponentCondition[] = ['untested', 'good', 'usable', 'worn', 'damaged', 'missing', 'unknown']
const confidences: DonorAssessmentConfidence[] = ['unknown', 'possible', 'probable', 'strong', 'confirmed']

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function assessmentKey(itemId: string, componentKey: string) {
  return `${itemId}:${componentKey}`
}

function movementProfile(passport: PassportRow | undefined): DonorMovementProfile | undefined {
  if (!passport) return undefined
  return {
    knowledgeMovementId: passport.knowledge_movement_id,
    movementMaker: passport.movement_maker,
    calibre: passport.calibre,
    calibreFamily: passport.calibre_family,
    movementType: passport.movement_type,
    movementDiameterMm: passport.movement_diameter_mm,
    settingSystem: passport.setting_system,
    beatRate: passport.beat_rate,
  }
}

function toAssessment(row: AssessmentRow): DonorComponentAssessment {
  return {
    itemId: row.item_id,
    componentKey: row.component_key,
    componentLabel: row.component_label,
    condition: row.condition,
    confidence: row.confidence,
    evidenceNote: row.evidence_note,
  }
}

export default function DonorComponentIntelligence({ workspaceId }: { workspaceId: string }) {
  const [donors, setDonors] = useState<DonorItem[]>([])
  const [passports, setPassports] = useState<PassportRow[]>([])
  const [assessments, setAssessments] = useState<AssessmentRow[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    const [donorResult, passportResult, assessmentResult] = await Promise.all([
      supabase.from('items')
        .select('id,item_number,title')
        .eq('workspace_id', workspaceId)
        .eq('purpose', 'donor')
        .is('archived_at', null)
        .order('item_number', { ascending: true }),
      supabase.from('passports')
        .select('item_id,knowledge_movement_id,movement_maker,calibre,calibre_family,movement_type,movement_diameter_mm,setting_system,beat_rate')
        .eq('workspace_id', workspaceId),
      supabase.from('item_component_assessments')
        .select('id,item_id,component_key,component_label,condition,confidence,evidence_note')
        .eq('workspace_id', workspaceId)
        .order('component_key'),
    ])
    setLoading(false)
    const error = donorResult.error ?? passportResult.error ?? assessmentResult.error
    if (error) {
      setMessage(`Donor component intelligence failed to load: ${error.message}`)
      return
    }
    const assessmentRows = (assessmentResult.data ?? []) as AssessmentRow[]
    setDonors((donorResult.data ?? []) as DonorItem[])
    setPassports((passportResult.data ?? []) as PassportRow[])
    setAssessments(assessmentRows)
    setNotes(Object.fromEntries(assessmentRows.map((row) => [assessmentKey(row.item_id, row.component_key), row.evidence_note])))
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId])

  const passportByItemId = useMemo(() => new Map(passports.map((passport) => [passport.item_id, passport])), [passports])
  const assessmentByKey = useMemo(() => new Map(assessments.map((row) => [assessmentKey(row.item_id, row.component_key), row])), [assessments])
  const assessmentsByItem = useMemo(() => {
    const grouped = new Map<string, DonorComponentAssessment[]>()
    for (const row of assessments) {
      const current = grouped.get(row.item_id) ?? []
      current.push(toAssessment(row))
      grouped.set(row.item_id, current)
    }
    return grouped
  }, [assessments])

  const assessedDonorCount = useMemo(() => new Set(assessments.map((row) => row.item_id)).size, [assessments])

  const complementaryPairs = useMemo<ComplementaryPair[]>(() => {
    const rows: ComplementaryPair[] = []
    for (let i = 0; i < donors.length; i += 1) {
      for (let j = i + 1; j < donors.length; j += 1) {
        const left = donors[i]
        const right = donors[j]
        const compatibility = scoreDonorMovementCompatibility(
          movementProfile(passportByItemId.get(left.id)),
          movementProfile(passportByItemId.get(right.id)),
        )
        const condition = scoreComplementaryDonorPair(
          compatibility.score,
          assessmentsByItem.get(left.id) ?? [],
          assessmentsByItem.get(right.id) ?? [],
        )
        if (!condition.qualifies || condition.complements.length === 0) continue
        rows.push({
          left,
          right,
          score: condition.score,
          compatibilityScore: compatibility.score,
          complements: condition.complements,
          gaps: condition.gaps,
          reasons: [...compatibility.reasons, ...condition.reasons],
        })
      }
    }
    return rows.sort((a, b) => b.score - a.score).slice(0, 12)
  }, [donors, passportByItemId, assessmentsByItem])

  async function saveAssessment(
    donor: DonorItem,
    componentKey: string,
    componentLabel: string,
    patch: Partial<Pick<AssessmentRow, 'condition' | 'confidence' | 'evidence_note'>>,
  ) {
    const key = assessmentKey(donor.id, componentKey)
    const existing = assessmentByKey.get(key)
    const payload = {
      workspace_id: workspaceId,
      item_id: donor.id,
      component_key: componentKey,
      component_label: componentLabel,
      condition: patch.condition ?? existing?.condition ?? 'untested',
      confidence: patch.confidence ?? existing?.confidence ?? 'unknown',
      evidence_note: patch.evidence_note ?? notes[key] ?? existing?.evidence_note ?? '',
      assessed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setSavingKey(key)
    const { error } = await supabase.from('item_component_assessments')
      .upsert(payload, { onConflict: 'workspace_id,item_id,component_key' })
    setSavingKey('')
    if (error) {
      setMessage(`Could not save ${componentLabel} for Item #${donor.item_number}: ${error.message}`)
      return
    }
    await load()
  }

  if (loading) return <section className="donor-intelligence-card"><p className="inventory-empty">Loading donor condition intelligence…</p></section>

  return (
    <section className="donor-intelligence-card">
      <div className="parts-heading">
        <div>
          <p className="eyebrow">DONOR CONDITION INTELLIGENCE</p>
          <h2>What is actually usable?</h2>
          <p className="muted">Record the condition of components still inside each donor. Calibre only creates a complementary rebuild lead when movement evidence is already plausible; condition evidence can strengthen a match but cannot create compatibility by itself.</p>
        </div>
        <div className="donor-intelligence-summary"><strong>{assessedDonorCount}/{donors.length}</strong><span>donors assessed</span></div>
      </div>

      {message && <p className="inventory-message">{message}</p>}

      {complementaryPairs.length > 0 && (
        <section className="donor-pair-panel">
          <div className="inventory-v2-list-heading">
            <div>
              <p className="eyebrow">COMPLEMENTARY DONORS</p>
              <h3>Evidence-backed rebuild candidates</h3>
              <p className="muted">These pairs combine plausible movement compatibility with recorded component condition. They are still leads until interchangeability or fit is verified.</p>
            </div>
            <span>{complementaryPairs.length} candidate{complementaryPairs.length === 1 ? '' : 's'}</span>
          </div>
          <div className="inventory-list">
            {complementaryPairs.map((pair) => (
              <div className="inventory-row" key={`${pair.left.id}-${pair.right.id}`}>
                <span className="inventory-row-number">{pair.score}</span>
                <span className="inventory-row-main">
                  <strong>#{pair.left.item_number} {pair.left.title} + #{pair.right.item_number} {pair.right.title}</strong>
                  <small>Movement evidence {pair.compatibilityScore}/100 · Complementary: {pair.complements.join(', ')}</small>
                  {pair.gaps.length > 0 && <small>Shared gaps: {pair.gaps.join(', ')}</small>}
                  <small>{pair.reasons.join(' · ')}</small>
                </span>
                <span className="inventory-row-actions">
                  <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(pair.left.id)}` }}>Open #{pair.left.item_number}</button>
                  <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(pair.right.id)}` }}>Open #{pair.right.item_number}</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {complementaryPairs.length === 0 && (
        <p className="inventory-message">No complementary donor pair is proven strongly enough yet. Assess component condition and improve Passport movement identification; Calibre will keep compatibility and condition evidence separate.</p>
      )}

      <div className="donor-assessment-list">
        {donors.map((donor) => {
          const passport = passportByItemId.get(donor.id)
          const donorAssessments = assessmentsByItem.get(donor.id) ?? []
          const assessed = donorAssessments.filter((entry) => entry.condition !== 'untested' && entry.condition !== 'unknown').length
          return (
            <details className="donor-assessment-card" key={donor.id}>
              <summary>
                <span><strong>#{donor.item_number} {donor.title}</strong><small>{[passport?.movement_maker, passport?.calibre, passport?.calibre_family].filter(Boolean).join(' · ') || 'Movement identity incomplete'}</small></span>
                <span>{assessed}/{donorComponentCatalog.length} assessed</span>
              </summary>
              <div className="donor-component-grid">
                {donorComponentCatalog.map(([componentKey, componentLabel]) => {
                  const key = assessmentKey(donor.id, componentKey)
                  const row = assessmentByKey.get(key)
                  const note = notes[key] ?? row?.evidence_note ?? ''
                  return (
                    <div className="donor-component-row" key={componentKey}>
                      <strong>{componentLabel}</strong>
                      <label>Condition
                        <select
                          value={row?.condition ?? 'untested'}
                          disabled={savingKey === key}
                          onChange={(event) => void saveAssessment(donor, componentKey, componentLabel, { condition: event.target.value as DonorComponentCondition })}
                        >
                          {conditions.map((condition) => <option key={condition} value={condition}>{titleCase(condition)}</option>)}
                        </select>
                      </label>
                      <label>Confidence
                        <select
                          value={row?.confidence ?? 'unknown'}
                          disabled={savingKey === key}
                          onChange={(event) => void saveAssessment(donor, componentKey, componentLabel, { confidence: event.target.value as DonorAssessmentConfidence })}
                        >
                          {confidences.map((confidence) => <option key={confidence} value={confidence}>{titleCase(confidence)}</option>)}
                        </select>
                      </label>
                      <label className="donor-component-note">Evidence note
                        <input
                          value={note}
                          placeholder="What did you observe?"
                          onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
                          onBlur={() => {
                            if (note !== (row?.evidence_note ?? '')) void saveAssessment(donor, componentKey, componentLabel, { evidence_note: note })
                          }}
                        />
                      </label>
                      <span className={`donor-save-state condition-${row?.condition ?? 'untested'}`}>{savingKey === key ? 'Saving…' : titleCase(row?.condition ?? 'untested')}</span>
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}
