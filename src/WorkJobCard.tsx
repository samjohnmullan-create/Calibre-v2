import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import WorkOperationsPanel from './WorkOperationsPanel'
import WorkInductionPlan from './WorkInductionPlan'
import './work-job-card.css'

type WorkStatus = 'queued' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete' | 'cancelled'
type WorkType = 'inspection' | 'service' | 'repair' | 'restoration' | 'cleaning' | 'assessment' | 'photography' | 'listing_prep' | 'qc' | 'other'
type StepStatus = 'not_started' | 'in_progress' | 'done' | 'na' | 'blocked'
type InductionStatus = 'pending' | 'in_progress' | 'complete' | 'legacy_skipped'
type JobPlanStatus = 'pending' | 'ready' | 'applied'

type WorkRecord = {
  id: string
  item_id: string
  work_number: number
  type: WorkType
  title: string
  status: WorkStatus
  waiting_reason: string | null
  priority: number
  next_action: string
  blocker: string
  diagnosis: string
  repair_performed: string
  notes: string
  template_id: string | null
  induction_status: InductionStatus
  job_plan_status: JobPlanStatus
  induction_started_at: string | null
  induction_completed_at: string | null
  opened_at: string
  started_at: string | null
  completed_at: string | null
}

type ChecklistStep = {
  id: string
  work_id: string
  step_key: string
  section_key: string
  phase: 'procedure' | 'final_qc'
  label: string
  description: string
  sequence: number
  required: boolean
  status: StepStatus
  notes: string
  blocked_reason: string
  started_at: string | null
  completed_at: string | null
}

type StorageLocation = {
  id: string
  parent_id: string | null
  name: string
  code: string | null
  sort_order: number
}

type StorageMove = {
  from_location_id: string | null
  to_location_id: string | null
  note: string
  moved_at: string
}

const workStatuses: { value: WorkStatus; label: string }[] = [
  { value: 'queued', label: 'Queue' },
  { value: 'ready', label: 'Ready' },
  { value: 'on_bench', label: 'On bench' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'qc', label: 'QC' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
]

const stepStatuses: { value: StepStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'na', label: 'N/A' },
  { value: 'blocked', label: 'Blocked' },
]

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function WorkJobCard({ workspaceId, itemId, focusWorkId }: { workspaceId: string; itemId: string; focusWorkId?: string | null }) {
  const [work, setWork] = useState<WorkRecord[]>([])
  const [selectedWorkId, setSelectedWorkId] = useState(focusWorkId ?? '')
  const [steps, setSteps] = useState<ChecklistStep[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [notes, setNotes] = useState('')
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [storageLocationId, setStorageLocationId] = useState<string | null>(null)
  const [storageHistory, setStorageHistory] = useState<StorageMove[]>([])
  const [storageDestination, setStorageDestination] = useState('')
  const [storageSaving, setStorageSaving] = useState(false)

  const selected = work.find((record) => record.id === selectedWorkId) ?? work[0] ?? null

  const locationPathById = useMemo(() => {
    const byId = new Map(locations.map((location) => [location.id, location]))
    const cache = new Map<string, string>()
    const build = (id: string, visited = new Set<string>()): string => {
      if (cache.has(id)) return cache.get(id) || ''
      if (visited.has(id)) return 'Invalid hierarchy'
      const location = byId.get(id)
      if (!location) return 'Unknown location'
      visited.add(id)
      const own = location.code ? `${location.code} · ${location.name}` : location.name
      const path = location.parent_id ? `${build(location.parent_id, visited)} / ${own}` : own
      cache.set(id, path)
      return path
    }
    for (const location of locations) build(location.id)
    return cache
  }, [locations])

  const currentStoragePath = storageLocationId ? locationPathById.get(storageLocationId) || 'Unknown location' : 'Needs put-away'
  const latestStorageMove = storageHistory[0] ?? null
  const returnLocationId = latestStorageMove?.to_location_id === storageLocationId ? latestStorageMove.from_location_id : null
  const returnStoragePath = returnLocationId ? locationPathById.get(returnLocationId) || 'Previous location' : ''
  const sortedLocations = useMemo(() => [...locations].sort((a, b) => (locationPathById.get(a.id) || a.name).localeCompare(locationPathById.get(b.id) || b.name)), [locations, locationPathById])

  async function loadWork(preferredId?: string) {
    if (!workspaceId || !itemId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('work_records')
      .select('id,item_id,work_number,type,title,status,waiting_reason,priority,next_action,blocker,diagnosis,repair_performed,notes,template_id,induction_status,job_plan_status,induction_started_at,induction_completed_at,opened_at,started_at,completed_at')
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
      .order('work_number', { ascending: false })
    setLoading(false)
    if (error) {
      setMessage(`Work could not be loaded: ${error.message}`)
      return
    }
    const rows = (data ?? []) as WorkRecord[]
    setWork(rows)
    const target = preferredId && rows.some((row) => row.id === preferredId)
      ? preferredId
      : focusWorkId && rows.some((row) => row.id === focusWorkId)
        ? focusWorkId
        : rows[0]?.id ?? ''
    setSelectedWorkId(target)
  }

  async function loadStorage() {
    if (!workspaceId || !itemId) return
    const [itemResult, locationResult, historyResult] = await Promise.all([
      supabase.from('items').select('storage_location_id').eq('workspace_id', workspaceId).eq('id', itemId).maybeSingle(),
      supabase.from('storage_locations').select('id,parent_id,name,code,sort_order').eq('workspace_id', workspaceId).order('sort_order', { ascending: true }).order('name', { ascending: true }).limit(500),
      supabase.from('storage_location_events').select('from_location_id,to_location_id,note,moved_at').eq('workspace_id', workspaceId).eq('entity_type', 'item').eq('entity_id', itemId).order('moved_at', { ascending: false }).limit(10),
    ])
    const error = itemResult.error ?? locationResult.error ?? historyResult.error
    if (error) {
      setMessage(`Physical location could not be loaded: ${error.message}`)
      return
    }
    const current = itemResult.data?.storage_location_id ?? null
    setLocations((locationResult.data ?? []) as StorageLocation[])
    setStorageLocationId(current)
    setStorageDestination(current || '')
    setStorageHistory((historyResult.data ?? []) as StorageMove[])
  }

  async function loadSteps(workId: string) {
    if (!workId) {
      setSteps([])
      return
    }
    const { data, error } = await supabase
      .from('work_checklist_steps')
      .select('id,work_id,step_key,section_key,phase,label,description,sequence,required,status,notes,blocked_reason,started_at,completed_at')
      .eq('workspace_id', workspaceId)
      .eq('work_id', workId)
      .order('sequence', { ascending: true })
    if (error) {
      setMessage(`Checklist could not be loaded: ${error.message}`)
      return
    }
    setSteps((data ?? []) as ChecklistStep[])
  }

  useEffect(() => {
    void loadWork(focusWorkId ?? undefined)
    void loadStorage()
  }, [workspaceId, itemId, focusWorkId])

  useEffect(() => {
    if (!selected) {
      setSteps([])
      setDiagnosis('')
      setNextAction('')
      setNotes('')
      return
    }
    setDiagnosis(selected.diagnosis || '')
    setNextAction(selected.next_action || '')
    setNotes(selected.notes || '')
    void loadSteps(selected.id)
  }, [selected?.id])

  const progress = useMemo(() => {
    const completed = steps.filter((step) => step.status === 'done' || step.status === 'na').length
    const requiredOpen = steps.filter((step) => step.required && step.status !== 'done' && step.status !== 'na').length
    return { completed, total: steps.length, requiredOpen, percent: steps.length ? Math.round((completed / steps.length) * 100) : 0 }
  }, [steps])

  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistStep[]>()
    for (const step of steps) {
      const key = step.phase === 'final_qc' ? 'final_qc' : step.section_key
      const list = map.get(key) ?? []
      list.push(step)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [steps])

  async function refreshSelected() {
    if (!selected) return
    await loadWork(selected.id)
    await loadSteps(selected.id)
  }

  async function moveItemStorage(destinationId: string, note: string) {
    if (storageSaving || destinationId === (storageLocationId || '')) return
    setStorageSaving(true)
    const { error } = await supabase.rpc('move_storage_entity', {
      p_workspace_id: workspaceId,
      p_entity_type: 'item',
      p_entity_id: itemId,
      p_to_location_id: destinationId || null,
      p_note: note,
    })
    setStorageSaving(false)
    if (error) {
      setMessage(`Physical location could not be changed: ${error.message}`)
      return
    }
    setMessage(destinationId ? 'Physical location updated. Work status was left unchanged.' : 'Item marked as needing put-away. Work status was left unchanged.')
    await loadStorage()
  }

  function storagePanel() {
    return (
      <section className="section-card work-job-storage">
        <div className="work-job-storage-copy">
          <p className="eyebrow">PHYSICAL LOCATION</p>
          <h3>{currentStoragePath}</h3>
          <p className="muted">Location and Work status are independent. Moving this Item does not start, pause or complete the job.</p>
        </div>
        <div className="work-job-storage-actions">
          <label>Move Item
            <select value={storageDestination} onChange={(event) => setStorageDestination(event.target.value)} disabled={storageSaving}>
              <option value="">Needs put-away / unassigned</option>
              {sortedLocations.map((location) => <option key={location.id} value={location.id}>{locationPathById.get(location.id) || location.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void moveItemStorage(storageDestination, selected ? `Moved from Work #${selected.work_number} Job Card` : 'Moved from Item Work tab')} disabled={storageSaving || storageDestination === (storageLocationId || '')}>{storageSaving ? 'Moving…' : 'Move'}</button>
          {returnLocationId && returnLocationId !== storageLocationId && (
            <button type="button" className="secondary" onClick={() => void moveItemStorage(returnLocationId, selected ? `Returned from Work #${selected.work_number} Job Card` : 'Returned from Item Work tab')} disabled={storageSaving}>Return to {returnStoragePath}</button>
          )}
        </div>
      </section>
    )
  }

  async function startWork() {
    if (saving) return
    setSaving(true)
    setMessage('Creating workshop job…')
    const { data, error } = await supabase.rpc('start_work', {
      p_workspace_id: workspaceId,
      p_item_id: itemId,
      p_type: 'assessment',
      p_title: 'Workshop job',
      p_template_id: null,
    })
    setSaving(false)
    if (error) {
      setMessage(`Workshop job could not be started: ${error.message}`)
      return
    }
    const created = (Array.isArray(data) ? data[0] : data) as WorkRecord | null
    setMessage('Workshop job created. Start with induction before choosing the repair plan.')
    await loadWork(created?.id)
  }

  async function updateWorkStatus(status: WorkStatus) {
    if (!selected || saving) return
    setSaving(true)
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status, updated_at: now }
    if (status === 'on_bench' && !selected.started_at) patch.started_at = now
    if (status === 'complete') patch.completed_at = now
    if (status !== 'complete') patch.completed_at = null
    const { error } = await supabase.from('work_records').update(patch).eq('workspace_id', workspaceId).eq('id', selected.id)
    setSaving(false)
    if (error) {
      setMessage(`Work status could not be changed: ${error.message}`)
      return
    }
    setMessage(status === 'complete' ? 'Work completed.' : `Work moved to ${titleCase(status)}.`)
    await loadWork(selected.id)
  }

  async function saveWorkNotes() {
    if (!selected || saving) return
    setSaving(true)
    const { error } = await supabase.from('work_records').update({
      diagnosis: diagnosis.trim(),
      next_action: nextAction.trim(),
      notes: notes.trim(),
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('id', selected.id)
    setSaving(false)
    if (error) {
      setMessage(`Job notes could not be saved: ${error.message}`)
      return
    }
    setMessage('Job notes saved.')
    await loadWork(selected.id)
  }

  async function updateStep(step: ChecklistStep, status: StepStatus) {
    if (saving) return
    setSaving(true)
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status, updated_at: now }
    if ((status === 'in_progress' || status === 'done' || status === 'blocked') && !step.started_at) patch.started_at = now
    if (status === 'done' || status === 'na') patch.completed_at = now
    else patch.completed_at = null
    if (status !== 'blocked') patch.blocked_reason = ''
    const { error } = await supabase.from('work_checklist_steps').update(patch).eq('workspace_id', workspaceId).eq('id', step.id)
    setSaving(false)
    if (error) {
      setMessage(`Checklist step could not be updated: ${error.message}`)
      return
    }
    await loadSteps(step.work_id)
  }

  async function saveStepText(step: ChecklistStep, field: 'notes' | 'blocked_reason', value: string) {
    const { error } = await supabase.from('work_checklist_steps').update({ [field]: value.trim(), updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('id', step.id)
    if (error) setMessage(`Checklist note could not be saved: ${error.message}`)
    else await loadSteps(step.work_id)
  }

  if (loading) return <div className="loading-card">Loading job card…</div>

  if (!selected) {
    return (
      <div className="work-job-shell">
        {storagePanel()}
        <section className="section-card work-job-empty">
          <div>
            <p className="eyebrow">WORKSHOP</p>
            <h3>No workshop job yet</h3>
            <p className="muted">Bring the Item into Work with an induction first. Calibre will record how it arrived, what works and what does not before you choose any repair procedure.</p>
          </div>
          <div className="work-job-start-row">
            <button type="button" onClick={startWork} disabled={saving}>{saving ? 'Creating…' : 'Start Workshop Job'}</button>
          </div>
          {message && <p className="work-job-message">{message}</p>}
        </section>
      </div>
    )
  }

  const showProcedureChecklist = selected.job_plan_status === 'applied' || selected.induction_status === 'legacy_skipped'

  return (
    <div className="work-job-shell">
      <section className="section-card work-job-summary">
        <div className="work-job-heading">
          <div>
            <p className="eyebrow">JOB CARD · WORK #{selected.work_number}</p>
            <h3>{selected.title}</h3>
            <p className="muted">{selected.induction_status === 'legacy_skipped' ? titleCase(selected.type) : 'Induction → Job plan → Work → Final QC'} · opened {new Date(selected.opened_at).toLocaleDateString('en-AU')}</p>
          </div>
          <label className="work-job-status">Status<select value={selected.status} disabled={saving} onChange={(event) => void updateWorkStatus(event.target.value as WorkStatus)}>{workStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>

        {work.length > 1 && <label className="work-job-switcher">Work record<select value={selected.id} onChange={(event) => setSelectedWorkId(event.target.value)}>{work.map((record) => <option key={record.id} value={record.id}>#{record.work_number} · {record.title} · {titleCase(record.status)}</option>)}</select></label>}

        <div className="work-job-fields">
          <label>Diagnosis<textarea rows={3} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} placeholder="Diagnosis develops from induction findings and workshop evidence…" /></label>
          <label>Next action<input value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="What should happen next?" /></label>
          <label className="span-2">Job notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Workshop notes that belong to this Work record…" /></label>
        </div>
        <div className="work-job-save-row"><button type="button" onClick={saveWorkNotes} disabled={saving}>{saving ? 'Saving…' : 'Save job notes'}</button></div>
        {message && <p className="work-job-message">{message}</p>}
      </section>

      {storagePanel()}

      <WorkInductionPlan workspaceId={workspaceId} itemId={itemId} workId={selected.id} onChanged={refreshSelected} />

      {showProcedureChecklist && (
        <section className="section-card work-job-checklist-card">
          <div className="work-job-checklist-heading">
            <div><p className="eyebrow">WORK PLAN CHECKLIST</p><h3>{steps.length ? `${progress.completed} of ${progress.total} steps cleared` : 'No procedure steps'}</h3></div>
            {steps.length > 0 && <div className="work-job-progress-meta"><strong>{progress.percent}%</strong><span>{progress.requiredOpen} required remaining</span></div>}
          </div>

          {steps.length > 0 && <div className="work-job-progress"><span style={{ width: `${progress.percent}%` }} /></div>}

          {steps.length === 0 ? (
            <div className="work-job-no-checklist"><p className="muted">The job plan is applied but there are no generated checklist steps. Review the plan or continue with documented ad-hoc work.</p></div>
          ) : (
            <div className="work-job-sections">
              {grouped.map(([section, sectionSteps]) => (
                <section className={`work-job-section phase-${section === 'final_qc' ? 'final-qc' : 'procedure'}`} key={section}>
                  <div className="work-job-section-title"><strong>{section === 'final_qc' ? 'Final QC' : titleCase(section)}</strong><span>{sectionSteps.filter((step) => step.status === 'done' || step.status === 'na').length}/{sectionSteps.length}</span></div>
                  <div className="work-job-step-list">
                    {sectionSteps.map((step) => (
                      <article className={`work-job-step step-${step.status}`} key={step.id}>
                        <div className="work-job-step-main">
                          <div className="work-job-step-copy"><strong>{step.label}{step.required ? <span className="required-dot" title="Required">•</span> : null}</strong>{step.description && <p>{step.description}</p>}</div>
                          <select aria-label={`${step.label} status`} value={step.status} disabled={saving} onChange={(event) => void updateStep(step, event.target.value as StepStatus)}>{stepStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                        </div>
                        <details className="work-job-step-notes">
                          <summary>Notes{step.notes ? ' · saved' : ''}{step.status === 'blocked' && step.blocked_reason ? ' · blocker saved' : ''}</summary>
                          <label>Step notes<textarea defaultValue={step.notes} rows={2} onBlur={(event) => void saveStepText(step, 'notes', event.target.value)} placeholder="Measurements, observations, parts, lubrication or anything unusual…" /></label>
                          {step.status === 'blocked' && <label>Blocked by<textarea defaultValue={step.blocked_reason} rows={2} onBlur={(event) => void saveStepText(step, 'blocked_reason', event.target.value)} placeholder="What is preventing this step from being completed?" /></label>}
                        </details>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}

      <WorkOperationsPanel workspaceId={workspaceId} itemId={itemId} workId={selected.id} />
    </div>
  )
}
