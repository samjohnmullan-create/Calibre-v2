import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import BenchModePanel from './BenchModePanel'

type WorkStatus = 'queued' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete' | 'cancelled'
type ChecklistState = 'none' | 'active' | 'complete'
type InductionStatus = 'pending' | 'in_progress' | 'complete' | 'legacy_skipped'
type JobPlanStatus = 'pending' | 'ready' | 'applied'

type CandidateWork = {
  id: string
  item_id: string
  work_number: number
  title: string
  status: WorkStatus
  priority: number
  next_action: string
  item_number: number
  item_title: string
}

type StepRow = {
  id: string
  label: string
  description: string
  status: string
  sequence: number
}

type ActiveSession = {
  id: string
  work_id: string
  item_id: string
  started_at: string
  paused_at: string | null
}

type WorkLifecycle = {
  induction_status: InductionStatus
  job_plan_status: JobPlanStatus
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isWorkbenchRoute() {
  return window.location.hash.replace(/\/$/, '') === '#/workbench'
}

export default function BenchModeHost() {
  const [routeActive, setRouteActive] = useState(isWorkbenchRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [userId, setUserId] = useState('')
  const [candidates, setCandidates] = useState<CandidateWork[]>([])
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [selectedWorkId, setSelectedWorkId] = useState('')
  const [steps, setSteps] = useState<StepRow[]>([])
  const [lifecycle, setLifecycle] = useState<WorkLifecycle | null>(null)
  const [stepRefresh, setStepRefresh] = useState(0)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => setRouteActive(isWorkbenchRoute())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled || error) return
      setUserId(data.user?.id ?? '')
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? '')
      if (!session) {
        setWorkspaceId('')
        setCandidates([])
        setActiveSession(null)
        setSelectedWorkId('')
        setLifecycle(null)
        setChooserOpen(false)
      }
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setWorkspaceId('')
      return
    }
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setWorkspaceId('')
        return
      }
      setWorkspaceId(result.data.id)
    })()
    return () => { cancelled = true }
  }, [userId])

  async function loadHost() {
    if (!workspaceId || !userId) return
    setLoading(true)
    const [sessionResult, workResult] = await Promise.all([
      supabase
        .from('work_sessions')
        .select('id,work_id,item_id,started_at,paused_at')
        .eq('workspace_id', workspaceId)
        .eq('started_by', userId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('workbench_jobs')
        .select('id,item_id,work_number,title,status,priority,next_action,item_number,item_title')
        .eq('workspace_id', workspaceId)
        .neq('status', 'complete')
        .neq('status', 'cancelled')
        .order('priority', { ascending: false })
        .order('work_number', { ascending: false })
        .limit(30),
    ])
    setLoading(false)
    const error = sessionResult.error ?? workResult.error
    if (error) {
      setMessage(`Bench Mode unavailable: ${error.message}`)
      return
    }

    const nextSession = (sessionResult.data ?? null) as ActiveSession | null
    const nextCandidates = (workResult.data ?? []) as CandidateWork[]
    setActiveSession(nextSession)
    setCandidates(nextCandidates)
    if (nextSession) setSelectedWorkId(nextSession.work_id)
    else if (selectedWorkId && !nextCandidates.some((record) => record.id === selectedWorkId)) setSelectedWorkId('')
    setMessage('')
  }

  async function refreshBenchContext() {
    await loadHost()
    setStepRefresh((value) => value + 1)
    window.dispatchEvent(new CustomEvent('calibre:work-changed', { detail: { workId: selectedWorkId } }))
  }

  useEffect(() => { void loadHost() }, [workspaceId, userId])

  const selectedWork = useMemo(() => candidates.find((record) => record.id === selectedWorkId) ?? null, [candidates, selectedWorkId])

  useEffect(() => {
    if (!workspaceId || !selectedWorkId) {
      setSteps([])
      setLifecycle(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const [stepResult, lifecycleResult] = await Promise.all([
        supabase
          .from('work_checklist_steps')
          .select('id,label,description,status,sequence')
          .eq('workspace_id', workspaceId)
          .eq('work_id', selectedWorkId)
          .order('sequence', { ascending: true }),
        supabase
          .from('work_records')
          .select('induction_status,job_plan_status')
          .eq('workspace_id', workspaceId)
          .eq('id', selectedWorkId)
          .maybeSingle(),
      ])
      if (cancelled) return
      const error = stepResult.error ?? lifecycleResult.error
      if (error) {
        setMessage(`Bench context could not load: ${error.message}`)
        return
      }
      setSteps((stepResult.data ?? []) as StepRow[])
      setLifecycle((lifecycleResult.data ?? null) as WorkLifecycle | null)
    })()
    return () => { cancelled = true }
  }, [workspaceId, selectedWorkId, stepRefresh])

  const openSteps = useMemo(() => steps.filter((step) => step.status !== 'done' && step.status !== 'na'), [steps])
  const checklistState = useMemo<ChecklistState>(() => {
    if (steps.length === 0) return 'none'
    if (openSteps.length === 0) return 'complete'
    return 'active'
  }, [steps, openSteps])
  const checklistCompleteCount = useMemo(() => steps.filter((step) => step.status === 'done' || step.status === 'na').length, [steps])
  const currentStep = useMemo(() => openSteps.find((step) => step.status === 'in_progress') ?? openSteps.find((step) => step.status === 'blocked') ?? openSteps[0] ?? null, [openSteps])
  const nextStep = useMemo(() => {
    if (!currentStep) return null
    return openSteps.find((step) => step.id !== currentStep.id && step.sequence > currentStep.sequence) ?? openSteps.find((step) => step.id !== currentStep.id) ?? null
  }, [openSteps, currentStep])

  const shouldShowLauncher = Boolean(activeSession) || routeActive
  if (!shouldShowLauncher || !workspaceId || !userId) return null

  function openLauncher() {
    if (activeSession) setSelectedWorkId(activeSession.work_id)
    setChooserOpen(true)
  }

  const benchPaused = Boolean(activeSession?.paused_at)

  return (
    <>
      <button type="button" className={`bench-mode-launcher ${activeSession ? 'active' : ''} ${benchPaused ? 'paused' : ''}`} onClick={openLauncher} aria-label={activeSession ? (benchPaused ? 'Open paused Bench Mode session' : 'Open active Bench Mode session') : 'Open Bench Mode'}>
        <span aria-hidden="true">⌁</span>
        <div><small>{activeSession ? (benchPaused ? 'BENCH PAUSED' : 'BENCH LIVE') : 'BENCH MODE'}</small><strong>{activeSession ? (benchPaused ? 'Timer paused' : 'Session active') : 'Start session'}</strong></div>
      </button>

      {chooserOpen && (
        <div className="bench-mode-host-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setChooserOpen(false) }}>
          <aside className="bench-mode-host-card" role="dialog" aria-modal="true" aria-label="Bench Mode">
            <div className="bench-mode-host-toolbar">
              <div><p className="eyebrow">BENCH MODE</p><strong>{selectedWork ? `Work #${selectedWork.work_number}` : 'Choose Work'}</strong></div>
              <button type="button" className="secondary small" onClick={() => setChooserOpen(false)}>Close</button>
            </div>

            {message && <p className="bench-mode-host-message">{message}</p>}

            {!selectedWork ? (
              <div className="bench-mode-chooser">
                <div><h2>What are you working on?</h2><p className="muted">Starting a session records actual bench time. Unplanned jobs begin with Workshop Induction before any repair procedure is chosen.</p></div>
                {loading ? <div className="loading-card">Loading Work…</div> : candidates.length === 0 ? <div className="loading-card">No active Work is available for a bench session.</div> : (
                  <div className="bench-mode-chooser-list">
                    {candidates.map((record) => (
                      <button type="button" key={record.id} onClick={() => setSelectedWorkId(record.id)}>
                        <div><span>Work #{record.work_number} · Item #{record.item_number}</span><strong>{record.item_title || record.title}</strong><small>{record.next_action || 'Open Bench Mode'}</small></div>
                        <span className={`status-pill status-${record.status}`}>{titleCase(record.status)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bench-mode-host-content">
                {!activeSession && <button type="button" className="bench-mode-change-work" onClick={() => setSelectedWorkId('')}>← Choose different Work</button>}
                {lifecycle ? (
                  <BenchModePanel
                    workspaceId={workspaceId}
                    itemId={selectedWork.item_id}
                    workId={selectedWork.id}
                    workNumber={selectedWork.work_number}
                    workTitle={selectedWork.item_title || selectedWork.title}
                    workStatus={selectedWork.status}
                    inductionStatus={lifecycle.induction_status}
                    jobPlanStatus={lifecycle.job_plan_status}
                    checklistState={checklistState}
                    checklistTotal={steps.length}
                    checklistCompleteCount={checklistCompleteCount}
                    currentStep={currentStep}
                    nextStep={nextStep}
                    onWorkChanged={refreshBenchContext}
                  />
                ) : <div className="loading-card">Loading workshop state…</div>}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
