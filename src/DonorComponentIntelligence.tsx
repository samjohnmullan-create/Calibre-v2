import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  donorComponentCatalog,
  scoreComplementaryDonorPair,
  scoreDonorMovementCompatibility,
  type DonorAssessmentConfidence,
  type DonorComponentAssessment,
  type DonorComponentCondition,
  type DonorComponentInventoryState,
  type DonorMovementProfile,
} from './lib/donorIntelligence'

type DonorItem = {
  id: string
  item_number: number
  title: string
  storage_location_id: string | null
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
  inventory_state: DonorComponentInventoryState
  harvested_part_id: string | null
  harvested_at: string | null
}

type StorageLocation = {
  id: string
  name: string
  code: string | null
}

type HarvestTarget = {
  donor: DonorItem
  componentKey: string
  componentLabel: string
  assessment?: AssessmentRow
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
    inventoryState: row.inventory_state,
    evidenceNote: row.evidence_note,
  }
}

export default function DonorComponentIntelligence({ workspaceId }: { workspaceId: string }) {
  const [donors, setDonors] = useState<DonorItem[]>([])
  const [passports, setPassports] = useState<PassportRow[]>([])
  const [assessments, setAssessments] = useState<AssessmentRow[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [message, setMessage] = useState('')
  const [harvestTarget, setHarvestTarget] = useState<HarvestTarget | null>(null)
  const [harvestLocationId, setHarvestLocationId] = useState('')
  const [harvestCost, setHarvestCost] = useState('')
  const [harvestNote, setHarvestNote] = useState('')
  const [harvestBusy, setHarvestBusy] = useState(false)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    const [donorResult, passportResult, assessmentResult, locationResult] = await Promise.all([
      supabase.from('items')
        .select('id,item_number,title,storage_location_id')
        .eq('workspace_id', workspaceId)
        .eq('purpose', 'donor')
        .is('archived_at', null)
        .order('item_number', { ascending: true }),
      supabase.from('passports')
        .select('item_id,knowledge_movement_id,movement_maker,calibre,calibre_family,movement_type,movement_diameter_mm,setting_system,beat_rate')
        .eq('workspace_id', workspaceId),
      supabase.from('item_component_assessments')
        .select('id,item_id,component_key,component_label,condition,confidence,evidence_note,inventory_state,harvested_part_id,harvested_at')
        .eq('workspace_id', workspaceId)
        .order('component_key'),
      supabase.from('storage_locations')
        .select('id,name,code')
        .eq('workspace_id', workspaceId)
        .order('sort_order')
        .order('name'),
    ])
    setLoading(false)
    const error = donorResult.error ?? passportResult.error ?? assessmentResult.error ?? locationResult.error
    if (error) {
      setMessage(`Donor component intelligence failed to load: ${error.message}`)
      return
    }
    const assessmentRows = (assessmentResult.data ?? []) as AssessmentRow[]
    setDonors((donorResult.data ?? []) as DonorItem[])
    setPassports((passportResult.data ?? []) as PassportRow[])
    setAssessments(assessmentRows)
    setLocations((locationResult.data ?? []) as StorageLocation[])
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
  const harvestedCount = useMemo(() => assessments.filter((row) => row.inventory_state === 'harvested').length, [assessments])

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
    if (existing?.inventory_state === 'harvested') return
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

  function openHarvest(target: HarvestTarget) {
    setHarvestTarget(target)
    setHarvestLocationId(target.donor.storage_location_id ?? '')
    setHarvestCost('')
    setHarvestNote('')
    setMessage('')
  }

  function closeHarvest() {
    if (harvestBusy) return
    setHarvestTarget(null)
    setHarvestLocationId('')
    setHarvestCost('')
    setHarvestNote('')
  }

  async function harvestComponent() {
    if (!harvestTarget || harvestBusy) return
    const numericCost = harvestCost.trim() === '' ? null : Number(harvestCost)
    if (numericCost != null && (!Number.isFinite(numericCost) || numericCost < 0)) {
      setMessage('Allocated cost must be zero or greater.')
      return
    }
    setHarvestBusy(true)
    const { error } = await supabase.rpc('harvest_item_component', {
      p_workspace_id: workspaceId,
      p_item_id: harvestTarget.donor.id,
      p_component_key: harvestTarget.componentKey,
      p_component_label: harvestTarget.componentLabel,
      p_storage_location_id: harvestLocationId || null,
      p_unit_cost: numericCost,
      p_currency: 'AUD',
      p_note: harvestNote.trim(),
    })
    setHarvestBusy(false)
    if (error) {
      setMessage(`Could not harvest ${harvestTarget.componentLabel}: ${error.message}`)
      return
    }
    const donorNumber = harvestTarget.donor.item_number
    const componentLabel = harvestTarget.componentLabel
    setHarvestTarget(null)
    setHarvestLocationId('')
    setHarvestCost('')
    setHarvestNote('')
    await load()
    setMessage(`${componentLabel} harvested from Item #${donorNumber} and created in Parts.`)
    window.dispatchEvent(new CustomEvent('calibre:parts-changed'))
  }

  function openParts() {
    window.dispatchEvent(new CustomEvent('calibre:inventory-view', { detail: 'parts' }))
  }

  if (loading) return <section className="donor-intelligence-card"><p className="inventory-empty">Loading donor condition intelligence…</p></section>

  return (
    <section className="donor-intelligence-card">
      <div className="parts-heading">
        <div>
          <p className="eyebrow">DONOR CONDITION INTELLIGENCE</p>
          <h2>What is actually usable?</h2>
          <p className="muted">Record condition while a component is still inside the donor. When you physically remove it, Harvest moves that component into Parts and permanently links the loose part back to its source donor.</p>
        </div>
        <div className="donor-intelligence-summary"><strong>{assessedDonorCount}/{donors.length}</strong><span>donors assessed · {harvestedCount} harvested</span></div>
      </div>

      {message && <p className="inventory-message">{message}</p>}

      {complementaryPairs.length > 0 && (
        <section className="donor-pair-panel">
          <div className="inventory-v2-list-heading">
            <div>
              <p className="eyebrow">COMPLEMENTARY DONORS</p>
              <h3>Evidence-backed rebuild candidates</h3>
              <p className="muted">These pairs use only components still recorded inside the donors. Harvested components leave donor scoring and become normal Parts stock.</p>
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
        <p className="inventory-message">No complementary donor pair is proven strongly enough yet. Assess component condition and improve Passport movement identification; Calibre will keep compatibility, condition and physical stock state separate.</p>
      )}

      <div className="donor-assessment-list">
        {donors.map((donor) => {
          const passport = passportByItemId.get(donor.id)
          const donorAssessments = assessmentsByItem.get(donor.id) ?? []
          const assessed = donorAssessments.filter((entry) => entry.condition !== 'untested' && entry.condition !== 'unknown').length
          const harvested = donorAssessments.filter((entry) => entry.inventoryState === 'harvested').length
          return (
            <details className="donor-assessment-card" key={donor.id}>
              <summary>
                <span><strong>#{donor.item_number} {donor.title}</strong><small>{[passport?.movement_maker, passport?.calibre, passport?.calibre_family].filter(Boolean).join(' · ') || 'Movement identity incomplete'}</small></span>
                <span>{assessed}/{donorComponentCatalog.length} assessed{harvested ? ` · ${harvested} harvested` : ''}</span>
              </summary>
              <div className="donor-component-grid">
                {donorComponentCatalog.map(([componentKey, componentLabel]) => {
                  const key = assessmentKey(donor.id, componentKey)
                  const row = assessmentByKey.get(key)
                  const note = notes[key] ?? row?.evidence_note ?? ''
                  const isHarvested = row?.inventory_state === 'harvested'
                  const cannotHarvest = row?.condition === 'missing'
                  return (
                    <div className={`donor-component-row${isHarvested ? ' is-harvested' : ''}`} key={componentKey}>
                      <strong>{componentLabel}</strong>
                      <label>Condition
                        <select
                          value={row?.condition ?? 'untested'}
                          disabled={savingKey === key || isHarvested}
                          onChange={(event) => void saveAssessment(donor, componentKey, componentLabel, { condition: event.target.value as DonorComponentCondition })}
                        >
                          {conditions.map((condition) => <option key={condition} value={condition}>{titleCase(condition)}</option>)}
                        </select>
                      </label>
                      <label>Confidence
                        <select
                          value={row?.confidence ?? 'unknown'}
                          disabled={savingKey === key || isHarvested}
                          onChange={(event) => void saveAssessment(donor, componentKey, componentLabel, { confidence: event.target.value as DonorAssessmentConfidence })}
                        >
                          {confidences.map((confidence) => <option key={confidence} value={confidence}>{titleCase(confidence)}</option>)}
                        </select>
                      </label>
                      <label className="donor-component-note">Evidence note
                        <input
                          value={note}
                          placeholder="What did you observe?"
                          disabled={isHarvested}
                          onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))}
                          onBlur={() => {
                            if (!isHarvested && note !== (row?.evidence_note ?? '')) void saveAssessment(donor, componentKey, componentLabel, { evidence_note: note })
                          }}
                        />
                      </label>
                      <span className="donor-component-actions">
                        <span className={`donor-save-state ${isHarvested ? 'state-harvested' : `condition-${row?.condition ?? 'untested'}`}`}>{savingKey === key ? 'Saving…' : isHarvested ? 'Harvested' : titleCase(row?.condition ?? 'untested')}</span>
                        {isHarvested ? (
                          <button type="button" className="secondary small" onClick={openParts}>View Part</button>
                        ) : (
                          <button
                            type="button"
                            className="secondary small"
                            disabled={savingKey === key || cannotHarvest}
                            title={cannotHarvest ? 'This component is recorded as missing.' : `Harvest ${componentLabel} into Parts`}
                            onClick={() => openHarvest({ donor, componentKey, componentLabel, assessment: row })}
                          >Harvest</button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>

      {harvestTarget && (
        <div className="donor-harvest-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHarvest() }}>
          <section className="donor-harvest-dialog" role="dialog" aria-modal="true" aria-labelledby="donor-harvest-title">
            <div>
              <p className="eyebrow">HARVEST TO PARTS</p>
              <h3 id="donor-harvest-title">{harvestTarget.componentLabel}</h3>
              <p className="muted">From Item #{harvestTarget.donor.item_number} · {harvestTarget.donor.title}. This creates one Part and marks the component as physically removed from the donor in the same transaction.</p>
            </div>

            <div className="donor-harvest-source">
              <span>Recorded condition<strong>{titleCase(harvestTarget.assessment?.condition ?? 'untested')}</strong></span>
              <span>Confidence<strong>{titleCase(harvestTarget.assessment?.confidence ?? 'unknown')}</strong></span>
            </div>

            <label>Part storage location
              <select value={harvestLocationId} onChange={(event) => setHarvestLocationId(event.target.value)}>
                <option value="">Unassigned</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.code ? `${location.code} · ${location.name}` : location.name}</option>)}
              </select>
            </label>

            <label>Allocated cost (AUD, optional)
              <input type="number" min="0" step="0.01" inputMode="decimal" value={harvestCost} onChange={(event) => setHarvestCost(event.target.value)} placeholder="0.00" />
            </label>

            <label>Harvest note (optional)
              <textarea rows={3} value={harvestNote} onChange={(event) => setHarvestNote(event.target.value)} placeholder="Removal detail, damage found, packaging location…" />
            </label>

            <p className="donor-harvest-warning">The donor assessment is preserved as the source snapshot. After harvest, condition edits belong on the new Part rather than back on the donor.</p>

            <div className="donor-harvest-actions">
              <button type="button" className="secondary" disabled={harvestBusy} onClick={closeHarvest}>Cancel</button>
              <button type="button" disabled={harvestBusy} onClick={() => void harvestComponent()}>{harvestBusy ? 'Harvesting…' : 'Harvest to Parts'}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
