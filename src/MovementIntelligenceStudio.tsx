import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './movement-intelligence-studio.css'

type Movement = {
  id: string
  maker: string
  calibre: string
  calibre_family: string
  diameter_mm: number | null
  height_mm: number | null
  jewels: number | null
  bph: number | null
  winding: string
  power_reserve_hours: number | null
  escapement: string
  layout: string
  evidence_grade: string
  verification_status: string
  notes: string
}

type MovementSource = {
  id: string
  movement_id: string
  source_id: string
  evidence_class: string
  reference_text: string
  notes: string
  source: {
    id: string
    title: string
    publisher: string
    url: string
    reliability: string
    reference_text: string
  } | null
}

type Guidance = {
  id: string
  movement_id: string
  step_key: string
  guidance_type: string
  title: string
  instruction: string
  check_key: string
  check_type: string
  tool_key: string
  answer_kind: string
  answer_options: Array<{ label: string; value: string }>
  problem_values: string[]
  required: boolean
  inject_as_check: boolean
  sequence: number
  source_id: string
  reference_text: string
  evidence_grade: string
  verification_status: string
  active: boolean
}

type ProcedureStage = { step_key: string; label: string; template_name: string }

const guidanceTypes = [
  ['caution', 'Caution'],
  ['service_note', 'Service note'],
  ['disassembly', 'Disassembly'],
  ['assembly', 'Assembly'],
  ['lubrication', 'Lubrication'],
  ['diagnostic', 'Diagnostic'],
  ['measurement', 'Measurement'],
  ['timing', 'Timing'],
  ['parts', 'Parts'],
  ['verification', 'Verification'],
] as const

const checkTypes = ['knowledge', 'inspection', 'action', 'observation', 'decision', 'measurement', 'timing', 'part', 'qc']
const toolKeys = ['', 'knowledge', 'diagnosis', 'measurement', 'timing', 'parts', 'research', 'photo']
const answerKinds = ['status', 'choice', 'text']

function pretty(value: string) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown'
}

function slugKey(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function optionLinesToJson(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label, rawValue] = line.split('|')
    const clean = label.trim()
    return { label: clean, value: rawValue?.trim() || slugKey(clean) }
  })
}

function csv(value: string) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

export default function MovementIntelligenceStudio() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movement[]>([])
  const [selected, setSelected] = useState<Movement | null>(null)
  const [sources, setSources] = useState<MovementSource[]>([])
  const [guidance, setGuidance] = useState<Guidance[]>([])
  const [stages, setStages] = useState<ProcedureStage[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [stepKey, setStepKey] = useState('')
  const [guidanceType, setGuidanceType] = useState('service_note')
  const [title, setTitle] = useState('')
  const [instruction, setInstruction] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [referenceText, setReferenceText] = useState('')
  const [evidenceGrade, setEvidenceGrade] = useState('documented')
  const [injectAsCheck, setInjectAsCheck] = useState(false)
  const [required, setRequired] = useState(false)
  const [checkType, setCheckType] = useState('knowledge')
  const [toolKey, setToolKey] = useState('knowledge')
  const [answerKind, setAnswerKind] = useState('status')
  const [answerOptions, setAnswerOptions] = useState('')
  const [problemValues, setProblemValues] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: templateData } = await supabase.from('work_templates').select('id,name').eq('is_active', true)
      if (cancelled || !templateData?.length) return
      const templateIds = templateData.map((row) => row.id)
      const nameById = Object.fromEntries(templateData.map((row) => [row.id, row.name]))
      const { data: stepData } = await supabase.from('work_template_steps').select('template_id,step_key,label,sequence').in('template_id', templateIds).order('sequence')
      if (cancelled) return
      const seen = new Set<string>()
      const next: ProcedureStage[] = []
      for (const row of stepData ?? []) {
        if (seen.has(row.step_key)) continue
        seen.add(row.step_key)
        next.push({ step_key: row.step_key, label: row.label, template_name: nameById[row.template_id] || 'Procedure' })
      }
      setStages(next)
      if (!stepKey && next.length) setStepKey(next[0].step_key)
    })()
    return () => { cancelled = true }
  }, [])

  async function searchMovements() {
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('search_knowledge_movements', { p_query: query.trim(), p_limit: 50 })
    setLoading(false)
    if (error) {
      setMessage(`Movement search failed: ${error.message}`)
      return
    }
    setResults((data ?? []) as Movement[])
  }

  useEffect(() => { void searchMovements() }, [])

  async function loadMovement(movement: Movement) {
    setSelected(movement)
    setLoading(true)
    setMessage('')
    const [sourceResult, guidanceResult] = await Promise.all([
      supabase.from('knowledge_movement_sources')
        .select('id,movement_id,source_id,evidence_class,reference_text,notes,source:knowledge_sources(id,title,publisher,url,reliability,reference_text)')
        .eq('movement_id', movement.id)
        .order('created_at', { ascending: true }),
      supabase.from('knowledge_movement_guidance')
        .select('id,movement_id,step_key,guidance_type,title,instruction,check_key,check_type,tool_key,answer_kind,answer_options,problem_values,required,inject_as_check,sequence,source_id,reference_text,evidence_grade,verification_status,active')
        .eq('movement_id', movement.id)
        .order('sequence', { ascending: true }),
    ])
    setLoading(false)
    const error = sourceResult.error ?? guidanceResult.error
    if (error) {
      setMessage(`Movement intelligence could not load: ${error.message}`)
      return
    }
    const nextSources = (sourceResult.data ?? []) as unknown as MovementSource[]
    setSources(nextSources)
    setGuidance((guidanceResult.data ?? []) as Guidance[])
    const preferredSource = nextSources[0]
    setSourceId(preferredSource?.source_id ?? '')
    setEvidenceGrade(preferredSource?.evidence_class || movement.evidence_grade || 'documented')
    setReferenceText(preferredSource?.reference_text || preferredSource?.source?.reference_text || '')
  }

  const selectedSource = useMemo(() => sources.find((entry) => entry.source_id === sourceId) ?? null, [sources, sourceId])

  function chooseSource(value: string) {
    setSourceId(value)
    const link = sources.find((entry) => entry.source_id === value)
    if (!link) return
    setEvidenceGrade(link.evidence_class || 'documented')
    setReferenceText(link.reference_text || link.source?.reference_text || '')
  }

  function clearEditor() {
    setGuidanceType('service_note')
    setTitle('')
    setInstruction('')
    setInjectAsCheck(false)
    setRequired(false)
    setCheckType('knowledge')
    setToolKey('knowledge')
    setAnswerKind('status')
    setAnswerOptions('')
    setProblemValues('')
  }

  async function addGuidance() {
    if (!selected || !stepKey || !title.trim() || !instruction.trim() || !sourceId || saving) return
    setSaving(true)
    setMessage('Saving movement intelligence…')
    const sequence = (guidance.at(-1)?.sequence ?? 0) + 10
    const payload = {
      movement_id: selected.id,
      step_key: stepKey,
      guidance_type: guidanceType,
      title: title.trim(),
      instruction: instruction.trim(),
      check_key: injectAsCheck ? `${slugKey(selected.maker)}_${slugKey(selected.calibre)}_${slugKey(title)}` : '',
      check_type: injectAsCheck ? checkType : 'knowledge',
      tool_key: injectAsCheck ? toolKey : 'knowledge',
      answer_kind: injectAsCheck ? answerKind : 'status',
      answer_options: injectAsCheck && answerKind === 'choice' ? optionLinesToJson(answerOptions) : [],
      problem_values: injectAsCheck ? csv(problemValues) : [],
      required: injectAsCheck && required,
      inject_as_check: injectAsCheck,
      sequence,
      source_id: sourceId,
      reference_text: referenceText.trim(),
      evidence_grade: evidenceGrade,
      verification_status: 'reviewed',
      origin_kind: 'knowledge',
      active: true,
    }
    const { error } = await supabase.from('knowledge_movement_guidance').insert(payload)
    setSaving(false)
    if (error) {
      setMessage(`Movement intelligence could not be saved: ${error.message}`)
      return
    }
    setMessage('Movement intelligence saved. It can now surface at the matching procedure stage.')
    clearEditor()
    await loadMovement(selected)
  }

  async function toggleGuidance(row: Guidance) {
    const { error } = await supabase.from('knowledge_movement_guidance').update({ active: !row.active, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (error) setMessage(`Guidance could not be updated: ${error.message}`)
    else if (selected) await loadMovement(selected)
  }

  return <div className="movement-intelligence-studio">
    <section className="mi-search-panel">
      <div><p className="eyebrow">MOVEMENT INTELLIGENCE</p><h2>Author sourced bench guidance</h2><p className="muted">Attach calibre-specific knowledge to the exact procedure stage where it becomes useful.</p></div>
      <form onSubmit={(event) => { event.preventDefault(); void searchMovements() }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ETA 2824, AS 1130, FHF…" />
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>
      {message && <p className={`mi-message ${message.includes('failed') || message.includes('could not') ? 'error' : ''}`}>{message}</p>}
    </section>

    <div className="mi-layout">
      <aside className="mi-results">
        <div className="mi-section-heading"><strong>{results.length} movements</strong><span>Knowledge Engine</span></div>
        <div className="mi-result-list">
          {results.map((movement) => <button key={movement.id} type="button" className={selected?.id === movement.id ? 'active' : ''} onClick={() => void loadMovement(movement)}>
            <strong>{movement.maker} {movement.calibre}</strong>
            <span>{movement.calibre_family || 'No family'} · {pretty(movement.evidence_grade)}</span>
            <small>{[movement.jewels && `${movement.jewels} jewels`, movement.bph && `${movement.bph} BPH`, movement.diameter_mm && `${movement.diameter_mm} mm`].filter(Boolean).join(' · ') || 'Technical data incomplete'}</small>
          </button>)}
        </div>
      </aside>

      <section className="mi-workspace">
        {!selected ? <div className="mi-empty"><strong>Select a movement</strong><p>Choose a calibre to inspect its source evidence and author workshop guidance.</p></div> : <>
          <header className="mi-movement-header">
            <div><p className="eyebrow">SELECTED MOVEMENT</p><h2>{selected.maker} {selected.calibre}</h2><p>{selected.calibre_family || 'Unclassified family'} · {pretty(selected.verification_status)} · {pretty(selected.evidence_grade)}</p></div>
            <div className="mi-fact-grid">
              <span><small>Diameter</small><strong>{selected.diameter_mm ? `${selected.diameter_mm} mm` : '—'}</strong></span>
              <span><small>Height</small><strong>{selected.height_mm ? `${selected.height_mm} mm` : '—'}</strong></span>
              <span><small>Jewels</small><strong>{selected.jewels ?? '—'}</strong></span>
              <span><small>BPH</small><strong>{selected.bph ?? '—'}</strong></span>
              <span><small>Winding</small><strong>{selected.winding || '—'}</strong></span>
              <span><small>Escapement</small><strong>{selected.escapement || '—'}</strong></span>
            </div>
          </header>

          <section className="mi-evidence-card">
            <div className="mi-section-heading"><strong>Evidence</strong><span>{sources.length} linked source{sources.length === 1 ? '' : 's'}</span></div>
            {sources.length === 0 ? <p className="muted">No linked source evidence. Guidance cannot be authored until a source is attached to this movement.</p> : <div className="mi-source-list">{sources.slice(0, 6).map((link) => <article key={link.id}>
              <div><strong>{link.source?.title || 'Knowledge source'}</strong><span>{pretty(link.evidence_class)}</span></div>
              <small>{[link.source?.publisher, link.reference_text || link.source?.reference_text].filter(Boolean).join(' · ')}</small>
            </article>)}</div>}
          </section>

          <section className="mi-guidance-library">
            <div className="mi-section-heading"><strong>Existing guidance</strong><span>{guidance.length} records</span></div>
            {guidance.length === 0 ? <p className="muted">No movement-specific guidance has been authored for this calibre yet.</p> : <div className="mi-guidance-list">{guidance.map((row) => <article key={row.id} className={!row.active ? 'inactive' : ''}>
              <header><div><span>{pretty(row.guidance_type)}</span><strong>{row.title}</strong></div><em>{row.inject_as_check ? 'Guided check' : 'Reference'}</em></header>
              <p>{row.instruction}</p>
              <small>{row.step_key} · {pretty(row.evidence_grade)} · {pretty(row.verification_status)}</small>
              <button type="button" className="secondary small" onClick={() => void toggleGuidance(row)}>{row.active ? 'Deactivate' : 'Reactivate'}</button>
            </article>)}</div>}
          </section>

          <section className="mi-author-card">
            <div className="mi-section-heading"><div><p className="eyebrow">AUTHOR GUIDANCE</p><strong>Where should Calibre surface this?</strong></div></div>
            <div className="mi-form-grid">
              <label>Procedure stage<select value={stepKey} onChange={(event) => setStepKey(event.target.value)}>{stages.map((stage) => <option key={stage.step_key} value={stage.step_key}>{stage.label} · {stage.template_name}</option>)}</select></label>
              <label>Guidance type<select value={guidanceType} onChange={(event) => setGuidanceType(event.target.value)}>{guidanceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="wide">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Barrel bridge screw is left-hand thread" /></label>
              <label className="wide">Instruction<textarea rows={3} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="State the practical bench guidance clearly and specifically." /></label>
              <label>Source<select value={sourceId} onChange={(event) => chooseSource(event.target.value)}><option value="">Choose source…</option>{sources.map((link) => <option key={link.source_id} value={link.source_id}>{link.source?.title || link.source_id}</option>)}</select></label>
              <label>Evidence grade<input value={evidenceGrade} onChange={(event) => setEvidenceGrade(event.target.value)} /></label>
              <label className="wide">Reference<textarea rows={2} value={referenceText} onChange={(event) => setReferenceText(event.target.value)} placeholder="Page, figure, calibre table or source note" /></label>
              {selectedSource?.source?.url && <a className="mi-source-link wide" href={selectedSource.source.url} target="_blank" rel="noreferrer">Open selected source ↗</a>}
              <label className="mi-checkline wide"><input type="checkbox" checked={injectAsCheck} onChange={(event) => setInjectAsCheck(event.target.checked)} />Inject this as a guided job check when useful</label>
              {injectAsCheck && <>
                <label>Check type<select value={checkType} onChange={(event) => setCheckType(event.target.value)}>{checkTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>Tool<select value={toolKey} onChange={(event) => setToolKey(event.target.value)}>{toolKeys.map((value) => <option key={value || 'none'} value={value}>{value || 'None'}</option>)}</select></label>
                <label>Answer type<select value={answerKind} onChange={(event) => setAnswerKind(event.target.value)}>{answerKinds.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="mi-checkline"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />Required check</label>
                {answerKind === 'choice' && <label className="wide">Choices <small>One per line: Label|value</small><textarea rows={4} value={answerOptions} onChange={(event) => setAnswerOptions(event.target.value)} /></label>}
                <label className="wide">Problem values <small>Comma separated answer values that should create/flag a problem.</small><input value={problemValues} onChange={(event) => setProblemValues(event.target.value)} /></label>
              </>}
            </div>
            <div className="mi-author-actions"><button type="button" className="secondary" onClick={clearEditor}>Clear</button><button type="button" onClick={() => void addGuidance()} disabled={saving || !selected || !stepKey || !title.trim() || !instruction.trim() || !sourceId}>{saving ? 'Saving…' : 'Save movement guidance'}</button></div>
          </section>
        </>}
      </section>
    </div>
  </div>
}
