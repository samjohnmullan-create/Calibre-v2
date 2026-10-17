import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-lifecycle-controls.css'

type WorkStatus = 'queued' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete' | 'cancelled'
type Action = 'queue' | 'cancel' | 'cancel_qc'

type WorkState = {
  status: WorkStatus
  waiting_reason: string | null
  blocker: string
}

const actionCopy: Record<Action, { title: string; copy: string; confirm: string }> = {
  queue: { title: 'Remove from bench', copy: 'Finish any active bench session and return this Work to the queue without losing history.', confirm: 'Remove from bench' },
  cancel: { title: 'Cancel Work', copy: 'Close this Work permanently as cancelled while preserving its checklist, timing, notes, costs and audit history.', confirm: 'Cancel Work' },
  cancel_qc: { title: 'Leave release review', copy: 'Leave Release review and return the Work to active bench status so corrections can continue.', confirm: 'Return to bench' },
}

function statusLabel(status: WorkStatus) {
  if (status === 'qc') return 'Release review'
  return status.replaceAll('_', ' ')
}

export default function BenchLifecycleControls({
  workspaceId,
  itemId,
  workId,
  fallbackStatus,
  activeSessionId,
  onChanged,
}: {
  workspaceId: string
  itemId: string
  workId: string
  fallbackStatus: WorkStatus
  activeSessionId: string | null
  onChanged: () => Promise<void> | void
}) {
  const [state, setState] = useState<WorkState>({ status: fallbackStatus, waiting_reason: null, blocker: '' })
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    const result = await supabase.from('work_records').select('status,waiting_reason,blocker').eq('workspace_id', workspaceId).eq('id', workId).maybeSingle()
    if (result.error || !result.data) return
    setState({
      status: result.data.status as WorkStatus,
      waiting_reason: result.data.waiting_reason ?? null,
      blocker: result.data.blocker ?? '',
    })
  }

  useEffect(() => { setState((current) => ({ ...current, status: fallbackStatus })); void load() }, [workspaceId, workId, fallbackStatus])

  const terminal = state.status === 'complete' || state.status === 'cancelled'

  async function closeSession(action: Action) {
    if (!activeSessionId) return true
    const result = await supabase.rpc('finish_work_session', {
      p_workspace_id: workspaceId,
      p_session_id: activeSessionId,
      p_note: `Bench session closed by lifecycle action: ${action.replaceAll('_', ' ')}`,
    })
    if (result.error) {
      setMessage(`Active bench session could not be closed: ${result.error.message}`)
      return false
    }
    return true
  }

  async function transition(action: Action) {
    if (saving || terminal) return
    setSaving(true)
    setMessage('')

    const closed = await closeSession(action)
    if (!closed) { setSaving(false); return }

    const fromStatus = state.status
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { updated_at: now, completed_at: null }
    let toStatus: WorkStatus = state.status
    let summary = ''

    if (action === 'queue') {
      toStatus = 'queued'
      Object.assign(patch, { status: toStatus, waiting_reason: null, blocker: '' })
      summary = 'Work removed from bench'
    } else if (action === 'cancel') {
      toStatus = 'cancelled'
      Object.assign(patch, { status: toStatus, waiting_reason: null, blocker: '', completed_at: now })
      summary = reason.trim() ? `Work cancelled · ${reason.trim()}` : 'Work cancelled'
    } else if (action === 'cancel_qc') {
      if (state.status !== 'qc') { setSaving(false); return }
      toStatus = 'on_bench'
      Object.assign(patch, { status: toStatus, waiting_reason: null, blocker: '' })
      summary = 'Release review cancelled; Work returned to bench'
    }

    const update = await supabase.from('work_records').update(patch).eq('workspace_id', workspaceId).eq('id', workId)
    if (update.error) {
      setSaving(false)
      setMessage(`Work lifecycle could not be changed: ${update.error.message}`)
      await load()
      return
    }

    const eventType: Record<Action, string> = {
      queue: 'work_removed_from_bench', cancel: 'work_cancelled', cancel_qc: 'qc_cancelled',
    }
    const event = await supabase.from('work_events').insert({
      workspace_id: workspaceId,
      work_id: workId,
      item_id: itemId,
      event_type: eventType[action],
      summary,
      details: { source: 'bench_lifecycle', from_status: fromStatus, to_status: toStatus, reason: reason.trim() || null },
      actor_type: 'user',
    })
    if (event.error) console.warn('Lifecycle changed but audit event could not be recorded', event.error)

    setConfirming(null)
    setReason('')
    setState({ status: toStatus, waiting_reason: null, blocker: '' })
    setSaving(false)
    setMessage(summary)
    await onChanged()
  }

  if (terminal) return null

  return <section className="bench-lifecycle-controls" aria-label="Work lifecycle controls">
    <div className="bench-lifecycle-heading"><div><span>WORK LIFECYCLE</span><strong>{statusLabel(state.status)}</strong></div><small>Pause and resume working time in Bench Mode. Waiting is reserved for genuine blockers or external dependencies.</small></div>
    <div className="bench-lifecycle-actions">
      {state.status !== 'queued' && <button type="button" className="secondary" onClick={() => setConfirming('queue')} disabled={saving}>Remove from bench</button>}
      {state.status === 'qc' && <button type="button" className="secondary" onClick={() => setConfirming('cancel_qc')} disabled={saving}>Return to bench</button>}
      <button type="button" className="secondary danger" onClick={() => setConfirming('cancel')} disabled={saving}>Cancel Work</button>
    </div>

    {confirming && <div className="bench-lifecycle-confirm">
      <div><strong>{actionCopy[confirming].title}</strong><p>{actionCopy[confirming].copy}</p></div>
      {confirming === 'cancel' && <label>Reason <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional but useful for permanent history" autoFocus /></label>}
      <div><button type="button" className="secondary" onClick={() => { setConfirming(null); setReason('') }} disabled={saving}>Back</button><button type="button" className={confirming === 'cancel' ? 'danger' : ''} onClick={() => void transition(confirming)} disabled={saving}>{saving ? 'Saving…' : actionCopy[confirming].confirm}</button></div>
    </div>}
    {message && <p className="bench-lifecycle-message">{message}</p>}
  </section>
}
