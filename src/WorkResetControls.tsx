import { useState } from 'react'
import { supabase } from './lib/supabase'
import './work-reset-controls.css'

type ResetMode = 'procedure' | 'workshop' | 'test_clear'

type ResetOption = {
  title: string
  summary: string
  effect: string
  confirm: string
  danger?: boolean
}

const options: Record<ResetMode, ResetOption> = {
  procedure: {
    title: 'Restart procedure',
    summary: 'Start the guided repair steps again without losing the induction or evidence already gathered.',
    effect: 'Resets procedure/check/QC progress and closes any active bench session. Findings, measurements, timing, photos, parts situation and component/tray state stay intact.',
    confirm: 'Restart procedure',
  },
  workshop: {
    title: 'Restart workshop',
    summary: 'Return this Work to a fresh induction while preserving permanent history.',
    effect: 'Archives the current execution state into Work history, resets induction/procedure/QC, clears current diagnosis and component/tray state, closes open part needs and releases reserved parts. Item, Passport, commerce, evidence and the applied job plan are retained.',
    confirm: 'RESTART WORKSHOP',
    danger: true,
  },
  test_clear: {
    title: 'Clear Test / Demo',
    summary: 'Aggressively return disposable Test/Demo Work to a fresh state.',
    effect: 'Only available for Test/Demo Work. Clears generated workshop execution, findings, timing, measurements, part needs, sessions and plan data. Uploaded media stays attached to the Item so storage files are not orphaned.',
    confirm: 'CLEAR TEST',
    danger: true,
  },
}

export default function WorkResetControls({
  workspaceId,
  workId,
  dataMode,
  onReset,
}: {
  workspaceId: string
  workId: string
  dataMode: 'real' | 'test'
  onReset: () => Promise<void> | void
}) {
  const [selected, setSelected] = useState<ResetMode | null>(null)
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const option = selected ? options[selected] : null
  const needsPhrase = selected === 'workshop' || selected === 'test_clear'
  const canConfirm = !!selected && (!needsPhrase || confirmation.trim().toUpperCase() === option?.confirm)

  function choose(mode: ResetMode) {
    setSelected(mode)
    setReason('')
    setConfirmation('')
    setMessage('')
  }

  async function runReset() {
    if (!selected || saving || !canConfirm) return
    setSaving(true)
    setMessage('Resetting Work…')
    const { error } = await supabase.rpc('reset_work_job', {
      p_workspace_id: workspaceId,
      p_work_id: workId,
      p_mode: selected,
      p_reason: reason.trim(),
    })
    setSaving(false)
    if (error) {
      setMessage(`Work could not be reset: ${error.message}`)
      return
    }

    const success = selected === 'procedure'
      ? 'Procedure restarted. Existing evidence and physical component state were retained.'
      : selected === 'workshop'
        ? 'Workshop restarted from induction. The previous execution state is preserved in Work history.'
        : 'Test/Demo Work cleared and returned to a fresh state.'

    setMessage(success)
    setSelected(null)
    setReason('')
    setConfirmation('')
    await onReset()
  }

  return (
    <details className="work-reset-controls">
      <summary>
        <div><span>RESET / RESTART</span><strong>Recover a job without deleting real history</strong></div>
        <span>Open</span>
      </summary>

      <div className="work-reset-body">
        <div className="work-reset-intro">
          <strong>Choose the smallest reset that fixes the problem.</strong>
          <p>Real Work is audit-preserving. Calibre snapshots the mutable execution state before a restart; Item, Passport and business records are never reset here.</p>
        </div>

        <div className="work-reset-options">
          <button type="button" className={selected === 'procedure' ? 'selected' : ''} onClick={() => choose('procedure')} disabled={saving}>
            <span>01</span><div><strong>{options.procedure.title}</strong><small>{options.procedure.summary}</small></div>
          </button>
          <button type="button" className={`warning ${selected === 'workshop' ? 'selected' : ''}`} onClick={() => choose('workshop')} disabled={saving}>
            <span>02</span><div><strong>{options.workshop.title}</strong><small>{options.workshop.summary}</small></div>
          </button>
          {dataMode === 'test' && (
            <button type="button" className={`danger ${selected === 'test_clear' ? 'selected' : ''}`} onClick={() => choose('test_clear')} disabled={saving}>
              <span>03</span><div><strong>{options.test_clear.title}</strong><small>{options.test_clear.summary}</small></div>
            </button>
          )}
        </div>

        {option && selected && (
          <div className={`work-reset-confirm ${option.danger ? 'danger' : ''}`}>
            <div><span>{option.title.toUpperCase()}</span><strong>{option.effect}</strong></div>
            <label>Reason <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional, but useful in Work history" /></label>
            {needsPhrase && (
              <label>Type <b>{option.confirm}</b> to confirm
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
              </label>
            )}
            <div className="work-reset-confirm-actions">
              <button type="button" className="secondary" onClick={() => { setSelected(null); setConfirmation(''); setReason('') }} disabled={saving}>Back</button>
              <button type="button" className={option.danger ? 'danger' : ''} onClick={() => void runReset()} disabled={saving || !canConfirm}>{saving ? 'Resetting…' : option.title}</button>
            </div>
          </div>
        )}

        {dataMode !== 'test' && <p className="work-reset-real-note">Clear Test/Demo is hidden because this is Real Work.</p>}
        {message && <p className="work-reset-message">{message}</p>}
      </div>
    </details>
  )
}
