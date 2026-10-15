import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-step-checklist.css'

type StepSummary = {
  id: string
  label: string
  description: string
  status: string
}

type StepCheck = {
  id: string
  check_key: string
  label: string
  description: string
  sequence: number
  required: boolean
  check_type: string
  tool_key: string
  knowledge_scope: string
  evidence_required: boolean
  status: 'not_started' | 'in_progress' | 'complete' | 'not_applicable' | 'problem'
  result_text: string
  problem_finding_id: string | null
}

type BenchToolTarget = 'research' | 'diagnosis' | 'timing' | 'parts' | 'knowledge'

function statusLabel(status: StepCheck['status']) {
  if (status === 'not_applicable') return 'N/A'
  if (status === 'complete') return 'Done'
  if (status === 'problem') return 'Problem'
  if (status === 'in_progress') return 'In progress'
  return 'Open'
}

function toolLabel(tool: string) {
  if (tool === 'timing') return 'Open Timing'
  if (tool === 'research') return 'Open Research'
  if (tool === 'knowledge') return 'Open Knowledge'
  if (tool === 'parts') return 'Open Parts'
  if (tool === 'diagnosis') return 'Open Diagnosis'
  if (tool === 'photo') return 'Photo capture'
  if (tool === 'measurement') return 'Measure'
  return ''
}

export default function BenchStepChecklist({
  workspaceId,
  itemId,
  workId,
  step,
  refreshKey = 0,
  onChanged,
  onOpenTool,
}: {
  workspaceId: string
  itemId: string
  workId: string
  step: StepSummary
  refreshKey?: number
  onChanged: () => Promise<void> | void
  onOpenTool: (tool: BenchToolTarget) => void
}) {
  const [checks, setChecks] = useState<StepCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState('')
  const [problemId, setProblemId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [severity, setSeverity] = useState<'info' | 'minor' | 'moderate' | 'major' | 'critical'>('moderate')

  async function load() {
    if (!workspaceId || !step.id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('work_step_checks')
      .select('id,check_key,label,description,sequence,required,check_type,tool_key,knowledge_scope,evidence_required,status,result_text,problem_finding_id')
      .eq('workspace_id', workspaceId)
      .eq('work_id', workId)
      .eq('checklist_step_id', step.id)
      .order('sequence', { ascending: true })
    setLoading(false)
    if (error) {
      setMessage(`Step checklist could not load: ${error.message}`)
      return
    }
    const rows = (data ?? []) as StepCheck[]
    setChecks(rows)
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, row.result_text || ''])))
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, workId, step.id, refreshKey])

  const completedCount = useMemo(() => checks.filter((check) => check.status === 'complete' || check.status === 'not_applicable').length, [checks])
  const requiredOpen = useMemo(() => checks.filter((check) => check.required && check.status !== 'complete' && check.status !== 'not_applicable'), [checks])
  const readyToComplete = checks.length > 0 && requiredOpen.length === 0

  async function beginStep() {
    setSavingId('main')
    const { error } = await supabase.rpc('begin_work_checklist_step', { p_workspace_id: workspaceId, p_step_id: step.id })
    setSavingId('')
    if (error) { setMessage(`Step could not start: ${error.message}`); return }
    setMessage('Step started. Work through the checks below.')
    await onChanged()
  }

  async function completeStep() {
    setSavingId('main')
    const { error } = await supabase.rpc('complete_work_checklist_step', { p_workspace_id: workspaceId, p_step_id: step.id })
    setSavingId('')
    if (error) { setMessage(`Step could not complete: ${error.message}`); return }
    setMessage('Step complete. Calibre has advanced to the next procedure stage.')
    await onChanged()
  }

  async function updateCheck(check: StepCheck, status: 'complete' | 'not_applicable') {
    setSavingId(check.id)
    const user = await supabase.auth.getUser()
    const { error } = await supabase
      .from('work_step_checks')
      .update({
        status,
        result_text: drafts[check.id]?.trim() ?? '',
        started_at: check.status === 'not_started' ? new Date().toISOString() : undefined,
        completed_at: new Date().toISOString(),
        completed_by: user.data.user?.id ?? null,
      })
      .eq('workspace_id', workspaceId)
      .eq('id', check.id)
    setSavingId('')
    if (error) { setMessage(`Check could not update: ${error.message}`); return }
    setEditingId('')
    setProblemId('')
    await load()
    await onChanged()
  }

  async function saveObservation(check: StepCheck) {
    setSavingId(check.id)
    const { error } = await supabase
      .from('work_step_checks')
      .update({
        result_text: drafts[check.id]?.trim() ?? '',
        status: check.status === 'not_started' ? 'in_progress' : check.status,
        started_at: check.status === 'not_started' ? new Date().toISOString() : undefined,
      })
      .eq('workspace_id', workspaceId)
      .eq('id', check.id)
    setSavingId('')
    if (error) { setMessage(`Observation could not save: ${error.message}`); return }
    setMessage('Observation saved to this step.')
    setEditingId('')
    await load()
    await onChanged()
  }

  async function recordProblem(check: StepCheck) {
    setSavingId(check.id)
    const details = drafts[check.id]?.trim() || check.description
    const { error } = await supabase.rpc('mark_work_step_check_problem', {
      p_workspace_id: workspaceId,
      p_check_id: check.id,
      p_details: details,
      p_severity: severity,
    })
    setSavingId('')
    if (error) { setMessage(`Problem could not be recorded: ${error.message}`); return }
    setMessage('Problem recorded as a Finding. Diagnosis now has this exact procedure context.')
    setProblemId('')
    await load()
    await onChanged()
    onOpenTool('diagnosis')
  }

  function openTool(check: StepCheck) {
    if (check.tool_key === 'photo' || check.tool_key === 'measurement') {
      document.querySelector('.bench-quick-capture')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setMessage(check.tool_key === 'photo' ? 'Use the Photo quick capture below; it will stay linked to this Work and current step.' : 'Use Measure below; the measurement will stay linked to this Work.')
      return
    }
    if (check.tool_key === 'knowledge') onOpenTool('knowledge')
    else if (check.tool_key === 'parts') onOpenTool('parts')
    else if (check.tool_key === 'research') onOpenTool('research')
    else if (check.tool_key === 'timing') onOpenTool('timing')
    else if (check.tool_key === 'diagnosis') onOpenTool('diagnosis')
  }

  return (
    <section className="bench-step-checklist">
      <div className="bench-step-checklist-head">
        <div>
          <p className="eyebrow">STEP CHECKLIST</p>
          <strong>{step.label}</strong>
          <small>{completedCount}/{checks.length} checked · {requiredOpen.length} required remaining</small>
        </div>
        {step.status === 'not_started' && <button type="button" onClick={() => void beginStep()} disabled={savingId === 'main'}>{savingId === 'main' ? 'Starting…' : 'Begin step'}</button>}
      </div>

      {loading ? <p className="muted">Loading step checks…</p> : checks.length === 0 ? <p className="bench-step-checklist-empty">No detailed checklist is defined for this procedure step yet. The main step can still be documented with Bench quick capture.</p> : (
        <div className="bench-step-check-list">
          {checks.map((check) => {
            const done = check.status === 'complete' || check.status === 'not_applicable'
            const editing = editingId === check.id || Boolean(check.result_text)
            const recordingProblem = problemId === check.id
            return (
              <article key={check.id} className={`bench-step-check status-${check.status}`}>
                <div className="bench-step-check-state" aria-hidden="true">{check.status === 'complete' ? '✓' : check.status === 'not_applicable' ? '–' : check.status === 'problem' ? '!' : '○'}</div>
                <div className="bench-step-check-body">
                  <div className="bench-step-check-title">
                    <div><strong>{check.label}</strong><span>{check.required ? 'Required' : 'Optional'} · {check.check_type.replaceAll('_', ' ')}</span></div>
                    <em>{statusLabel(check.status)}</em>
                  </div>
                  {check.description && <p>{check.description}</p>}
                  {check.evidence_required && <small className="bench-step-evidence">Evidence expected</small>}
                  {check.knowledge_scope && <small className="bench-step-context">Calibre context: {check.knowledge_scope.replaceAll('_', ' ')}</small>}

                  {(editing || recordingProblem) && <textarea rows={2} value={drafts[check.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [check.id]: event.target.value }))} placeholder={recordingProblem ? 'Describe exactly what you found…' : 'Observation / result (optional)…'} />}

                  {recordingProblem && <div className="bench-step-problem-controls"><label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="info">Info</option><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="major">Major</option><option value="critical">Critical</option></select></label><button type="button" onClick={() => void recordProblem(check)} disabled={savingId === check.id}>{savingId === check.id ? 'Recording…' : 'Create Finding & diagnose'}</button><button type="button" className="secondary" onClick={() => setProblemId('')}>Cancel</button></div>}

                  {!recordingProblem && <div className="bench-step-check-actions">
                    {!done && <button type="button" onClick={() => void updateCheck(check, 'complete')} disabled={savingId === check.id}>Done</button>}
                    {!done && <button type="button" className="secondary warning" onClick={() => { setProblemId(check.id); setEditingId(check.id) }}>Problem</button>}
                    {!done && <button type="button" className="secondary" onClick={() => void updateCheck(check, 'not_applicable')} disabled={savingId === check.id}>N/A</button>}
                    {check.tool_key && <button type="button" className="secondary" onClick={() => openTool(check)}>{toolLabel(check.tool_key)}</button>}
                    {editingId !== check.id && <button type="button" className="secondary quiet" onClick={() => setEditingId(check.id)}>{check.result_text ? 'Edit note' : 'Add note'}</button>}
                    {editingId === check.id && !done && <button type="button" className="secondary" onClick={() => void saveObservation(check)} disabled={savingId === check.id}>Save note</button>}
                    {check.status === 'problem' && <button type="button" className="secondary" onClick={() => onOpenTool('diagnosis')}>Open Diagnosis</button>}
                  </div>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {checks.length > 0 && <div className="bench-step-checklist-foot">
        <div><strong>{readyToComplete ? 'Stage ready' : `${requiredOpen.length} required check${requiredOpen.length === 1 ? '' : 's'} remaining`}</strong><span>{readyToComplete ? 'All required checks are complete or explicitly N/A.' : 'Problems remain open until the check is later completed or marked N/A.'}</span></div>
        <button type="button" onClick={() => void completeStep()} disabled={!readyToComplete || savingId === 'main' || step.status === 'done'}>{savingId === 'main' ? 'Completing…' : 'Complete stage'}</button>
      </div>}
      {message && <p className="bench-step-checklist-message">{message}</p>}
    </section>
  )
}
