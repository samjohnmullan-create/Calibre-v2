import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import WorkPartsMatcher from './WorkPartsMatcher'
import WorkQcPanel from './WorkQcPanel'
import WorkTimingWorkflow from './WorkTimingWorkflow'
import WorkNextBestAction from './WorkNextBestAction'
import './work-operations-panel.css'

type WorkEvent = { id: string; event_type: string; summary: string; details: Record<string, unknown>; actor_type: string; created_at: string }
type Measurement = { id: string; measurement_type: string; value: number; unit: string; method: string; notes: string; measured_at: string }
type PartNeed = { id: string; part_type: string; description: string; status: string; created_at: string }
type Allocation = { id: string; part_id: string; quantity: number; status: string; note: string; used_at: string | null }
type Part = { id: string; part_type: string; manufacturer: string; reference: string; description: string }

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function when(value: string) {
  return new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function WorkOperationsPanel({ workspaceId, itemId, workId }: { workspaceId: string; itemId: string; workId: string }) {
  const [events, setEvents] = useState<WorkEvent[]>([])
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [needs, setNeeds] = useState<PartNeed[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [partsById, setPartsById] = useState<Map<string, Part>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [measurementType, setMeasurementType] = useState('case_width')
  const [measurementValue, setMeasurementValue] = useState('')
  const [measurementUnit, setMeasurementUnit] = useState('mm')
  const [measurementNotes, setMeasurementNotes] = useState('')

  const [partType, setPartType] = useState('')
  const [partDescription, setPartDescription] = useState('')
  const [historyNote, setHistoryNote] = useState('')

  async function load() {
    if (!workId) return
    setLoading(true)
    const [eventResult, measurementResult, needsResult, allocationResult] = await Promise.all([
      supabase.from('work_events').select('id,event_type,summary,details,actor_type,created_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('created_at', { ascending: false }).limit(50),
      supabase.from('measurements').select('id,measurement_type,value,unit,method,notes,measured_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('measured_at', { ascending: false }).limit(50),
      supabase.from('work_part_needs').select('id,part_type,description,status,created_at').eq('workspace_id', workspaceId).eq('work_record_id', workId).order('created_at', { ascending: false }),
      supabase.from('part_allocations').select('id,part_id,quantity,status,note,used_at').eq('workspace_id', workspaceId).eq('work_record_id', workId).order('created_at', { ascending: false }),
    ])
    setLoading(false)
    const error = eventResult.error ?? measurementResult.error ?? needsResult.error ?? allocationResult.error
    if (error) {
      setMessage(`Workshop details could not be loaded: ${error.message}`)
      return
    }
    setEvents((eventResult.data ?? []) as WorkEvent[])
    setMeasurements((measurementResult.data ?? []) as Measurement[])
    setNeeds((needsResult.data ?? []) as PartNeed[])
    const nextAllocations = (allocationResult.data ?? []) as Allocation[]
    setAllocations(nextAllocations)
    const ids = [...new Set(nextAllocations.map((row) => row.part_id))]
    if (ids.length === 0) {
      setPartsById(new Map())
      return
    }
    const { data: partRows, error: partsError } = await supabase.from('parts').select('id,part_type,manufacturer,reference,description').eq('workspace_id', workspaceId).in('id', ids)
    if (partsError) {
      setMessage(`Parts detail could not be loaded: ${partsError.message}`)
      return
    }
    setPartsById(new Map(((partRows ?? []) as Part[]).map((part) => [part.id, part])))
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId])

  const usedParts = useMemo(() => allocations.filter((allocation) => allocation.status === 'used'), [allocations])

  async function refreshWorkState() {
    setRefreshKey((value) => value + 1)
    await load()
  }

  async function addMeasurement(event: FormEvent) {
    event.preventDefault()
    const value = Number(measurementValue)
    if (!measurementType.trim() || !measurementUnit.trim() || !Number.isFinite(value)) return
    setSaving(true)
    const { error } = await supabase.from('measurements').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      work_id: workId,
      measurement_type: measurementType.trim(),
      value,
      unit: measurementUnit.trim(),
      method: 'manual',
      notes: measurementNotes.trim(),
    })
    setSaving(false)
    if (error) {
      setMessage(`Measurement could not be saved: ${error.message}`)
      return
    }
    setMeasurementValue('')
    setMeasurementNotes('')
    setMessage('Measurement saved.')
    await refreshWorkState()
  }

  async function addPartNeed(event: FormEvent) {
    event.preventDefault()
    if (!partType.trim() && !partDescription.trim()) return
    setSaving(true)
    const { error } = await supabase.from('work_part_needs').insert({
      workspace_id: workspaceId,
      work_record_id: workId,
      item_id: itemId,
      part_type: partType.trim(),
      description: partDescription.trim(),
      status: 'open',
    })
    setSaving(false)
    if (error) {
      setMessage(`Part need could not be saved: ${error.message}`)
      return
    }
    setPartType('')
    setPartDescription('')
    setMessage('Part need added.')
    await refreshWorkState()
  }

  async function setNeedStatus(need: PartNeed, status: string) {
    setSaving(true)
    const { error } = await supabase.from('work_part_needs').update({ status, updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('id', need.id)
    setSaving(false)
    if (error) {
      setMessage(`Part need could not be updated: ${error.message}`)
      return
    }
    await refreshWorkState()
  }

  async function addHistoryNote(event: FormEvent) {
    event.preventDefault()
    if (!historyNote.trim()) return
    setSaving(true)
    const { error } = await supabase.from('work_events').insert({
      workspace_id: workspaceId,
      work_id: workId,
      item_id: itemId,
      event_type: 'work_note',
      summary: historyNote.trim(),
      details: {},
      actor_type: 'user',
    })
    setSaving(false)
    if (error) {
      setMessage(`Work note could not be saved: ${error.message}`)
      return
    }
    setHistoryNote('')
    setMessage('Work history note added.')
    await refreshWorkState()
  }

  if (loading) return <div className="section-card work-ops-loading">Loading workshop records…</div>

  return (
    <div className="work-ops-shell">
      <WorkNextBestAction workspaceId={workspaceId} itemId={itemId} workId={workId} refreshKey={refreshKey} onChanged={refreshWorkState} />

      {message && <p className="work-ops-message">{message}</p>}

      <section className="section-card work-ops-card">
        <div className="work-ops-heading"><div><p className="eyebrow">MEASUREMENTS</p><h3>Bench measurements</h3></div><span>{measurements.length}</span></div>
        <form className="work-ops-form four" onSubmit={addMeasurement}>
          <label>Type<input value={measurementType} onChange={(event) => setMeasurementType(event.target.value)} placeholder="case_width" /></label>
          <label>Value<input inputMode="decimal" value={measurementValue} onChange={(event) => setMeasurementValue(event.target.value)} placeholder="35" /></label>
          <label>Unit<input value={measurementUnit} onChange={(event) => setMeasurementUnit(event.target.value)} placeholder="mm" /></label>
          <button disabled={saving || !measurementValue.trim()}>Add</button>
          <label className="span-all">Notes<input value={measurementNotes} onChange={(event) => setMeasurementNotes(event.target.value)} placeholder="How/where measured, tolerances, anything unusual…" /></label>
        </form>
        <div className="work-ops-list">{measurements.length === 0 ? <p className="muted">No measurements recorded for this job.</p> : measurements.map((measurement) => <div className="work-ops-row" key={measurement.id}><div><strong>{titleCase(measurement.measurement_type)}</strong><span>{measurement.notes || 'Manual measurement'}</span></div><div className="work-ops-value">{Number(measurement.value)} {measurement.unit}<small>{when(measurement.measured_at)}</small></div></div>)}</div>
      </section>

      <WorkTimingWorkflow workspaceId={workspaceId} itemId={itemId} workId={workId} />

      <section className="section-card work-ops-card">
        <div className="work-ops-heading"><div><p className="eyebrow">PARTS</p><h3>Needed & used</h3></div><span>{needs.filter((need) => need.status === 'open').length} open</span></div>
        <form className="work-ops-form parts" onSubmit={addPartNeed}>
          <label>Part type<input value={partType} onChange={(event) => setPartType(event.target.value)} placeholder="mainspring, crystal, balance staff…" /></label>
          <label>Description<input value={partDescription} onChange={(event) => setPartDescription(event.target.value)} placeholder="Reference, size, symptoms or requirement…" /></label>
          <button disabled={saving || (!partType.trim() && !partDescription.trim())}>Add need</button>
        </form>
        <div className="work-ops-split">
          <div><h4>Requirements</h4>{needs.length === 0 ? <p className="muted">No parts required yet.</p> : <div className="work-ops-list">{needs.map((need) => <div className="work-ops-row" key={need.id}><div><strong>{need.part_type || 'Part required'}</strong><span>{need.description || 'No description'}</span></div><select value={need.status} disabled={saving} onChange={(event) => void setNeedStatus(need, event.target.value)}><option value="open">Open</option><option value="reserved">Reserved</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option></select></div>)}</div>}</div>
          <div><h4>Used from stock</h4>{usedParts.length === 0 ? <p className="muted">No allocated parts have been consumed on this job.</p> : <div className="work-ops-list">{usedParts.map((allocation) => { const part = partsById.get(allocation.part_id); return <div className="work-ops-row" key={allocation.id}><div><strong>{part ? [part.manufacturer, part.reference].filter(Boolean).join(' ') || part.part_type : 'Stock part'}</strong><span>{part?.description || allocation.note || 'Part used'}</span></div><div className="work-ops-value">×{Number(allocation.quantity)}<small>{allocation.used_at ? when(allocation.used_at) : 'Used'}</small></div></div> })}</div>}</div>
        </div>
      </section>

      <WorkPartsMatcher workspaceId={workspaceId} itemId={itemId} workId={workId} />
      <WorkQcPanel workspaceId={workspaceId} itemId={itemId} workId={workId} />

      <section className="section-card work-ops-card">
        <div className="work-ops-heading"><div><p className="eyebrow">HISTORY</p><h3>Work timeline</h3></div><span>{events.length}</span></div>
        <form className="work-ops-history-form" onSubmit={addHistoryNote}><input value={historyNote} onChange={(event) => setHistoryNote(event.target.value)} placeholder="Add a workshop note to the permanent history…" /><button disabled={saving || !historyNote.trim()}>Add note</button></form>
        <div className="work-ops-timeline">{events.length === 0 ? <p className="muted">History will build as the job moves through the workshop.</p> : events.map((event) => <div className="work-ops-event" key={event.id}><span className="work-ops-dot" /><div><strong>{event.summary}</strong><p>{titleCase(event.event_type)} · {titleCase(event.actor_type)} · {when(event.created_at)}</p></div></div>)}</div>
      </section>
    </div>
  )
}
