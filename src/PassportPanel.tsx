import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import ResearchWorkspace from './ResearchWorkspace'
import PassportMovementFinder from './PassportMovementFinder'

export type Passport = {
  item_id: string
  workspace_id: string
  movement_maker: string
  calibre: string
  calibre_family: string
  jewels: number | null
  beat_rate: number | null
  power_reserve_hours: number | null
  escapement: string
  movement_diameter_mm: number | null
  movement_type: string
  setting_system: string
  complications: string[]
  case_material: string
  case_style: string
  caseback_type: string
  crystal_type: string
  crown_type: string
  lug_width_mm: number | null
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  water_resistance_marking: string
  hallmarks: string
  provenance_summary: string
  technical_notes: string
  knowledge_movement_id: string | null
  movement_identification_status: string
  updated_at?: string
}

type PassportPanelProps = {
  workspaceId: string
  itemId: string
}

const emptyPassport = (workspaceId: string, itemId: string): Passport => ({
  item_id: itemId,
  workspace_id: workspaceId,
  movement_maker: '',
  calibre: '',
  calibre_family: '',
  jewels: null,
  beat_rate: null,
  power_reserve_hours: null,
  escapement: '',
  movement_diameter_mm: null,
  movement_type: '',
  setting_system: '',
  complications: [],
  case_material: '',
  case_style: '',
  caseback_type: '',
  crystal_type: '',
  crown_type: '',
  lug_width_mm: null,
  width_mm: null,
  height_mm: null,
  thickness_mm: null,
  water_resistance_marking: '',
  hallmarks: '',
  provenance_summary: '',
  technical_notes: '',
  knowledge_movement_id: null,
  movement_identification_status: 'unlinked',
})

const selectFields = 'item_id,workspace_id,movement_maker,calibre,calibre_family,jewels,beat_rate,power_reserve_hours,escapement,movement_diameter_mm,movement_type,setting_system,complications,case_material,case_style,caseback_type,crystal_type,crown_type,lug_width_mm,width_mm,height_mm,thickness_mm,water_resistance_marking,hallmarks,provenance_summary,technical_notes,knowledge_movement_id,movement_identification_status,updated_at'

function display(value: string | number | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
}

function numeric(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function PassportPanel({ workspaceId, itemId }: PassportPanelProps) {
  const [passport, setPassport] = useState<Passport>(() => emptyPassport(workspaceId, itemId))
  const [draft, setDraft] = useState<Passport>(() => emptyPassport(workspaceId, itemId))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [exists, setExists] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setMessage('')
      const { data, error } = await supabase.from('passports')
        .select(selectFields)
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .maybeSingle()
      if (!active) return
      setLoading(false)
      if (error) {
        setMessage(`Passport failed to load: ${error.message}`)
        return
      }
      const next = data ? data as Passport : emptyPassport(workspaceId, itemId)
      setPassport(next)
      setDraft(next)
      setExists(Boolean(data))
    })()
    return () => { active = false }
  }, [workspaceId, itemId])

  const completion = useMemo(() => {
    const important: (keyof Passport)[] = [
      'movement_maker', 'calibre', 'jewels', 'beat_rate', 'escapement', 'movement_type',
      'case_material', 'case_style', 'crystal_type', 'width_mm', 'thickness_mm', 'technical_notes',
    ]
    const filled = important.filter((key) => {
      const value = passport[key]
      return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ''
    }).length
    return Math.round((filled / important.length) * 100)
  }, [passport])

  function textField<K extends keyof Passport>(key: K, value: Passport[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage('Saving Passport…')
    const payload = {
      ...draft,
      item_id: itemId,
      workspace_id: workspaceId,
      complications: draft.complications.filter(Boolean),
    }
    delete payload.updated_at

    const { data, error } = await supabase.from('passports')
      .upsert(payload, { onConflict: 'item_id' })
      .select(selectFields)
      .single()

    setSaving(false)
    if (error || !data) {
      setMessage(`Passport could not be saved: ${error?.message ?? 'No record returned.'}`)
      return
    }
    const next = data as Passport
    setPassport(next)
    setDraft(next)
    setExists(true)
    setEditing(false)
    setMessage('Passport saved.')
  }

  function cancel() {
    setDraft(passport)
    setEditing(false)
    setMessage('')
  }

  function applyMovementIdentity(nextMovement: {
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
  }) {
    const next: Passport = {
      ...passport,
      ...nextMovement,
      knowledge_movement_id: nextMovement.knowledge_movement_id ?? null,
      movement_identification_status: nextMovement.movement_identification_status ?? 'candidate',
    }
    setPassport(next)
    setDraft(next)
    setExists(true)
    setMessage('Movement candidate linked to Passport. Identity remains candidate until confirmed.')
  }

  if (loading) return <div className="loading-card">Loading Passport…</div>

  if (editing) {
    return (
      <div className="passport-stack">
        <div className="passport-toolbar">
          <div><p className="eyebrow">TECHNICAL DOSSIER</p><h3>{exists ? 'Edit Passport' : 'Create Passport'}</h3></div>
          <button type="button" className="secondary small" onClick={cancel} disabled={saving}>Cancel</button>
        </div>

        <section className="section-card passport-section">
          <div className="passport-section-heading"><div><p className="eyebrow">MOVEMENT</p><h3>Movement identity</h3></div><span className="passport-rule">Unknown stays unknown</span></div>
          <div className="passport-grid">
            <label>Movement maker<input value={draft.movement_maker} onChange={(e) => textField('movement_maker', e.target.value)} /></label>
            <label>Calibre<input value={draft.calibre} onChange={(e) => textField('calibre', e.target.value)} placeholder="Confirmed or working identification" /></label>
            <label>Calibre family<input value={draft.calibre_family} onChange={(e) => textField('calibre_family', e.target.value)} /></label>
            <label>Movement type<input value={draft.movement_type} onChange={(e) => textField('movement_type', e.target.value)} placeholder="Manual, automatic, quartz…" /></label>
            <label>Jewels<input inputMode="numeric" value={draft.jewels ?? ''} onChange={(e) => textField('jewels', numeric(e.target.value))} /></label>
            <label>Beat rate (BPH)<input inputMode="numeric" value={draft.beat_rate ?? ''} onChange={(e) => textField('beat_rate', numeric(e.target.value))} /></label>
            <label>Power reserve (hours)<input inputMode="decimal" value={draft.power_reserve_hours ?? ''} onChange={(e) => textField('power_reserve_hours', numeric(e.target.value))} /></label>
            <label>Movement diameter (mm)<input inputMode="decimal" value={draft.movement_diameter_mm ?? ''} onChange={(e) => textField('movement_diameter_mm', numeric(e.target.value))} /></label>
            <label>Escapement<input value={draft.escapement} onChange={(e) => textField('escapement', e.target.value)} /></label>
            <label>Setting system<input value={draft.setting_system} onChange={(e) => textField('setting_system', e.target.value)} /></label>
            <label className="span-2">Complications<input value={draft.complications.join(', ')} onChange={(e) => textField('complications', e.target.value.split(',').map((value) => value.trim()).filter(Boolean))} placeholder="Date, small seconds, alarm…" /></label>
          </div>
        </section>

        <section className="section-card passport-section">
          <p className="eyebrow">CASE & EXTERIOR</p>
          <div className="passport-grid">
            <label>Case material<input value={draft.case_material} onChange={(e) => textField('case_material', e.target.value)} /></label>
            <label>Case style<input value={draft.case_style} onChange={(e) => textField('case_style', e.target.value)} /></label>
            <label>Caseback type<input value={draft.caseback_type} onChange={(e) => textField('caseback_type', e.target.value)} /></label>
            <label>Crystal type<input value={draft.crystal_type} onChange={(e) => textField('crystal_type', e.target.value)} /></label>
            <label>Crown type<input value={draft.crown_type} onChange={(e) => textField('crown_type', e.target.value)} /></label>
            <label>Water-resistance marking<input value={draft.water_resistance_marking} onChange={(e) => textField('water_resistance_marking', e.target.value)} placeholder="Marking only — not a pressure-test result" /></label>
            <label className="span-2">Hallmarks / case marks<textarea rows={3} value={draft.hallmarks} onChange={(e) => textField('hallmarks', e.target.value)} /></label>
          </div>
        </section>

        <section className="section-card passport-section">
          <p className="eyebrow">DIMENSIONS</p>
          <div className="passport-grid passport-measure-grid">
            <label>Width (mm)<input inputMode="decimal" value={draft.width_mm ?? ''} onChange={(e) => textField('width_mm', numeric(e.target.value))} /></label>
            <label>Height (mm)<input inputMode="decimal" value={draft.height_mm ?? ''} onChange={(e) => textField('height_mm', numeric(e.target.value))} /></label>
            <label>Thickness (mm)<input inputMode="decimal" value={draft.thickness_mm ?? ''} onChange={(e) => textField('thickness_mm', numeric(e.target.value))} /></label>
            <label>Lug width (mm)<input inputMode="decimal" value={draft.lug_width_mm ?? ''} onChange={(e) => textField('lug_width_mm', numeric(e.target.value))} /></label>
          </div>
        </section>

        <section className="section-card passport-section">
          <p className="eyebrow">RECORD</p>
          <div className="passport-grid">
            <label className="span-2">Provenance summary<textarea rows={4} value={draft.provenance_summary} onChange={(e) => textField('provenance_summary', e.target.value)} /></label>
            <label className="span-2">Technical notes<textarea rows={6} value={draft.technical_notes} onChange={(e) => textField('technical_notes', e.target.value)} placeholder="Observed technical details, unresolved questions, service-relevant notes…" /></label>
          </div>
        </section>

        <div className="passport-savebar">
          <p className="message">{message}</p>
          <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Passport'}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="passport-stack">
      <section className="section-card passport-hero">
        <div className="passport-hero-main">
          <div><p className="eyebrow">WATCH PASSPORT</p><h3>Permanent technical dossier</h3><p className="muted">Technical data persists with the Item across every inspection, service and future sale.</p></div>
          <button type="button" className="secondary small" onClick={() => setEditing(true)}>{exists ? 'Edit Passport' : 'Create Passport'}</button>
        </div>
        <div className="passport-completion"><span>Record coverage</span><strong>{completion}%</strong><div><i style={{ width: `${completion}%` }} /></div></div>
        {message && <p className="message passport-message">{message}</p>}
      </section>

      <div className="passport-columns">
        <section className="section-card">
          <p className="eyebrow">MOVEMENT</p>
          <dl className="fact-list">
            <div><dt>Maker</dt><dd>{display(passport.movement_maker)}</dd></div>
            <div><dt>Calibre</dt><dd>{display(passport.calibre)}</dd></div>
            <div><dt>Family</dt><dd>{display(passport.calibre_family)}</dd></div>
            <div><dt>Type</dt><dd>{display(passport.movement_type)}</dd></div>
            <div><dt>Jewels</dt><dd>{display(passport.jewels)}</dd></div>
            <div><dt>Beat rate</dt><dd>{display(passport.beat_rate, passport.beat_rate ? ' BPH' : '')}</dd></div>
            <div><dt>Escapement</dt><dd>{display(passport.escapement)}</dd></div>
            <div><dt>Setting</dt><dd>{display(passport.setting_system)}</dd></div>
            <div><dt>Power reserve</dt><dd>{display(passport.power_reserve_hours, passport.power_reserve_hours ? ' h' : '')}</dd></div>
            <div><dt>Movement diameter</dt><dd>{display(passport.movement_diameter_mm, passport.movement_diameter_mm ? ' mm' : '')}</dd></div>
            <div><dt>Complications</dt><dd>{passport.complications.length ? passport.complications.map(titleCase).join(' · ') : '—'}</dd></div>
          </dl>
        </section>

        <section className="section-card">
          <p className="eyebrow">CASE & DIMENSIONS</p>
          <dl className="fact-list">
            <div><dt>Material</dt><dd>{display(passport.case_material)}</dd></div>
            <div><dt>Style</dt><dd>{display(passport.case_style)}</dd></div>
            <div><dt>Caseback</dt><dd>{display(passport.caseback_type)}</dd></div>
            <div><dt>Crystal</dt><dd>{display(passport.crystal_type)}</dd></div>
            <div><dt>Crown</dt><dd>{display(passport.crown_type)}</dd></div>
            <div><dt>Width</dt><dd>{display(passport.width_mm, passport.width_mm ? ' mm' : '')}</dd></div>
            <div><dt>Height</dt><dd>{display(passport.height_mm, passport.height_mm ? ' mm' : '')}</dd></div>
            <div><dt>Thickness</dt><dd>{display(passport.thickness_mm, passport.thickness_mm ? ' mm' : '')}</dd></div>
            <div><dt>Lug width</dt><dd>{display(passport.lug_width_mm, passport.lug_width_mm ? ' mm' : '')}</dd></div>
            <div><dt>WR marking</dt><dd>{display(passport.water_resistance_marking)}</dd></div>
          </dl>
          {passport.water_resistance_marking && <p className="passport-caution">Marking only. Do not treat this as current water resistance without a pressure test.</p>}
        </section>
      </div>

      <section className="section-card">
        <p className="eyebrow">TECHNICAL RECORD</p>
        <div className="prose-data">
          <span>Hallmarks / case marks</span><p>{passport.hallmarks || 'No hallmarks recorded.'}</p>
          <span>Provenance</span><p>{passport.provenance_summary || 'No provenance summary recorded.'}</p>
          <span>Technical notes</span><p>{passport.technical_notes || 'No technical notes recorded.'}</p>
        </div>
      </section>

      <PassportMovementFinder
        workspaceId={workspaceId}
        itemId={itemId}
        current={passport}
        onApplied={applyMovementIdentity}
      />

      <ResearchWorkspace workspaceId={workspaceId} itemId={itemId} />
    </div>
  )
}
