import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-qc-panel.css'

type QcStatus = 'pending' | 'passed' | 'failed' | 'na'
type QcCheck = { id: string; check_key: string; label: string; required: boolean; status: QcStatus; result_text: string; evidence_note: string; checked_at: string | null }
type WorkState = { type: string; status: string; repair_performed: string; completion_summary: string }
type PartNeed = { id: string; status: string }
type ChecklistStep = { id: string; required: boolean; status: string }

type Props = { workspaceId: string; itemId: string; workId: string }

const statuses: { value: QcStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'na', label: 'N/A' },
]

export default function WorkQcPanel({ workspaceId, itemId, workId }: Props) {
  const [checks, setChecks] = useState<QcCheck[]>([])
  const [work, setWork] = useState<WorkState | null>(null)
  const [needs, setNeeds] = useState<PartNeed[]>([])
  const [checklist, setChecklist] = useState<ChecklistStep[]>([])
  const [timingCount, setTimingCount] = useState(0)
  const [repairPerformed, setRepairPerformed] = useState('')
  const [completionSummary, setCompletionSummary] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    const [checksResult, workResult, needsResult, checklistResult, timingResult] = await Promise.all([
      supabase.from('work_qc_checks').select('id,check_key,label,required,status,result_text,evidence_note,checked_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('created_at', { ascending: true }),
      supabase.from('work_records').select('type,status,repair_performed,completion_summary').eq('workspace_id', workspaceId).eq('id', workId).single(),
      supabase.from('work_part_needs').select('id,status').eq('workspace_id', workspaceId).eq('work_record_id', workId),
      supabase.from('work_checklist_steps').select('id,required,status').eq('workspace_id', workspaceId).eq('work_id', workId),
      supabase.from('timing_runs').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('work_id', workId),
    ])
    setLoading(false)
    const error = checksResult.error ?? workResult.error ?? needsResult.error ?? checklistResult.error ?? timingResult.error
    if (error) {
      setMessage(`QC could not be loaded: ${error.message}`)
      return
    }
    const nextWork = workResult.data as WorkState
    setChecks((checksResult.data ?? []) as QcCheck[])
    setWork(nextWork)
    setNeeds((needsResult.data ?? []) as PartNeed[])
    setChecklist((checklistResult.data ?? []) as ChecklistStep[])
    setTimingCount(timingResult.count ?? 0)
    setRepairPerformed(nextWork.repair_performed || '')
    setCompletionSummary(nextWork.completion_summary || '')
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId])

  const readiness = useMemo(() => {
    const checklistOpen = checklist.filter((step) => step.required && !['done', 'na'].includes(step.status)).length
    const qcRemaining = checks.filter((check) => check.required && !['passed', 'na'].includes(check.status)).length
    const failed = checks.filter((check) => check.status === 'failed').length
    const partsOpen = needs.filter((need) => ['open', 'reserved'].includes(need.status)).length
    const summaryMissing = !completionSummary.trim()
    return {
      checklistOpen,
      qcRemaining,
      failed,
      partsOpen,
      summaryMissing,
      ready: checks.length > 0 && checklistOpen === 0 && qcRemaining === 0 && partsOpen === 0 && !summaryMissing,
    }
  }, [checks, needs, checklist, completionSummary])

  async function prepareQc() {
    setSaving(true)
    const { data, error } = await supabase.rpc('initialize_work_qc', { p_workspace_id: workspaceId, p_work_id: workId })
    setSaving(false)
    if (error) {
      setMessage(`QC could not be prepared: ${error.message}`)
      return
    }
    setMessage(`${Number(data ?? 0)} QC check${Number(data ?? 0) === 1 ? '' : 's'} added.`)
    await load()
  }

  async function updateCheck(check: QcCheck, patch: Partial<Pick<QcCheck, 'status' | 'result_text' | 'evidence_note'>>) {
    setSaving(true)
    const { error } = await supabase.from('work_qc_checks').update({
      ...patch,
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('id', check.id)
    setSaving(false)
    if (error) {
      setMessage(`QC check could not be updated: ${error.message}`)
      return
    }
    await load()
  }

  async function saveCompletion() {
    setSaving(true)
    const { error } = await supabase.from('work_records').update({
      repair_performed: repairPerformed.trim(),
      completion_summary: completionSummary.trim(),
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('id', workId)
    setSaving(false)
    if (error) {
      setMessage(`Completion summary could not be saved: ${error.message}`)
      return
    }
    setMessage('Completion summary saved.')
    await load()
  }

  async function completeWork() {
    if (!readiness.ready || saving || work?.status === 'complete') return
    setSaving(true)
    const { error } = await supabase.from('work_records').update({
      repair_performed: repairPerformed.trim(),
      completion_summary: completionSummary.trim(),
      status: 'complete',
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('id', workId)
    setSaving(false)
    if (error) {
      setMessage(`Work could not be completed: ${error.message}`)
      return
    }
    setMessage('Work completed. Required workshop evidence and signed QC were accepted.')
    await load()
  }

  if (loading) return <section className="section-card qc-card">Loading QC…</section>

  return (
    <section className="section-card qc-card">
      <div className="qc-heading">
        <div><p className="eyebrow">QC & COMPLETION</p><h3>Final evidence and sign-off</h3><p className="muted">Completion is blocked until required checklist steps, QC, open parts and the completion summary are resolved. QC decisions are stamped to the authenticated user.</p></div>
        <span className={readiness.ready ? 'qc-ready' : 'qc-not-ready'}>{work?.status === 'complete' ? 'Completed' : readiness.ready ? 'Ready' : 'Not ready'}</span>
      </div>

      {message && <p className="qc-message">{message}</p>}

      <div className="qc-readiness">
        <div><span>Checklist</span><strong>{readiness.checklistOpen ? `${readiness.checklistOpen} required` : 'Clear'}</strong></div>
        <div><span>Required QC</span><strong>{checks.length ? `${readiness.qcRemaining} remaining` : 'Not prepared'}</strong></div>
        <div><span>Parts</span><strong>{readiness.partsOpen ? `${readiness.partsOpen} unresolved` : 'Clear'}</strong></div>
        <div><span>Timing evidence</span><strong>{timingCount ? `${timingCount} run${timingCount === 1 ? '' : 's'}` : 'None'}</strong></div>
        <div><span>Summary</span><strong>{readiness.summaryMissing ? 'Missing' : 'Ready'}</strong></div>
      </div>

      {checks.length === 0 ? (
        <div className="qc-empty"><p className="muted">Prepare QC to create the permanent checks for this Work type. Moving a workshop job into QC also creates them automatically.</p><button type="button" disabled={saving} onClick={() => void prepareQc()}>{saving ? 'Preparing…' : 'Prepare QC'}</button></div>
      ) : (
        <div className="qc-list">{checks.map((check) => <article className={`qc-check qc-${check.status}`} key={check.id}>
          <div className="qc-check-top"><div><strong>{check.label}{check.required ? <span title="Required"> •</span> : null}</strong><small>{check.check_key === 'final_timing' && !timingCount ? 'No timing run is currently recorded.' : check.checked_at ? `Signed ${new Date(check.checked_at).toLocaleString('en-AU')}` : 'Awaiting check'}</small></div><select value={check.status} disabled={saving || work?.status === 'complete'} onChange={(event) => void updateCheck(check, { status: event.target.value as QcStatus })}>{statuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></div>
          <div className="qc-check-fields"><label>Result<input disabled={work?.status === 'complete'} defaultValue={check.result_text} onBlur={(event) => { if (event.target.value !== check.result_text) void updateCheck(check, { result_text: event.target.value.trim() }) }} placeholder="What was observed or tested?" /></label><label>Evidence note<input disabled={work?.status === 'complete'} defaultValue={check.evidence_note} onBlur={(event) => { if (event.target.value !== check.evidence_note) void updateCheck(check, { evidence_note: event.target.value.trim() }) }} placeholder="Measurement, photo reference, exception or reason for N/A…" /></label></div>
        </article>)}</div>
      )}

      <div className="qc-completion-fields">
        <label>Work performed<textarea disabled={work?.status === 'complete'} rows={3} value={repairPerformed} onChange={(event) => setRepairPerformed(event.target.value)} placeholder="What was actually repaired, serviced, replaced or adjusted?" /></label>
        <label>Completion summary<textarea disabled={work?.status === 'complete'} rows={3} value={completionSummary} onChange={(event) => setCompletionSummary(event.target.value)} placeholder="Final condition, outcome, remaining caveats and release state…" /></label>
      </div>
      <div className="qc-save-row">
        <button type="button" disabled={saving || work?.status === 'complete'} onClick={() => void saveCompletion()}>{saving ? 'Saving…' : 'Save completion record'}</button>
        <button type="button" className="primary" disabled={saving || !readiness.ready || work?.status === 'complete'} onClick={() => void completeWork()}>{work?.status === 'complete' ? 'Work completed' : saving ? 'Completing…' : 'Complete Work'}</button>
      </div>
      {!readiness.ready && work?.status !== 'complete' && <p className="muted">Complete Work unlocks only when the checklist, required QC, parts and completion summary are clear. The database re-checks the same evidence before accepting completion.</p>}
    </section>
  )
}
