import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-quick-capture.css'

type ActionKey = 'note' | 'measurement' | 'finding' | 'part' | 'timing' | 'blocked' | null
export type CaptureStep = { id: string; label: string; description: string; status: string }
type WaitingReason = 'parts' | 'research' | 'external_service' | 'customer' | 'tool_equipment' | 'other'
type TimingCheckpoint = 'pre_service' | 'post_reassembly' | 'regulation' | 'final_qc' | 'other'
type FindingType = 'observation' | 'fault' | 'damage' | 'performance' | 'cosmetic' | 'other'
type FindingSeverity = 'info' | 'minor' | 'moderate' | 'major' | 'critical'

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'bench-photo'
}

function suggestCheckpoint(step: CaptureStep | null): TimingCheckpoint {
  const text = `${step?.label ?? ''} ${step?.description ?? ''}`.toLowerCase()
  if (/final|qc|quality|timing.*final/.test(text)) return 'final_qc'
  if (/regulat|adjust.*rate|positional/.test(text)) return 'regulation'
  if (/reassembl|assembly|first.*run|post.?service/.test(text)) return 'post_reassembly'
  if (/intake|baseline|pre.?service|before.*service|initial.*timing/.test(text)) return 'pre_service'
  return 'other'
}

export default function WorkUnifiedCapture({ workspaceId, itemId, workId, workNumber, currentStep, onSaved, compact = false }: {
  workspaceId: string
  itemId: string
  workId: string
  workNumber: number
  currentStep: CaptureStep | null
  onSaved: () => Promise<void> | void
  compact?: boolean
}) {
  const [activeAction, setActiveAction] = useState<ActionKey>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const photoRef = useRef<HTMLInputElement | null>(null)
  const [note, setNote] = useState('')
  const [measurementType, setMeasurementType] = useState('')
  const [measurementValue, setMeasurementValue] = useState('')
  const [measurementUnit, setMeasurementUnit] = useState('mm')
  const [measurementNotes, setMeasurementNotes] = useState('')
  const [findingType, setFindingType] = useState<FindingType>('observation')
  const [findingSeverity, setFindingSeverity] = useState<FindingSeverity>('moderate')
  const [findingTitle, setFindingTitle] = useState('')
  const [findingDetails, setFindingDetails] = useState('')
  const [partType, setPartType] = useState('')
  const [partDescription, setPartDescription] = useState('')
  const [checkpoint, setCheckpoint] = useState<TimingCheckpoint>('other')
  const [bph, setBph] = useState('18000')
  const [rate, setRate] = useState('')
  const [beatError, setBeatError] = useState('')
  const [position, setPosition] = useState('dial_up')
  const [timingNotes, setTimingNotes] = useState('')
  const [blockedReason, setBlockedReason] = useState('')
  const [waitingReason, setWaitingReason] = useState<WaitingReason>('other')

  async function finishAction(successMessage: string) {
    setActiveAction(null)
    setMessage(successMessage)
    await onSaved()
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setMessage('Capture must be an image.')
      event.target.value = ''
      return
    }
    setSaving(true)
    const path = `${workspaceId}/${itemId}/bench/${crypto.randomUUID()}-${safeName(file.name)}`
    const storageResult = await supabase.storage.from('calibre-media').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
    if (storageResult.error) {
      setSaving(false)
      setMessage(`Photo upload failed: ${storageResult.error.message}`)
      event.target.value = ''
      return
    }
    const stepLabel = currentStep?.label ?? 'General Work evidence'
    const rowResult = await supabase.from('media_assets').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      work_id: workId,
      work_checklist_step_id: currentStep?.id ?? null,
      category: 'work_progress',
      role: 'work_capture_evidence',
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      byte_size: file.size,
      caption: `Work #${workNumber} · ${stepLabel}`,
      evidence_note: currentStep ? `Captured against checklist step: ${currentStep.label}` : 'General Work capture',
      is_cover: false,
      taken_at: new Date().toISOString(),
    })
    if (rowResult.error) {
      await supabase.storage.from('calibre-media').remove([path])
      setSaving(false)
      setMessage(`Photo record failed: ${rowResult.error.message}`)
      event.target.value = ''
      return
    }
    event.target.value = ''
    setSaving(false)
    await finishAction(currentStep ? `Photo attached to ${currentStep.label}.` : 'Photo saved to this Work.')
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault()
    const text = note.trim()
    if (!text || saving) return
    setSaving(true)
    const result = await supabase.from('work_events').insert({
      workspace_id: workspaceId,
      work_id: workId,
      item_id: itemId,
      event_type: 'work_note',
      summary: text,
      details: { source: 'unified_capture', checklist_step_id: currentStep?.id ?? null, checklist_step: currentStep?.label ?? null },
      actor_type: 'user',
    })
    setSaving(false)
    if (result.error) return setMessage(`Note could not be saved: ${result.error.message}`)
    setNote('')
    await finishAction('Observation saved to Work history.')
  }

  async function saveMeasurement(event: FormEvent) {
    event.preventDefault()
    const value = Number(measurementValue)
    if (!measurementType.trim() || !measurementUnit.trim() || !Number.isFinite(value) || saving) return
    setSaving(true)
    const result = await supabase.from('measurements').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      work_id: workId,
      measurement_type: measurementType.trim(),
      value,
      unit: measurementUnit.trim(),
      method: 'unified_capture',
      notes: [currentStep ? `Step: ${currentStep.label}` : '', measurementNotes.trim()].filter(Boolean).join(' · '),
    })
    setSaving(false)
    if (result.error) return setMessage(`Measurement could not be saved: ${result.error.message}`)
    setMeasurementValue('')
    setMeasurementNotes('')
    await finishAction('Measurement saved.')
  }

  async function saveFinding(event: FormEvent) {
    event.preventDefault()
    if (!findingTitle.trim() || saving) return
    setSaving(true)
    const result = await supabase.from('work_findings').insert({
      workspace_id: workspaceId,
      work_id: workId,
      item_id: itemId,
      finding_type: findingType,
      severity: findingSeverity,
      title: findingTitle.trim(),
      details: [currentStep ? `Step: ${currentStep.label}` : '', findingDetails.trim()].filter(Boolean).join(' · '),
      status: 'open',
    })
    setSaving(false)
    if (result.error) return setMessage(`Finding could not be saved: ${result.error.message}`)
    setFindingTitle('')
    setFindingDetails('')
    setFindingType('observation')
    setFindingSeverity('moderate')
    await finishAction('Finding added to the job.')
  }

  async function savePartNeed(event: FormEvent) {
    event.preventDefault()
    if ((!partType.trim() && !partDescription.trim()) || saving) return
    setSaving(true)
    const result = await supabase.from('work_part_needs').insert({
      workspace_id: workspaceId,
      work_record_id: workId,
      item_id: itemId,
      part_type: partType.trim(),
      description: [currentStep ? `Step: ${currentStep.label}` : '', partDescription.trim()].filter(Boolean).join(' · '),
      status: 'open',
    })
    setSaving(false)
    if (result.error) return setMessage(`Part need could not be saved: ${result.error.message}`)
    setPartType('')
    setPartDescription('')
    await finishAction('Part need added.')
  }

  async function saveTiming(event: FormEvent) {
    event.preventDefault()
    const parsedBph = Number(bph)
    const parsedRate = Number(rate)
    const parsedBeatError = beatError.trim() ? Number(beatError) : null
    if (!Number.isFinite(parsedBph) || !Number.isFinite(parsedRate) || (parsedBeatError != null && !Number.isFinite(parsedBeatError)) || saving) return
    setSaving(true)
    const result = await supabase.from('timing_runs').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      work_id: workId,
      checkpoint,
      bph: parsedBph,
      rate_seconds_per_day: parsedRate,
      beat_error_ms: parsedBeatError,
      amplitude_deg: null,
      lift_angle_deg: null,
      position,
      confidence: 'confirmed',
      device: 'manual_capture',
      notes: [currentStep ? `Step: ${currentStep.label}` : '', timingNotes.trim()].filter(Boolean).join(' · '),
    })
    setSaving(false)
    if (result.error) return setMessage(`Timing run could not be saved: ${result.error.message}`)
    setRate('')
    setBeatError('')
    setTimingNotes('')
    await finishAction('Timing run saved.')
  }

  async function saveBlocked(event: FormEvent) {
    event.preventDefault()
    const reason = blockedReason.trim()
    if (!reason || saving) return
    setSaving(true)
    if (currentStep) {
      const patch: Record<string, unknown> = { status: 'blocked', blocked_reason: reason, completed_at: null, updated_at: new Date().toISOString() }
      if (currentStep.status === 'not_started') patch.started_at = new Date().toISOString()
      const stepResult = await supabase.from('work_checklist_steps').update(patch).eq('workspace_id', workspaceId).eq('id', currentStep.id)
      if (stepResult.error) {
        setSaving(false)
        return setMessage(`Checklist step could not be blocked: ${stepResult.error.message}`)
      }
    }
    const workResult = await supabase.from('work_records').update({ status: 'waiting', waiting_reason: waitingReason, blocker: reason }).eq('workspace_id', workspaceId).eq('id', workId)
    setSaving(false)
    if (workResult.error) return setMessage(`Work could not be moved to Waiting: ${workResult.error.message}`)
    setBlockedReason('')
    await finishAction('Blocker recorded and Work moved to Waiting.')
  }

  function toggleTiming() {
    if (activeAction === 'timing') return setActiveAction(null)
    setCheckpoint(suggestCheckpoint(currentStep))
    setActiveAction('timing')
  }

  return (
    <section className={`bench-quick-capture ${compact ? 'unified-capture-compact' : ''}`} aria-label="Unified Work capture">
      <div className="bench-step-controls"><div><span>CAPTURE CONTEXT</span><strong>{currentStep?.label ?? 'General Work'}</strong></div></div>
      <div className="bench-quick-grid">
        <button type="button" onClick={() => photoRef.current?.click()} disabled={saving}><span>📷</span><strong>Photo</strong></button>
        <button type="button" className={activeAction === 'note' ? 'active' : ''} onClick={() => setActiveAction(activeAction === 'note' ? null : 'note')}><span>✎</span><strong>Observation</strong></button>
        <button type="button" className={activeAction === 'measurement' ? 'active' : ''} onClick={() => setActiveAction(activeAction === 'measurement' ? null : 'measurement')}><span>⌖</span><strong>Measure</strong></button>
        <button type="button" className={activeAction === 'finding' ? 'active' : ''} onClick={() => setActiveAction(activeAction === 'finding' ? null : 'finding')}><span>◇</span><strong>Finding</strong></button>
        <button type="button" className={activeAction === 'part' ? 'active' : ''} onClick={() => setActiveAction(activeAction === 'part' ? null : 'part')}><span>⚙</span><strong>Part needed</strong></button>
        <button type="button" className={activeAction === 'timing' ? 'active' : ''} onClick={toggleTiming}><span>◷</span><strong>Timing</strong></button>
        <button type="button" className={`warning ${activeAction === 'blocked' ? 'active' : ''}`} onClick={() => setActiveAction(activeAction === 'blocked' ? null : 'blocked')}><span>!</span><strong>Blocked</strong></button>
      </div>
      <input ref={photoRef} className="bench-photo-input" type="file" accept="image/*" capture="environment" onChange={(event) => void uploadPhoto(event)} />

      {activeAction === 'note' && <form className="bench-quick-form" onSubmit={saveNote}><label>Observation<textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you observe or decide?" /></label><div><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !note.trim()}>Save observation</button></div></form>}

      {activeAction === 'measurement' && <form className="bench-quick-form bench-quick-form-grid" onSubmit={saveMeasurement}><label>Measurement<input autoFocus value={measurementType} onChange={(e) => setMeasurementType(e.target.value)} placeholder="pivot_diameter, crystal_width…" /></label><label>Value<input inputMode="decimal" value={measurementValue} onChange={(e) => setMeasurementValue(e.target.value)} /></label><label>Unit<input value={measurementUnit} onChange={(e) => setMeasurementUnit(e.target.value)} /></label><label className="span-all">Notes<input value={measurementNotes} onChange={(e) => setMeasurementNotes(e.target.value)} /></label><div className="span-all"><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !measurementType.trim() || !measurementValue.trim()}>Save measurement</button></div></form>}

      {activeAction === 'finding' && <form className="bench-quick-form bench-quick-form-grid" onSubmit={saveFinding}><label>Type<select value={findingType} onChange={(e) => setFindingType(e.target.value as FindingType)}><option value="observation">Observation</option><option value="fault">Fault</option><option value="damage">Damage</option><option value="performance">Performance</option><option value="cosmetic">Cosmetic</option><option value="other">Other</option></select></label><label>Severity<select value={findingSeverity} onChange={(e) => setFindingSeverity(e.target.value as FindingSeverity)}><option value="info">Info</option><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="major">Major</option><option value="critical">Critical</option></select></label><label className="span-all">Finding<input autoFocus value={findingTitle} onChange={(e) => setFindingTitle(e.target.value)} placeholder="Balance staff bent, crystal chipped…" /></label><label className="span-all">Details<textarea rows={2} value={findingDetails} onChange={(e) => setFindingDetails(e.target.value)} /></label><div className="span-all"><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !findingTitle.trim()}>Save finding</button></div></form>}

      {activeAction === 'part' && <form className="bench-quick-form" onSubmit={savePartNeed}><label>Part type<input autoFocus value={partType} onChange={(e) => setPartType(e.target.value)} placeholder="balance staff, mainspring, crystal…" /></label><label>Requirement<textarea rows={2} value={partDescription} onChange={(e) => setPartDescription(e.target.value)} /></label><div><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || (!partType.trim() && !partDescription.trim())}>Add part need</button></div></form>}

      {activeAction === 'timing' && <form className="bench-quick-form bench-quick-form-grid" onSubmit={saveTiming}><label>Checkpoint<select value={checkpoint} onChange={(e) => setCheckpoint(e.target.value as TimingCheckpoint)}><option value="pre_service">Pre-service</option><option value="post_reassembly">Post-reassembly</option><option value="regulation">Regulation</option><option value="final_qc">Final QC</option><option value="other">Other</option></select></label><label>BPH<input inputMode="numeric" value={bph} onChange={(e) => setBph(e.target.value)} /></label><label>Rate s/day<input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label><label>Beat error ms<input inputMode="decimal" value={beatError} onChange={(e) => setBeatError(e.target.value)} /></label><label>Position<select value={position} onChange={(e) => setPosition(e.target.value)}><option value="dial_up">Dial up</option><option value="dial_down">Dial down</option><option value="crown_up">Crown up</option><option value="crown_down">Crown down</option><option value="crown_left">Crown left</option><option value="crown_right">Crown right</option><option value="other">Other</option></select></label><label className="span-all">Notes<input value={timingNotes} onChange={(e) => setTimingNotes(e.target.value)} /></label><div className="span-all"><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !rate.trim()}>Save timing</button></div></form>}

      {activeAction === 'blocked' && <form className="bench-quick-form" onSubmit={saveBlocked}><label>Blocked by<textarea autoFocus rows={2} value={blockedReason} onChange={(e) => setBlockedReason(e.target.value)} placeholder="What is preventing progress?" /></label><label>Waiting for<select value={waitingReason} onChange={(e) => setWaitingReason(e.target.value as WaitingReason)}><option value="parts">Parts</option><option value="research">Research</option><option value="external_service">External service</option><option value="customer">Customer</option><option value="tool_equipment">Tool / equipment</option><option value="other">Other</option></select></label><div><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !blockedReason.trim()}>Record blocker</button></div></form>}

      {message && <p className="bench-quick-message">{message}</p>}
    </section>
  )
}
