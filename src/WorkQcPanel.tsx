import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-qc-panel.css'

type QcStatus = 'pending' | 'passed' | 'failed' | 'na'
type QcCheck = { id: string; check_key: string; label: string; required: boolean; status: QcStatus; result_text: string; evidence_note: string; checked_at: string | null }
type WorkState = { type: string; status: string; repair_performed: string; completion_summary: string }
type PartNeed = { id: string; status: string }
type ChecklistStep = { id: string; required: boolean; status: string }

type Props = { workspaceId: string; itemId: string; workId: string }

const releaseStatuses: { value: Exclude<QcStatus, 'na'>; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'passed', label: 'Release approved' },
  { value: 'failed', label: 'Hold / not ready' },
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
      setMessage(`Release state could not be loaded: ${error.message}`)
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

  const releaseCheck = useMemo(() => checks.find((check) => check.check_key === 'release_signoff') ?? null, [checks])
  const legacyChecks = useMemo(() => checks.filter((check) => check.check_key !== 'release_signoff'), [checks])

  const readiness = useMemo(() => {
    const checklistOpen = checklist.filter((step) => step.required && !['done', 'na'].includes(step.status)).length
    const partsOpen = needs.filter((need) => ['open', 'reserved'].includes(need.status)).length
    const summaryMissing = !completionSummary.trim()
    const releaseApproved = releaseCheck?.status === 'passed' && Boolean(releaseCheck.checked_at)
    return {
      checklistOpen,
      partsOpen,
      summaryMissing,
      releaseApproved,
      ready: checklistOpen === 0 && partsOpen === 0 && !summaryMissing && releaseApproved,
    }
  }, [releaseCheck, needs, checklist, completionSummary])

  async function prepareRelease() {
    setSaving(true)
    const { data, error } = await supabase.rpc('initialize_work_qc', { p_workspace_id: workspaceId, p_work_id: workId })
    setSaving(false)
    if (error) {
      setMessage(`Release sign-off could not be prepared: ${error.message}`)
      return
    }
    setMessage(Number(data ?? 0) > 0 ? 'Release sign-off prepared.' : 'Release sign-off is already prepared.')
    await load()
  }

  async function updateRelease(patch: Partial<Pick<QcCheck, 'status' | 'result_text' | 'evidence_note'>>) {
    if (!releaseCheck) return
    setSaving(true)
    const { error } = await supabase.from('work_qc_checks').update({
      ...patch,
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('id', releaseCheck.id)
    setSaving(false)
    if (error) {
      setMessage(`Release sign-off could not be updated: ${error.message}`)
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
    setMessage('Completion record saved.')
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
    setMessage('Work completed. Final Verification and Release sign-off were accepted.')
    await load()
  }

  if (loading) return <section className="section-card qc-card">Loading release state…</section>

  return (
    <section className="section-card qc-card">
      <div className="qc-heading">
        <div><p className="eyebrow">RELEASE</p><h3>Final sign-off</h3><p className="muted">Final Verification contains the actual function, timing, presentation and evidence checks. Release is deliberately short: review that work, record the outcome, then approve the watch to leave the workshop.</p></div>
        <span className={readiness.ready ? 'qc-ready' : 'qc-not-ready'}>{work?.status === 'complete' ? 'Completed' : readiness.ready ? 'Ready to close' : 'Not ready'}</span>
      </div>

      {message && <p className="qc-message">{message}</p>}

      <div className="qc-readiness">
        <div><span>Final Verification</span><strong>{readiness.checklistOpen ? `${readiness.checklistOpen} required` : 'Clear'}</strong></div>
        <div><span>Parts</span><strong>{readiness.partsOpen ? `${readiness.partsOpen} unresolved` : 'Clear'}</strong></div>
        <div><span>Timing evidence</span><strong>{timingCount ? `${timingCount} run${timingCount === 1 ? '' : 's'}` : 'None'}</strong></div>
        <div><span>Completion summary</span><strong>{readiness.summaryMissing ? 'Missing' : 'Ready'}</strong></div>
        <div><span>Release</span><strong>{releaseCheck ? releaseCheck.status === 'passed' ? 'Approved' : releaseCheck.status === 'failed' ? 'On hold' : 'Pending' : 'Not prepared'}</strong></div>
      </div>

      {!releaseCheck ? (
        <div className="qc-empty"><p className="muted">Prepare the final Release sign-off. Workshop tests are not duplicated here; they remain in Final Verification.</p><button type="button" disabled={saving} onClick={() => void prepareRelease()}>{saving ? 'Preparing…' : 'Prepare Release'}</button></div>
      ) : (
        <article className={`qc-check qc-${releaseCheck.status}`}>
          <div className="qc-check-top"><div><strong>Release approval</strong><small>{releaseCheck.checked_at ? `Signed ${new Date(releaseCheck.checked_at).toLocaleString('en-AU')}` : 'Review Final Verification before approval'}</small></div><select value={releaseCheck.status === 'na' ? 'pending' : releaseCheck.status} disabled={saving || work?.status === 'complete'} onChange={(event) => void updateRelease({ status: event.target.value as Exclude<QcStatus, 'na'> })}>{releaseStatuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></div>
          <div className="qc-check-fields">
            <label>Release result<input disabled={work?.status === 'complete'} defaultValue={releaseCheck.result_text} onBlur={(event) => { if (event.target.value !== releaseCheck.result_text) void updateRelease({ result_text: event.target.value.trim() }) }} placeholder="Released, held, returned to bench…" /></label>
            <label>Release note / caveats<input disabled={work?.status === 'complete'} defaultValue={releaseCheck.evidence_note} onBlur={(event) => { if (event.target.value !== releaseCheck.evidence_note) void updateRelease({ evidence_note: event.target.value.trim() }) }} placeholder="Any caveat the final record should retain…" /></label>
          </div>
        </article>
      )}

      {legacyChecks.length > 0 && <details className="qc-empty"><summary>Previous QC records · {legacyChecks.length}</summary><div className="qc-list">{legacyChecks.map((check) => <article className={`qc-check qc-${check.status}`} key={check.id}><div className="qc-check-top"><div><strong>{check.label}</strong><small>Legacy QC record · preserved for history</small></div><span>{check.status.replaceAll('_', ' ')}</span></div></article>)}</div></details>}

      <div className="qc-completion-fields">
        <label>Work performed<textarea disabled={work?.status === 'complete'} rows={3} value={repairPerformed} onChange={(event) => setRepairPerformed(event.target.value)} placeholder="What was actually repaired, serviced, replaced or adjusted?" /></label>
        <label>Completion summary<textarea disabled={work?.status === 'complete'} rows={3} value={completionSummary} onChange={(event) => setCompletionSummary(event.target.value)} placeholder="Final condition, outcome, remaining caveats and release state…" /></label>
      </div>
      <div className="qc-save-row">
        <button type="button" disabled={saving || work?.status === 'complete'} onClick={() => void saveCompletion()}>{saving ? 'Saving…' : 'Save completion record'}</button>
        <button type="button" className="primary" disabled={saving || !readiness.ready || work?.status === 'complete'} onClick={() => void completeWork()}>{work?.status === 'complete' ? 'Work completed' : saving ? 'Completing…' : 'Complete Work'}</button>
      </div>
      {!readiness.ready && work?.status !== 'complete' && <p className="muted">Complete Work unlocks when required procedure/Final Verification stages are clear, parts are resolved, the completion summary is saved and Release is approved. The database independently enforces the same gate.</p>}
    </section>
  )
}
