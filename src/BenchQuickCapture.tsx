import { useState } from 'react'
import { supabase } from './lib/supabase'
import WorkUnifiedCapture, { CaptureStep } from './WorkUnifiedCapture'
import './bench-quick-capture.css'

export default function BenchQuickCapture({
  workspaceId,
  itemId,
  workId,
  workNumber,
  currentStep,
  onSaved,
}: {
  workspaceId: string
  itemId: string
  workId: string
  workNumber: number
  currentStep: CaptureStep | null
  onSaved: () => Promise<void> | void
}) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function updateCurrentStep(status: 'in_progress' | 'done') {
    if (!currentStep || saving) return
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status, updated_at: now, blocked_reason: '' }
    if (currentStep.status === 'not_started') patch.started_at = now
    if (status === 'done') patch.completed_at = now
    else patch.completed_at = null

    setSaving(true)
    const result = await supabase.from('work_checklist_steps')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', currentStep.id)
    setSaving(false)
    if (result.error) {
      setMessage(`Step could not be updated: ${result.error.message}`)
      return
    }
    setMessage(status === 'done' ? 'Step completed.' : 'Step is now in progress.')
    await onSaved()
  }

  return (
    <div className="bench-unified-capture-shell">
      <section className="bench-step-controls" aria-label="Checklist controls">
        <div><span>CHECKLIST</span><strong>{currentStep?.label ?? 'No open step'}</strong></div>
        {currentStep && currentStep.status !== 'in_progress' && <button type="button" className="secondary" onClick={() => void updateCurrentStep('in_progress')} disabled={saving}>{currentStep.status === 'blocked' ? 'Resume step' : 'Begin step'}</button>}
        {currentStep && currentStep.status === 'in_progress' && <button type="button" onClick={() => void updateCurrentStep('done')} disabled={saving}>Complete step</button>}
      </section>
      {message && <p className="bench-quick-message">{message}</p>}
      <WorkUnifiedCapture workspaceId={workspaceId} itemId={itemId} workId={workId} workNumber={workNumber} currentStep={currentStep} onSaved={onSaved} />
    </div>
  )
}
