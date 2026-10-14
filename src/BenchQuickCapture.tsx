import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-quick-capture.css'

type ActionKey = 'note' | 'measurement' | 'part' | 'timing' | 'blocked' | null
type StepSummary = { id: string; label: string; description: string; status: string }
type WaitingReason = 'parts' | 'research' | 'external_service' | 'customer' | 'tool_equipment' | 'other'

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'bench-photo'
}

export default function BenchQuickCapture({
  workspaceId,
  itemId,
  workId,
  workNumber,
  currentStep,
  onSaved,
}: {
  workspaceId: string
  itemId: string
  workId: string
  workNumber: number
  currentStep: StepSummary | null
  onSaved: () => Promise<void> | void
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
  const [partType, setPartType] = useState('')
  const [partDescription, setPartDescription] = useState('')
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
      setMessage('Bench capture must be an image.')
      event.target.value = ''
      return
    }

    setSaving(true)
    setMessage('Saving bench photo…')
    const path = `${workspaceId}/${itemId}/bench/${crypto.randomUUID()}-${safeName(file.name)}`
    const storageResult = await supabase.storage.from('calibre-media').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })
    if (storageResult.error) {
      setSaving(false)
      setMessage(`Photo upload failed: ${storageResult.error.message}`)
      event.target.value = ''
      return
    }

    const stepLabel = currentStep?.label ?? 'General bench evidence'
    const rowResult = await supabase.from('media_assets').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      work_id: workId,
      work_checklist_step_id: currentStep?.id ?? null,
      category: 'work_progress',
      role: 'bench_step_evidence',
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      byte_size: file.size,
      caption: `Work #${workNumber} · ${stepLabel}`,
      evidence_note: currentStep ? `Bench Mode evidence for checklist step: ${currentStep.label}` : 'Bench Mode work evidence',
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
    await finishAction(currentStep ? `Photo attached to ${currentStep.label}.` : 'Bench photo saved to this Work.')
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
      details: {
        source: 'bench_mode',
        checklist_step_id: currentStep?.id ?? null,
        checklist_step: currentStep?.label ?? null,
      },
      actor_type: 'user',
    })
    setSaving(false)
    if (result.error) {
      setMessage(`Note could not be saved: ${result.error.message}`)
      return
    }
    setNote('')
    await finishAction('Bench note saved.')
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
      method: 'bench_mode',
      notes: [currentStep ? `Step: ${currentStep.label}` : '', measurementNotes.trim()].filter(Boolean).join(' · '),
    })
    setSaving(false)
    if (result.error) {
      setMessage(`Measurement could not be saved: ${result.error.message}`)
      return
    }
    setMeasurementValue('')
    setMeasurementNotes('')
    await finishAction('Measurement saved.')
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
    if (result.error) {
      setMessage(`Part need could not be saved: ${result.error.message}`)
      return
    }
    setPartType('')
    setPartDescription('')
    await finishAction('Part need added. Parts matching can now use it.')
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
      bph: parsedBph,
      rate_seconds_per_day: parsedRate,
      beat_error_ms: parsedBeatError,
      amplitude_deg: null,
      lift_angle_deg: null,
      position,
      confidence: 'confirmed',
      device: 'manual_bench',
      notes: [currentStep ? `Step: ${currentStep.label}` : '', timingNotes.trim()].filter(Boolean).join(' · '),
    })
    setSaving(false)
    if (result.error) {
      setMessage(`Timing run could not be saved: ${result.error.message}`)
      return
    }
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
      const stepPatch: Record<string, unknown> = {
        status: 'blocked',
        blocked_reason: reason,
        completed_at: null,
        updated_at: new Date().toISOString(),
      }
      if (currentStep.status === 'not_started') stepPatch.started_at = new Date().toISOString()
      const stepResult = await supabase.from('work_checklist_steps')
        .update(stepPatch)
        .eq('workspace_id', workspaceId)
        .eq('id', currentStep.id)
      if (stepResult.error) {
        setSaving(false)
        setMessage(`Checklist step could not be blocked: ${stepResult.error.message}`)
        return
      }
    }

    const workResult = await supabase.from('work_records')
      .update({ status: 'waiting', waiting_reason: waitingReason, blocker: reason })
      .eq('workspace_id', workspaceId)
      .eq('id', workId)

    setSaving(false)
    if (workResult.error) {
      setMessage(`Work could not be moved to Waiting: ${workResult.error.message}`)
      return
    }
    setBlockedReason('')
    await finishAction('Blocker recorded and Work moved to Waiting. Finish the bench session when you stop hands-on work.')
  }

  async function updateCurrentStep(status: 'in_progress' | 'done') {
    if (!currentStep || saving) return
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status, updated_at: now, blocked_reason: '' }
    if (currentStep.status === 'not_started') patch.started_at = now
    if (status === 'done') patch.completed_at = now
    else patch.completed_at = null

    setSaving(true)
    const result = await supabase.from('work_checklist_steps')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', currentStep.id)
    setSaving(false)
    if (result.error) {
      setMessage(`Step could not be updated: ${result.error.message}`)
      return
    }
    setMessage(status === 'done' ? 'Step completed.' : 'Step is now in progress.')
    await onSaved()
  }

  return (
    <section className="bench-quick-capture" aria-label="Bench quick actions">
      <div className="bench-step-controls">
        <div><span>CHECKLIST</span><strong>{currentStep?.label ?? 'No open step'}</strong></div>
        {currentStep && currentStep.status !== 'in_progress' && <button type="button" className="secondary" onClick={() => void updateCurrentStep('in_progress')} disabled={saving}>{currentStep.status === 'blocked' ? 'Resume step' : 'Begin step'}</button>}
        {currentStep && currentStep.status === 'in_progress' && <button type="button" onClick={() => void updateCurrentStep('done')} disabled={saving}>Complete step</button>}
      </div>

      <div className="bench-quick-grid">
        <button type="button" onClick={() => photoRef.current?.click()} disabled={saving}><span>📷</span><strong>Photo</strong></button>
        <button type="button" className={activeAction === 'note' ? 'active' : ''} onClick={() => setActiveAction(activeAction === 'note' ? null : 'note')}><span>✎</span><strong>Note</strong></button>
        <button type="button" className={activeAction === 'measurement' ? 'active' : ''} onClick={() => setActiveAction(activeAction === 'measurement' ? null : 'measurement')}><span>⌖</span><strong>Measure</strong></button>
        <button type="button" className={activeAction === 'part' ? 'active' : ''} onClick={() => setActiveAction(activeAction === 'part' ? null : 'part')}><span>⚙</span><strong>Part needed</strong></button>
        <button type="button" className={activeAction === 'timing' ? 'active' : ''} onClick={() => setActiveAction(activeAction === 'timing' ? null : 'timing')}><span>◷</span><strong>Timing</strong></button>
        <button type="button" className={`warning ${activeAction === 'blocked' ? 'active' : ''}`} onClick={() => setActiveAction(activeAction === 'blocked' ? null : 'blocked')}><span>!</span><strong>Blocked</strong></button>
      </div>

      <input ref={photoRef} className="bench-photo-input" type="file" accept="image/*" capture="environment" onChange={(event) => void uploadPhoto(event)} />

      {activeAction === 'note' && (
        <form className="bench-quick-form" onSubmit={saveNote}>
          <label>Bench note<textarea autoFocus rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observation, fault, decision, lubrication note…" /></label>
          <div><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !note.trim()}>Save note</button></div>
        </form>
      )}

      {activeAction === 'measurement' && (
        <form className="bench-quick-form bench-quick-form-grid" onSubmit={saveMeasurement}>
          <label>Measurement<input autoFocus value={measurementType} onChange={(event) => setMeasurementType(event.target.value)} placeholder="pivot_diameter, crystal_width…" /></label>
          <label>Value<input inputMode="decimal" value={measurementValue} onChange={(event) => setMeasurementValue(event.target.value)} placeholder="0.11" /></label>
          <label>Unit<input value={measurementUnit} onChange={(event) => setMeasurementUnit(event.target.value)} placeholder="mm" /></label>
          <label className="span-all">Notes<input value={measurementNotes} onChange={(event) => setMeasurementNotes(event.target.value)} placeholder="Optional context" /></label>
          <div className="span-all"><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !measurementType.trim() || !measurementValue.trim()}>Save measurement</button></div>
        </form>
      )}

      {activeAction === 'part' && (
        <form className="bench-quick-form" onSubmit={savePartNeed}>
          <label>Part type<input autoFocus value={partType} onChange={(event) => setPartType(event.target.value)} placeholder="balance staff, mainspring, crystal…" /></label>
          <label>Requirement<textarea rows={2} value={partDescription} onChange={(event) => setPartDescription(event.target.value)} placeholder="Reference, dimensions, failure or requirement…" /></label>
          <div><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || (!partType.trim() && !partDescription.trim())}>Add part need</button></div>
        </form>
      )}

      {activeAction === 'timing' && (
        <form className="bench-quick-form bench-quick-form-grid" onSubmit={saveTiming}>
          <label>BPH<input inputMode="numeric" value={bph} onChange={(event) => setBph(event.target.value)} /></label>
          <label>Rate s/day<input autoFocus inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="+12" /></label>
          <label>Beat error ms<input inputMode="decimal" value={beatError} onChange={(event) => setBeatError(event.target.value)} placeholder="0.6" /></label>
          <label>Position<select value={position} onChange={(event) => setPosition(event.target.value)}><option value="dial_up">Dial up</option><option value="dial_down">Dial down</option><option value="crown_up">Crown up</option><option value="crown_down">Crown down</option><option value="crown_left">Crown left</option><option value="crown_right">Crown right</option><option value="other">Other</option></select></label>
          <label className="span-all">Notes<input value={timingNotes} onChange={(event) => setTimingNotes(event.target.value)} placeholder="Power state or observation…" /></label>
          <div className="span-all"><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !rate.trim()}>Save run</button></div>
        </form>
      )}

      {activeAction === 'blocked' && (
        <form className="bench-quick-form" onSubmit={saveBlocked}>
          <label>Waiting for<select value={waitingReason} onChange={(event) => setWaitingReason(event.target.value as WaitingReason)}><option value="parts">Parts</option><option value="research">Research</option><option value="external_service">External service</option><option value="customer">Customer</option><option value="tool_equipment">Tool / equipment</option><option value="other">Other</option></select></label>
          <label>Blocker<textarea autoFocus rows={3} value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} placeholder="What prevents the current work from continuing?" /></label>
          <div><button type="button" className="secondary" onClick={() => setActiveAction(null)}>Cancel</button><button disabled={saving || !blockedReason.trim()}>Record blocker</button></div>
        </form>
      )}

      {message && <p className="bench-quick-message">{message}</p>}
    </section>
  )
}
