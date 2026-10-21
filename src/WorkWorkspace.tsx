import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import BenchStepChecklist from './BenchStepChecklist'
import WorkComponentState from './WorkComponentState'
import WorkInductionPlan from './WorkInductionPlan'
import WorkOperationsPanel from './WorkOperationsPanel'
import WorkResumeSnapshot from './WorkResumeSnapshot'
import WorkUnifiedCapture from './WorkUnifiedCapture'
import WorkWorkshopMemory from './WorkWorkshopMemory'
import './work-workspace.css'

type WorkStatus = 'queued' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete' | 'cancelled'
type StepStatus = 'not_started' | 'in_progress' | 'done' | 'na' | 'blocked'
type InductionStatus = 'pending' | 'in_progress' | 'complete' | 'legacy_skipped'
type JobPlanStatus = 'pending' | 'ready' | 'applied'
type GuidedToolTarget = 'research' | 'diagnosis' | 'timing' | 'parts' | 'knowledge'

type WorkRecord = {
  id: string
  item_id: string
  work_number: number
  type: string
  title: string
  status: WorkStatus
  priority: number
  blocker: string
  diagnosis: string
  notes: string
  induction_status: InductionStatus
  job_plan_status: JobPlanStatus
  opened_at: string
  started_at: string | null
  completed_at: string | null
}

type ChecklistStep = {
  id: string
  work_id: string
  section_key: string
  phase: 'procedure' | 'final_qc'
  label: string
  description: string
  sequence: number
  required: boolean
  status: StepStatus
  notes: string
  blocked_reason: string
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusLabel(status: WorkStatus) {
  return status === 'qc' ? 'Verification' : titleCase(status)
}

function scrollToWorkspace(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function WorkWorkspace({ workspaceId, itemId, workId }: { workspaceId: string; itemId: string; workId: string }) {
  const [work, setWork] = useState<WorkRecord | null>(null)
  const [steps, setSteps] = useState<ChecklistStep[]>([])
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  async function load(showLoading = true, syncDrafts = true) {
    if (!workspaceId || !workId) return
    if (showLoading) setLoading(true)
    const [workResult, stepResult] = await Promise.all([
      supabase
        .from('work_records')
        .select('id,item_id,work_number,type,title,status,priority,blocker,diagnosis,notes,induction_status,job_plan_status,opened_at,started_at,completed_at')
        .eq('workspace_id', workspaceId)
        .eq('id', workId)
        .maybeSingle(),
      supabase
        .from('work_checklist_steps')
        .select('id,work_id,section_key,phase,label,description,sequence,required,status,notes,blocked_reason')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .order('sequence', { ascending: true }),
    ])
    if (showLoading) setLoading(false)
    const error = workResult.error ?? stepResult.error
    if (error) {
      setMessage(`Work workspace could not load: ${error.message}`)
      return
    }
    const nextWork = (workResult.data ?? null) as WorkRecord | null
    setWork(nextWork)
    setSteps((stepResult.data ?? []) as ChecklistStep[])
    if (syncDrafts) {
      setDiagnosis(nextWork?.diagnosis ?? '')
      setNotes(nextWork?.notes ?? '')
    }
    if (showLoading) setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, workId])

  const progress = useMemo(() => {
    const completed = steps.filter((step) => step.status === 'done' || step.status === 'na').length
    const requiredOpen = steps.filter((step) => step.required && step.status !== 'done' && step.status !== 'na').length
    const blocked = steps.filter((step) => step.status === 'blocked').length
    return { completed, total: steps.length, requiredOpen, blocked, percent: steps.length ? Math.round((completed / steps.length) * 100) : 0 }
  }, [steps])

  const openSteps = useMemo(() => steps.filter((step) => step.status !== 'done' && step.status !== 'na'), [steps])
  const currentStep = useMemo(() => openSteps.find((step) => step.status === 'in_progress') ?? openSteps.find((step) => step.status === 'blocked') ?? openSteps[0] ?? null, [openSteps])
  const nextStep = useMemo(() => currentStep ? openSteps.find((step) => step.id !== currentStep.id && step.sequence > currentStep.sequence) ?? null : null, [openSteps, currentStep])
  const verificationSteps = useMemo(() => steps.filter((step) => step.phase === 'final_qc'), [steps])
  const verificationComplete = verificationSteps.length > 0 && verificationSteps.every((step) => step.status === 'done' || step.status === 'na')

  const phase = useMemo(() => {
    if (!work) return 'Induction'
    if (work.induction_status !== 'legacy_skipped' && work.induction_status !== 'complete') return 'Induction'
    if (work.job_plan_status !== 'applied' && work.induction_status !== 'legacy_skipped') return 'Job Plan'
    if (work.status === 'qc' || (verificationSteps.length > 0 && openSteps.every((step) => step.phase === 'final_qc'))) return 'Verification'
    if (work.status === 'complete') return 'Release'
    return 'Work'
  }, [work, verificationSteps, openSteps])

  const navigator = useMemo(() => {
    if (!work) return []
    const inductionDone = work.induction_status === 'complete' || work.induction_status === 'legacy_skipped'
    const planDone = work.job_plan_status === 'applied' || work.induction_status === 'legacy_skipped'
    const workDone = planDone && steps.length > 0 && steps.filter((step) => step.phase === 'procedure').every((step) => step.status === 'done' || step.status === 'na')
    return [
      { label: 'Induction', done: inductionDone, current: phase === 'Induction', target: 'work-workspace-current' },
      { label: 'Job Plan', done: planDone, current: phase === 'Job Plan', target: 'work-workspace-plan' },
      { label: 'Work', done: workDone, current: phase === 'Work', target: 'work-workspace-current' },
      { label: 'Verification', done: verificationComplete || work.status === 'complete', current: phase === 'Verification', target: 'work-workspace-plan' },
      { label: 'Release', done: work.status === 'complete', current: phase === 'Release', target: 'work-workspace-intelligence' },
    ]
  }, [work, phase, steps, verificationComplete])

  async function saveNotes() {
    if (!work || saving) return
    setSaving(true)
    const { error } = await supabase
      .from('work_records')
      .update({ diagnosis: diagnosis.trim(), notes: notes.trim(), updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('id', work.id)
    setSaving(false)
    if (error) {
      setMessage(`Work notes could not be saved: ${error.message}`)
      return
    }
    setMessage('Work notes saved.')
    setWork((current) => current ? { ...current, diagnosis: diagnosis.trim(), notes: notes.trim() } : current)
    setRefreshKey((value) => value + 1)
    window.dispatchEvent(new CustomEvent('calibre:work-changed', { detail: { workId } }))
  }

  async function saveStepText(step: ChecklistStep, field: 'notes' | 'blocked_reason', value: string) {
    const nextValue = value.trim()
    const { error } = await supabase
      .from('work_checklist_steps')
      .update({ [field]: nextValue, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('id', step.id)
    if (error) {
      setMessage(`Step note could not be saved: ${error.message}`)
      return
    }
    setSteps((current) => current.map((row) => row.id !== step.id ? row : field === 'notes' ? { ...row, notes: nextValue } : { ...row, blocked_reason: nextValue }))
  }

  async function refreshWorkspace() {
    await load(false, false)
    setRefreshKey((value) => value + 1)
    window.dispatchEvent(new CustomEvent('calibre:work-changed', { detail: { workId } }))
  }

  function openGuidedTool(tool: GuidedToolTarget) {
    if (tool === 'diagnosis') {
      scrollToWorkspace('work-workspace-notes')
      return
    }

    const details = document.getElementById('work-workspace-details') as HTMLDetailsElement | null
    if (details) {
      details.open = true
      window.requestAnimationFrame(() => details.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }

    if (tool === 'research') setMessage('Research is available from the Research tab in the Job Card toolbar.')
  }

  if (loading) return <div className="loading-card">Loading Work workspace…</div>
  if (!work) return <div className="loading-card">This Work record could not be found.</div>

  const inductionOpen = work.induction_status !== 'legacy_skipped' && (work.induction_status !== 'complete' || work.job_plan_status !== 'applied')
  const resumeAction = inductionOpen
    ? phase === 'Job Plan' ? 'Complete the job plan' : 'Complete workshop induction'
    : currentStep?.label || (work.status === 'complete' ? 'Review completed Work' : 'Continue to Verification')
  const activeBlocker = currentStep?.status === 'blocked' ? currentStep.blocked_reason : work.blocker

  return (
    <div className="work-workspace-shell">
      <header className="work-workspace-header">
        <div>
          <p className="eyebrow">WORK #{work.work_number} · {phase.toUpperCase()}</p>
          <h2>{work.title}</h2>
          <p>{titleCase(work.type)} · opened {new Date(work.opened_at).toLocaleDateString('en-AU')}</p>
        </div>
        <div className={`work-workspace-status status-${work.status}`}><span>Status</span><strong>{statusLabel(work.status)}</strong><small>P{work.priority}</small></div>
      </header>

      {message && <p className="work-workspace-message">{message}</p>}

      <WorkResumeSnapshot workspaceId={workspaceId} workId={work.id} currentAction={resumeAction} blocker={activeBlocker} refreshKey={refreshKey} />

      <div className="work-workspace-grid">
        <nav className="work-workspace-navigator" aria-label="Job navigator">
          <div className="work-workspace-nav-heading"><span>JOB NAVIGATOR</span><strong>{progress.percent}%</strong></div>
          <div className="work-workspace-nav-track" aria-hidden="true"><span style={{ width: `${progress.percent}%` }} /></div>
          <div className="work-workspace-nav-list">
            {navigator.map((entry, index) => (
              <button type="button" key={entry.label} className={`${entry.current ? 'current' : ''} ${entry.done ? 'done' : ''}`} onClick={() => scrollToWorkspace(entry.target)}>
                <span>{entry.done ? '✓' : index + 1}</span><strong>{entry.label}</strong>
              </button>
            ))}
          </div>
          <div className="work-workspace-nav-meta"><span>{progress.completed}/{progress.total || '—'} stages</span><span>{progress.requiredOpen} required open</span>{progress.blocked > 0 && <span className="warning">{progress.blocked} blocked</span>}</div>
        </nav>

        <main className="work-workspace-current" id="work-workspace-current">
          <section className="work-workspace-current-card">
            <p className="eyebrow">CURRENT ACTION</p>
            {inductionOpen ? (
              <div className="work-workspace-current-copy"><h1>{phase === 'Job Plan' ? 'Plan the job' : 'Complete workshop induction'}</h1><p>Finish the incoming assessment and job plan before the guided repair procedure becomes the active workspace.</p></div>
            ) : currentStep ? (
              <div className="work-workspace-current-copy">
                <div className="work-workspace-step-state"><span className={`status-pill status-${currentStep.status}`}>{titleCase(currentStep.status)}</span>{currentStep.required && <span>Required</span>}</div>
                <h1>{currentStep.label}</h1>
                <p>{currentStep.description || 'Complete the current guided workshop stage.'}</p>
                {currentStep.status === 'blocked' && currentStep.blocked_reason && <div className="work-workspace-blocker"><span>BLOCKED BY</span><strong>{currentStep.blocked_reason}</strong></div>}
                <details className="work-workspace-current-notes">
                  <summary>Step notes{currentStep.notes ? ' · saved' : ''}</summary>
                  <label>Notes<textarea rows={3} defaultValue={currentStep.notes} onBlur={(event) => void saveStepText(currentStep, 'notes', event.target.value)} placeholder="Measurements, observations, lubrication, parts or anything unusual…" /></label>
                  {currentStep.status === 'blocked' && <label>Blocked by<textarea rows={2} defaultValue={currentStep.blocked_reason} onBlur={(event) => void saveStepText(currentStep, 'blocked_reason', event.target.value)} /></label>}
                </details>
              </div>
            ) : (
              <div className="work-workspace-current-copy"><h1>{work.status === 'complete' ? 'Work complete' : 'No open procedure stage'}</h1><p>{work.status === 'complete' ? 'This Work record is complete. Review the intelligence and permanent history below.' : 'The job plan has no remaining open procedure stages. Continue to Verification or review the plan.'}</p></div>
            )}

            {!inductionOpen && nextStep && <div className="work-workspace-next"><span>NEXT</span><strong>{nextStep.label}</strong><p>{nextStep.description || titleCase(nextStep.status)}</p></div>}
          </section>

          {!inductionOpen && work.status !== 'complete' && currentStep && (
            <BenchStepChecklist
              workspaceId={workspaceId}
              itemId={itemId}
              workId={work.id}
              step={currentStep}
              refreshKey={refreshKey}
              onChanged={refreshWorkspace}
              onOpenTool={openGuidedTool}
            />
          )}

          {!inductionOpen && work.status !== 'complete' && (
            <WorkUnifiedCapture
              workspaceId={workspaceId}
              itemId={itemId}
              workId={work.id}
              workNumber={work.work_number}
              currentStep={currentStep}
              onSaved={refreshWorkspace}
              compact
            />
          )}

          {!inductionOpen && work.status !== 'complete' && (
            <WorkComponentState workspaceId={workspaceId} itemId={itemId} workId={work.id} onChanged={refreshWorkspace} compact />
          )}

          {inductionOpen && <WorkInductionPlan workspaceId={workspaceId} itemId={itemId} workId={work.id} compact onChanged={refreshWorkspace} />}

          {!inductionOpen && <section className="section-card work-workspace-plan" id="work-workspace-plan">
            <div className="work-workspace-section-heading"><div><p className="eyebrow">JOB PLAN</p><h3>{progress.total ? `${progress.completed} of ${progress.total} stages cleared` : 'No generated stages'}</h3></div><span>{progress.percent}%</span></div>
            <div className="work-workspace-plan-track"><span style={{ width: `${progress.percent}%` }} /></div>
            <details>
              <summary>View full procedure</summary>
              <div className="work-workspace-plan-list">
                {steps.length === 0 ? <p className="muted">No checklist stages were generated for this job plan.</p> : steps.map((step) => (
                  <article key={step.id} className={`work-workspace-plan-step step-${step.status} ${currentStep?.id === step.id ? 'current' : ''}`}>
                    <div><strong>{step.label}</strong><small>{step.phase === 'final_qc' ? 'Verification' : titleCase(step.section_key)}</small></div><span className={`status-pill status-${step.status}`}>{titleCase(step.status)}</span>
                  </article>
                ))}
              </div>
            </details>
          </section>}
        </main>

        <aside className="work-workspace-intelligence" id="work-workspace-intelligence">
          <section className="section-card work-workspace-intel-card">
            <p className="eyebrow">INTELLIGENCE</p>
            <h3>Job context</h3>
            <div className="work-workspace-intel-facts">
              <div><span>Current phase</span><strong>{phase}</strong></div>
              <div><span>Required open</span><strong>{progress.requiredOpen}</strong></div>
              <div><span>Blocked</span><strong>{progress.blocked}</strong></div>
              <div><span>Progress</span><strong>{progress.percent}%</strong></div>
            </div>
            {work.blocker && <div className="work-workspace-intel-alert"><span>WORK BLOCKER</span><strong>{work.blocker}</strong></div>}
          </section>

          <WorkWorkshopMemory workspaceId={workspaceId} itemId={itemId} workId={work.id} refreshKey={refreshKey} />

          <section className="section-card work-workspace-intel-card" id="work-workspace-notes">
            <div className="work-workspace-section-heading"><div><p className="eyebrow">WORK NOTES</p><h3>Diagnosis & context</h3></div></div>
            <label>Diagnosis<textarea rows={4} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} placeholder="Diagnosis develops from workshop evidence…" /></label>
            <label>Job notes<textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Persistent notes for this Work record…" /></label>
            <button type="button" onClick={() => void saveNotes()} disabled={saving}>{saving ? 'Saving…' : 'Save notes'}</button>
          </section>
        </aside>
      </div>

      <details className="work-workspace-details" id="work-workspace-details">
        <summary><div><span>INTELLIGENCE WORKSPACE</span><strong>Measurements · timing · parts · identity · verification · history</strong></div><span>Open</span></summary>
        <div className="work-workspace-details-body"><WorkOperationsPanel workspaceId={workspaceId} itemId={itemId} workId={work.id} /></div>
      </details>
    </div>
  )
}
