import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import BenchQuickCapture from './BenchQuickCapture'
import BenchLifecycleControls from './BenchLifecycleControls'
import BenchExceptionsPanel from './BenchExceptionsPanel'
import BenchStepChecklist from './BenchStepChecklist'
import BenchMovementGuidance from './BenchMovementGuidance'
import WorkInductionPlan from './WorkInductionPlan'
import BenchWorkspaceArea from './BenchWorkspaceArea'
import './bench-mode.css'
import './bench-guided-job.css'

type WorkStatus = 'queued' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete' | 'cancelled'
type ChecklistState = 'none' | 'active' | 'complete'
type InductionStatus = 'pending' | 'in_progress' | 'complete' | 'legacy_skipped'
type JobPlanStatus = 'pending' | 'ready' | 'applied'
type WorkspaceArea = 'work' | 'research' | 'diagnosis' | 'timing' | 'parts'
type StepToolTarget = 'research' | 'diagnosis' | 'timing' | 'parts' | 'knowledge'

type StepSummary = {
  id: string
  label: string
  description: string
  status: string
}

type WorkSession = {
  id: string
  work_id: string
  item_id: string
  started_at: string
  ended_at: string | null
  paused_at: string | null
  started_by: string | null
  ended_by: string | null
  note: string
}

type WorkSessionSegment = {
  id: string
  session_id: string
  started_at: string
  ended_at: string | null
}

function secondsBetween(startedAt: string, endedAt?: string | null, nowMs?: number) {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : nowMs ?? Date.now()
  return Math.max(0, Math.floor((end - start) / 1000))
}

function formatClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.round((totalSeconds % 3600) / 60)
  if (hours && minutes) return `${hours}h ${minutes}m`
  if (hours) return `${hours}h`
  if (minutes) return `${minutes}m`
  return `${totalSeconds}s`
}

export default function BenchModePanel({
  workspaceId,
  itemId,
  workId,
  workNumber,
  workTitle,
  workStatus,
  inductionStatus,
  jobPlanStatus,
  checklistState,
  checklistTotal,
  checklistCompleteCount,
  currentStep,
  nextStep,
  onWorkChanged,
}: {
  workspaceId: string
  itemId: string
  workId: string
  workNumber: number
  workTitle: string
  workStatus: WorkStatus
  inductionStatus: InductionStatus
  jobPlanStatus: JobPlanStatus
  checklistState: ChecklistState
  checklistTotal: number
  checklistCompleteCount: number
  currentStep: StepSummary | null
  nextStep: StepSummary | null
  onWorkChanged: () => Promise<void> | void
}) {
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [segments, setSegments] = useState<WorkSessionSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [benchOpen, setBenchOpen] = useState(false)
  const [workspaceArea, setWorkspaceArea] = useState<WorkspaceArea>('work')
  const [nowMs, setNowMs] = useState(Date.now())
  const [intelligenceRefresh, setIntelligenceRefresh] = useState(0)

  const activeSession = sessions.find((session) => !session.ended_at) ?? null
  const isPaused = Boolean(activeSession?.paused_at)

  function sessionSeconds(sessionId: string) {
    return segments
      .filter((segment) => segment.session_id === sessionId)
      .reduce((sum, segment) => sum + secondsBetween(segment.started_at, segment.ended_at, nowMs), 0)
  }

  const totalRecordedSeconds = useMemo(
    () => sessions.reduce((sum, session) => sum + sessionSeconds(session.id), 0),
    [sessions, segments, nowMs],
  )
  const activeSeconds = activeSession ? sessionSeconds(activeSession.id) : 0
  const inductionFlow = inductionStatus !== 'legacy_skipped' && (inductionStatus !== 'complete' || jobPlanStatus !== 'applied')
  const workshopReady = inductionStatus === 'legacy_skipped' || jobPlanStatus === 'applied'

  const benchState = useMemo(() => {
    if (inductionStatus === 'pending') return { eyebrow: 'WORKSHOP INDUCTION', currentLabel: 'Induction required', currentDescription: 'Assess how the watch arrived before choosing any repair or service procedure.', nextLabel: 'Start induction', nextDescription: 'Check function, condition and baseline performance, then build the job plan from what you find.' }
    if (inductionStatus === 'in_progress') return { eyebrow: 'WORKSHOP INDUCTION', currentLabel: 'Induction in progress', currentDescription: 'Work through the incoming condition and function checks. Problems become findings for the job plan.', nextLabel: 'Finish assessment', nextDescription: 'Complete the required induction checks before selecting planned workshop work.' }
    if (inductionStatus === 'complete' && jobPlanStatus !== 'applied') return { eyebrow: 'INDUCTION COMPLETE', currentLabel: 'Plan the job', currentDescription: 'The incoming condition is recorded. Choose what you intend to do and Calibre will build the working checklist.', nextLabel: 'Create job plan', nextDescription: 'Select one or more planned actions based on the induction findings.' }
    if (checklistState === 'complete') return { eyebrow: 'FINAL VERIFICATION', currentLabel: 'Procedure complete', currentDescription: `${checklistCompleteCount} of ${checklistTotal} procedure stages are complete or not applicable.`, nextLabel: workStatus === 'qc' ? 'Release sign-off' : 'Review readiness', nextDescription: workStatus === 'qc' ? 'Complete the release sign-off before closing Work.' : 'Review exceptions and verification evidence before Release.' }
    if (checklistState === 'none') return { eyebrow: 'JOB PLAN', currentLabel: 'Plan recorded', currentDescription: 'No guided procedure stages were generated for this plan. Bench capture remains available for documented ad-hoc work.', nextLabel: 'Document the work', nextDescription: 'Capture evidence and complete the planned action before Release.' }
    return {
      eyebrow: 'CURRENT STEP',
      currentLabel: currentStep?.label ?? 'No open procedure stage',
      currentDescription: currentStep?.description || (currentStep ? `Status: ${currentStep.status.replaceAll('_', ' ')}` : 'No actionable procedure stage is currently available.'),
      nextLabel: nextStep?.label ?? 'No next step',
      nextDescription: nextStep?.description || (nextStep ? `Status: ${nextStep.status.replaceAll('_', ' ')}` : 'Finish or update the current step to advance.'),
    }
  }, [inductionStatus, jobPlanStatus, checklistState, checklistCompleteCount, checklistTotal, workStatus, currentStep, nextStep])

  async function loadSessions() {
    if (!workspaceId || !workId) return
    setLoading(true)
    const [sessionResult, segmentResult] = await Promise.all([
      supabase
        .from('work_sessions')
        .select('id,work_id,item_id,started_at,ended_at,paused_at,started_by,ended_by,note')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .order('started_at', { ascending: false })
        .limit(8),
      supabase
        .from('work_session_segments')
        .select('id,session_id,started_at,ended_at')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .order('started_at', { ascending: true }),
    ])
    setLoading(false)
    const error = sessionResult.error ?? segmentResult.error
    if (error) { setMessage(`Bench sessions could not be loaded: ${error.message}`); return }
    setSessions((sessionResult.data ?? []) as WorkSession[])
    setSegments((segmentResult.data ?? []) as WorkSessionSegment[])
    setMessage('')
  }

  useEffect(() => { void loadSessions() }, [workspaceId, workId])
  useEffect(() => {
    if (!activeSession || isPaused) return
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activeSession?.id, isPaused])
  useEffect(() => { if (!activeSession) { setBenchOpen(false); setWorkspaceArea('work') } }, [activeSession?.id])

  async function refreshEvidence() {
    setIntelligenceRefresh((value) => value + 1)
    await onWorkChanged()
  }

  async function refreshAfterLifecycle() {
    setBenchOpen(false)
    setWorkspaceArea('work')
    await loadSessions()
    setIntelligenceRefresh((value) => value + 1)
    await onWorkChanged()
  }

  async function startSession() {
    if (saving || ['complete', 'cancelled'].includes(workStatus)) return
    setSaving(true)
    setMessage('Starting bench session…')
    const result = await supabase.rpc('start_work_session', { p_workspace_id: workspaceId, p_work_id: workId })
    setSaving(false)
    if (result.error) { setMessage(`Bench session could not start: ${result.error.message}`); return }
    await loadSessions()
    setIntelligenceRefresh((value) => value + 1)
    await onWorkChanged()
    setBenchOpen(true)
    setWorkspaceArea('work')
    setMessage('Bench session started. Working time is now recording.')
  }

  async function pauseSession() {
    if (!activeSession || saving || isPaused) return
    setSaving(true)
    setMessage('Pausing bench timer…')
    const result = await supabase.rpc('pause_work_session', { p_workspace_id: workspaceId, p_session_id: activeSession.id })
    setSaving(false)
    if (result.error) { setMessage(`Bench timer could not pause: ${result.error.message}`); return }
    await loadSessions()
    setMessage('Bench timer paused. Paused time will not count as bench time.')
  }

  async function resumeSession() {
    if (!activeSession || saving || !isPaused) return
    setSaving(true)
    setMessage('Resuming bench timer…')
    const result = await supabase.rpc('resume_work_session', { p_workspace_id: workspaceId, p_session_id: activeSession.id })
    setSaving(false)
    if (result.error) { setMessage(`Bench timer could not resume: ${result.error.message}`); return }
    await loadSessions()
    setMessage('Bench timer resumed.')
  }

  async function finishSession() {
    if (!activeSession || saving) return
    setSaving(true)
    setMessage('Ending bench session…')
    const result = await supabase.rpc('finish_work_session', { p_workspace_id: workspaceId, p_session_id: activeSession.id, p_note: sessionNote.trim() })
    setSaving(false)
    if (result.error) { setMessage(`Bench session could not end: ${result.error.message}`); return }
    setSessionNote('')
    await loadSessions()
    setIntelligenceRefresh((value) => value + 1)
    await onWorkChanged()
    setBenchOpen(false)
    setWorkspaceArea('work')
    setMessage('Bench session ended. Only working segments were counted.')
  }

  const canStart = !activeSession && !['complete', 'cancelled'].includes(workStatus)
  const openStepTool = (tool: StepToolTarget) => setWorkspaceArea(tool === 'knowledge' ? 'diagnosis' : tool)
  const timingCheckpoint = workStatus === 'qc' ? 'final_qc' : 'pre_service'
  const sessionStateLabel = !activeSession ? 'RECORDED' : isPaused ? 'PAUSED' : 'LIVE'

  return <>
    <section className="section-card bench-mode-panel">
      <div className="bench-mode-panel-heading">
        <div><p className="eyebrow">BENCH MODE</p><h3>{activeSession ? (isPaused ? 'Session paused' : 'Session running') : 'Hands-on workshop session'}</h3><p className="muted">Working time now follows Start → Pause → Resume → Finish. Paused time is excluded from bench totals.</p></div>
        <div className={`bench-mode-session-state ${activeSession && !isPaused ? 'active' : ''} ${isPaused ? 'paused' : ''}`}><span>{sessionStateLabel}</span><strong>{activeSession ? formatClock(activeSeconds) : formatDuration(totalRecordedSeconds)}</strong></div>
      </div>
      <div className="bench-mode-step-preview"><div><span>{benchState.eyebrow}</span><strong>{benchState.currentLabel}</strong><p>{benchState.currentDescription}</p></div><div><span>NEXT</span><strong>{benchState.nextLabel}</strong><p>{benchState.nextDescription}</p></div></div>
      {!benchOpen && workshopReady && <BenchExceptionsPanel workspaceId={workspaceId} itemId={itemId} workId={workId} refreshKey={intelligenceRefresh} />}
      {activeSession && <label className="bench-mode-note">Session note<textarea rows={2} value={sessionNote} onChange={(event) => setSessionNote(event.target.value)} placeholder="Optional summary of this bench session…" /></label>}
      <div className="bench-mode-actions">
        {canStart && <button type="button" onClick={() => void startSession()} disabled={saving}>{saving ? 'Starting…' : 'Start Bench Session'}</button>}
        {activeSession && <button type="button" onClick={() => { setWorkspaceArea('work'); setBenchOpen(true) }} disabled={saving}>Open Bench Mode</button>}
        {activeSession && !isPaused && <button type="button" className="secondary" onClick={() => void pauseSession()} disabled={saving}>{saving ? 'Pausing…' : 'Pause'}</button>}
        {activeSession && isPaused && <button type="button" onClick={() => void resumeSession()} disabled={saving}>{saving ? 'Resuming…' : 'Resume'}</button>}
        {activeSession && <button type="button" className="secondary" onClick={() => void finishSession()} disabled={saving}>{saving ? 'Ending…' : 'Finish Session'}</button>}
        {!canStart && !activeSession && <span className="muted">Bench sessions are closed for {workStatus.replaceAll('_', ' ')} Work.</span>}
      </div>
      <BenchLifecycleControls workspaceId={workspaceId} itemId={itemId} workId={workId} fallbackStatus={workStatus} activeSessionId={activeSession?.id ?? null} onChanged={refreshAfterLifecycle} />
      {message && <p className="bench-mode-message">{message}</p>}
      <details className="bench-mode-history"><summary>Session history · {sessions.length}</summary>{loading ? <p className="muted">Loading bench history…</p> : sessions.length === 0 ? <p className="muted">No bench time has been recorded yet.</p> : <div className="bench-mode-history-list">{sessions.map((session) => <div key={session.id}><div><strong>{session.ended_at ? formatDuration(sessionSeconds(session.id)) : `${formatClock(sessionSeconds(session.id))} ${session.paused_at ? 'paused' : 'live'}`}</strong><span>{new Date(session.started_at).toLocaleString('en-AU')}</span></div>{session.note && <p>{session.note}</p>}</div>)}</div>}</details>
    </section>

    {benchOpen && activeSession && <div className="bench-mode-overlay" role="dialog" aria-modal="true" aria-label={`Bench Mode for Work #${workNumber}`}>
      <div className="bench-mode-overlay-shell">
        <header><div><p className="eyebrow">WORK #{workNumber} · {workspaceArea === 'work' ? 'BENCH SESSION' : workspaceArea.toUpperCase()}</p><h2>{workTitle}</h2></div><div className={`bench-mode-live-clock ${isPaused ? 'paused' : ''}`}><span>{isPaused ? 'PAUSED' : 'LIVE'}</span><strong>{formatClock(activeSeconds)}</strong></div></header>
        <main className={`bench-mode-focus ${inductionFlow && workspaceArea === 'work' ? 'induction-flow' : ''} ${workspaceArea !== 'work' ? 'workspace-only' : ''}`}>
          <nav className="bench-job-hub" aria-label="Bench workspace navigation">
            <button type="button" className={workspaceArea === 'work' ? 'active' : ''} onClick={() => setWorkspaceArea('work')}><span>⌁</span><strong>Work</strong><small>Current procedure · evidence</small></button>
            <button type="button" className={workspaceArea === 'research' ? 'active' : ''} onClick={() => setWorkspaceArea('research')}><span>⌕</span><strong>Research</strong><small>Technical · parts · market</small></button>
            <button type="button" className={workspaceArea === 'diagnosis' ? 'active' : ''} onClick={() => setWorkspaceArea('diagnosis')}><span>◇</span><strong>Diagnosis</strong><small>Findings · evidence · reasoning</small></button>
            <button type="button" className={workspaceArea === 'timing' ? 'active' : ''} onClick={() => setWorkspaceArea('timing')}><span>◷</span><strong>Timing</strong><small>Timegrapher · history</small></button>
          </nav>

          {workspaceArea !== 'work' ? <BenchWorkspaceArea area={workspaceArea} workspaceId={workspaceId} itemId={itemId} workId={workId} refreshKey={intelligenceRefresh} timingCheckpoint={timingCheckpoint} onChanged={refreshEvidence} onBack={() => setWorkspaceArea('work')} /> : <>
            {inductionFlow ? <WorkInductionPlan workspaceId={workspaceId} itemId={itemId} workId={workId} compact onChanged={refreshEvidence} /> : <section className={`bench-mode-current-step state-${checklistState}`}><span>{benchState.eyebrow}</span><h1>{benchState.currentLabel}</h1><p>{benchState.currentDescription}</p>{currentStep && checklistState === 'active' && <small>{currentStep.status.replaceAll('_', ' ')}</small>}</section>}

            {!inductionFlow && checklistState === 'active' && currentStep && <BenchMovementGuidance workspaceId={workspaceId} itemId={itemId} workId={workId} checklistStepId={currentStep.id} refreshKey={intelligenceRefresh} onChanged={refreshEvidence} />}
            {!inductionFlow && checklistState === 'active' && currentStep && <BenchStepChecklist workspaceId={workspaceId} itemId={itemId} workId={workId} step={currentStep} refreshKey={intelligenceRefresh} onChanged={refreshEvidence} onOpenTool={openStepTool} />}

            <BenchQuickCapture workspaceId={workspaceId} itemId={itemId} workId={workId} workNumber={workNumber} currentStep={inductionFlow ? null : currentStep} onSaved={refreshEvidence} />

            {!inductionFlow && checklistState !== 'none' && <section className="bench-mode-next-step"><span>NEXT</span><strong>{benchState.nextLabel}</strong><p>{benchState.nextDescription}</p></section>}
            {!inductionFlow && <BenchExceptionsPanel workspaceId={workspaceId} itemId={itemId} workId={workId} refreshKey={intelligenceRefresh} />}
          </>}
        </main>
        <footer>
          <button type="button" className="secondary" onClick={() => { setWorkspaceArea('work'); setBenchOpen(false) }}>Back to Job Card</button>
          {!isPaused ? <button type="button" className="secondary" onClick={() => void pauseSession()} disabled={saving}>Pause</button> : <button type="button" onClick={() => void resumeSession()} disabled={saving}>Resume</button>}
          <button type="button" onClick={() => void finishSession()} disabled={saving}>{saving ? 'Ending…' : 'Finish Session'}</button>
        </footer>
      </div>
    </div>}
  </>
}
