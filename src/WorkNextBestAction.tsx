import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import BenchTimegrapher from './BenchTimegrapher'
import CalibreReasoningPanel from './CalibreReasoningPanel'
import './work-next-best-action.css'

type TimingCheckpoint = 'pre_service' | 'post_reassembly' | 'regulation' | 'final_qc' | 'other'

type NextAction = {
  action_type: string
  title: string
  instructions: string
  reason: string
  tool_key: string
  entity_id: string | null
  checklist_step_id: string | null
  timing_checkpoint: TimingCheckpoint | null
}

type QueuedDiagnostic = {
  id: string
  label: string
  description: string
  checklist_step_id: string
  status: string
}

type ProcedureStage = {
  id: string
  label: string
  sequence: number
  status: string
}

export default function WorkNextBestAction({
  workspaceId,
  itemId,
  workId,
  refreshKey = 0,
  onChanged,
}: {
  workspaceId: string
  itemId: string
  workId: string
  refreshKey?: number
  onChanged?: () => void | Promise<void>
}) {
  const [action, setAction] = useState<NextAction | null>(null)
  const [queuedDiagnostic, setQueuedDiagnostic] = useState<QueuedDiagnostic | null>(null)
  const [queuedStage, setQueuedStage] = useState<ProcedureStage | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!workspaceId || !workId) return
    setLoading(true)
    const [actionResult, queuedResult] = await Promise.all([
      supabase.rpc('get_work_next_best_action', {
        p_workspace_id: workspaceId,
        p_work_id: workId,
      }),
      supabase
        .from('work_step_checks')
        .select('id,label,description,checklist_step_id,status')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .eq('origin_kind', 'ai_reasoning')
        .neq('status', 'complete')
        .neq('status', 'not_applicable')
        .order('created_at', { ascending: true })
        .limit(1),
    ])

    const error = actionResult.error ?? queuedResult.error
    if (error) {
      setLoading(false)
      setMessage(`Workshop state could not be calculated: ${error.message}`)
      setAction(null)
      setQueuedDiagnostic(null)
      setQueuedStage(null)
      return
    }

    const row = (Array.isArray(actionResult.data) ? actionResult.data[0] : actionResult.data) as NextAction | null
    const queued = ((queuedResult.data ?? [])[0] ?? null) as QueuedDiagnostic | null
    setAction(row ?? null)
    setQueuedDiagnostic(queued)

    if (queued?.checklist_step_id) {
      const stageResult = await supabase
        .from('work_checklist_steps')
        .select('id,label,sequence,status')
        .eq('workspace_id', workspaceId)
        .eq('id', queued.checklist_step_id)
        .maybeSingle()
      if (stageResult.error) {
        setQueuedStage(null)
        setMessage(`Queued diagnostic stage could not load: ${stageResult.error.message}`)
      } else {
        setQueuedStage((stageResult.data ?? null) as ProcedureStage | null)
        setMessage('')
      }
    } else {
      setQueuedStage(null)
      setMessage('')
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, refreshKey])

  async function refreshAll() {
    await load()
    await onChanged?.()
  }

  async function mutateStage(kind: 'begin' | 'complete') {
    if (!action?.checklist_step_id || saving) return
    setSaving(true)
    const rpc = kind === 'begin' ? 'begin_work_checklist_step' : 'complete_work_checklist_step'
    const { error } = await supabase.rpc(rpc, { p_workspace_id: workspaceId, p_step_id: action.checklist_step_id })
    setSaving(false)
    if (error) {
      setMessage(`${kind === 'begin' ? 'Stage could not start' : 'Stage could not complete'}: ${error.message}`)
      return
    }
    await refreshAll()
  }

  if (loading) return <section className="section-card next-best-action-card"><p className="muted">Calculating workshop state…</p></section>

  const inlineTiming = Boolean(action && action.action_type === 'step_check' && action.tool_key === 'timing' && action.entity_id)
  const queuedIsCurrent = Boolean(queuedDiagnostic && action?.entity_id === queuedDiagnostic.id)

  return <div className="next-best-action-stack">
    {action && <section className={`section-card next-best-action-card action-${action.action_type}`}>
      <div className="next-best-action-head">
        <div>
          <p className="eyebrow">NEXT WORKSHOP ACTION</p>
          <h3>{action.title}</h3>
          {action.instructions && <p>{action.instructions}</p>}
        </div>
        <span>{action.action_type.replaceAll('_', ' ')}</span>
      </div>

      {action.reason && <div className="next-best-action-why"><strong>Why this now?</strong><span>{action.reason}</span></div>}

      {action.action_type === 'begin_stage' && <button type="button" onClick={() => void mutateStage('begin')} disabled={saving}>{saving ? 'Starting…' : 'Begin stage'}</button>}
      {action.action_type === 'complete_stage' && <button type="button" onClick={() => void mutateStage('complete')} disabled={saving}>{saving ? 'Completing…' : 'Complete stage'}</button>}

      {inlineTiming && action.entity_id && (
        <div className="next-best-action-inline-tool">
          <BenchTimegrapher
            workspaceId={workspaceId}
            itemId={itemId}
            workId={workId}
            workStepCheckId={action.entity_id}
            defaultCheckpoint={action.timing_checkpoint ?? 'other'}
            onSaved={refreshAll}
          />
        </div>
      )}

      {action.action_type === 'diagnostic_check' && <p className="next-best-action-hint">Open Diagnosis in Bench Mode to record the result and see which hypotheses it supports or rules out.</p>}
      {action.tool_key === 'parts' && <p className="next-best-action-hint">Open Parts in Bench Mode to search stock, donors and compatibility evidence.</p>}
      {action.action_type === 'step_check' && !inlineTiming && <p className="next-best-action-hint">This check is active in the current guided stage. Open Bench Mode for its structured result and evidence capture.</p>}
      {message && <p className="next-best-action-message">{message}</p>}
    </section>}

    {queuedDiagnostic && !queuedIsCurrent && <section className="section-card queued-diagnostic-card">
      <div>
        <p className="eyebrow">QUEUED DIAGNOSTIC CHECK</p>
        <h3>{queuedDiagnostic.label}</h3>
        {queuedDiagnostic.description && <p>{queuedDiagnostic.description}</p>}
      </div>
      <div className="queued-diagnostic-stage"><span>Scheduled for</span><strong>{queuedStage?.label ?? 'Procedure stage'}</strong></div>
      <small>Calibre will surface this as a required guided question when its procedure stage is reached. It does not replace the current workshop action.</small>
    </section>}

    <CalibreReasoningPanel workspaceId={workspaceId} itemId={itemId} workId={workId} refreshKey={refreshKey} onChanged={refreshAll} />
  </div>
}
