import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-step-checklist.css'

type StepSummary = {
  id: string
  label: string
  description: string
  status: string
}

type AnswerOption = { value: string; label: string }

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
  answer_kind: 'status' | 'yes_no' | 'choice' | 'text' | 'number' | 'tool_result'
  answer_options: AnswerOption[]
  activation_rule: Record<string, unknown>
  problem_values: string[]
  answer_value: string
  is_active: boolean
  parent_check_id: string | null
  state_reason: string
  source_reasoning_run_id: string | null
  outcome_implications: Record<string, string>
  recommendation_why: string
  origin_kind: 'template' | 'deterministic' | 'ai_reasoning' | 'movement_knowledge' | 'manual'
}

type BenchToolTarget = 'research' | 'diagnosis' | 'timing' | 'parts' | 'knowledge'

function statusLabel(check: StepCheck) {
  if (!check.is_active) return 'Inactive'
  if (check.status === 'not_applicable') return 'N/A'
  if (check.status === 'complete') return check.answer_value ? 'Answered' : 'Done'
  if (check.status === 'problem') return 'Problem'
  if (check.status === 'in_progress') return 'In progress'
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
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [severity, setSeverity] = useState<'info' | 'minor' | 'moderate' | 'major' | 'critical'>('moderate')

  async function load(showLoading = false) {
    if (!workspaceId || !step.id) return
    if (showLoading) setLoading(true)
    const { data, error } = await supabase
      .from('work_step_checks')
      .select('id,check_key,label,description,sequence,required,check_type,tool_key,knowledge_scope,evidence_required,status,result_text,problem_finding_id,answer_kind,answer_options,activation_rule,problem_values,answer_value,is_active,parent_check_id,state_reason,source_reasoning_run_id,outcome_implications,recommendation_why,origin_kind')
      .eq('workspace_id', workspaceId)
      .eq('work_id', workId)
      .eq('checklist_step_id', step.id)
      .order('sequence', { ascending: true })
    if (showLoading) setLoading(false)
    if (error) {
      setMessage(`Step checklist could not load: ${error.message}`)
      return
    }
    const rows = (data ?? []) as StepCheck[]
    setChecks(rows)
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, row.result_text || ''])))
    setAnswers(Object.fromEntries(rows.map((row) => [row.id, row.answer_value || ''])))
    setMessage('')
  }

  useEffect(() => { void load(true) }, [workspaceId, workId, step.id])
  useEffect(() => { if (refreshKey) void load(false) }, [refreshKey])

  const activeChecks = useMemo(() => checks.filter((check) => check.is_active), [checks])
  const completedCount = useMemo(() => activeChecks.filter((check) => check.status === 'complete' || check.status === 'not_applicable').length, [activeChecks])
  const requiredOpen = useMemo(() => activeChecks.filter((check) => check.required && check.status !== 'complete' && check.status !== 'not_applicable'), [activeChecks])
  const inactiveChecks = useMemo(() => checks.filter((check) => !check.is_active), [checks])
  const readyToComplete = activeChecks.length > 0 && requiredOpen.length === 0

  const childrenByParent = useMemo(() => {
    const map = new Map<string, StepCheck[]>()
    for (const check of checks) {
      if (!check.parent_check_id) continue
      const list = map.get(check.parent_check_id) ?? []
      list.push(check)
      map.set(check.parent_check_id, list.sort((a, b) => a.sequence - b.sequence))
    }
    return map
  }, [checks])

  const roots = useMemo(() => checks.filter((check) => !check.parent_check_id && check.is_active).sort((a, b) => a.sequence - b.sequence), [checks])

  async function beginStep() {
    setSavingId('main')
    const { error } = await supabase.rpc('begin_work_checklist_step', { p_workspace_id: workspaceId, p_step_id: step.id })
    setSavingId('')
    if (error) { setMessage(`Step could not start: ${error.message}`); return }
    setMessage('Step started. Calibre will reveal only the checks that remain relevant.')
    await onChanged()
  }

  async function completeStep() {
    if (requiredOpen.length > 0) {
      setMessage(`Complete the remaining required check${requiredOpen.length === 1 ? '' : 's'} first: ${requiredOpen.map((check) => check.label).join(' · ')}`)
      return
    }
    setSavingId('main')
    const { error } = await supabase.rpc('complete_work_checklist_step', { p_workspace_id: workspaceId, p_step_id: step.id })
    setSavingId('')
    if (error) {
      await load(false)
      setMessage(`Stage could not complete: ${error.message}. Review the required checks shown above; the database will not bypass them.`)
      return
    }
    setMessage('Stage complete. Calibre has advanced to the next procedure stage.')
    await onChanged()
  }

  async function updateCheck(check: StepCheck, status: 'complete' | 'not_applicable') {
    setSavingId(check.id)
    const user = await supabase.auth.getUser()
    const patch: Record<string, unknown> = {
      status,
      result_text: drafts[check.id]?.trim() ?? '',
      started_at: check.status === 'not_started' ? new Date().toISOString() : undefined,
      completed_at: new Date().toISOString(),
      completed_by: user.data.user?.id ?? null,
    }
    if (status === 'not_applicable' && check.answer_kind !== 'status') patch.answer_value = ''
    const { error } = await supabase
      .from('work_step_checks')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', check.id)
    if (!error && status === 'not_applicable') {
      await supabase.rpc('recompute_work_step_check_branches', { p_workspace_id: workspaceId, p_checklist_step_id: step.id })
    }
    setSavingId('')
    if (error) { setMessage(`Check could not update: ${error.message}`); return }
    setEditingId('')
    setProblemId('')
    await load(false)
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
    await load(false)
    await onChanged()
  }

  async function answerCheck(check: StepCheck) {
    const answer = (answers[check.id] ?? '').trim()
    if (!answer) { setMessage('Choose or enter an answer first.'); return }
    if (answer === 'other' && !(drafts[check.id] ?? '').trim()) {
      setEditingId(check.id)
      setMessage('Describe what actually happened before saving this outcome.')
      return
    }
    setSavingId(check.id)
    const { data, error } = await supabase.rpc('set_work_step_check_answer', {
      p_workspace_id: workspaceId,
      p_check_id: check.id,
      p_answer: answer,
      p_note: drafts[check.id]?.trim() ?? '',
    })
    setSavingId('')
    if (error) { setMessage(`Answer could not be saved: ${error.message}`); return }
    setEditingId('')
    setProblemId('')
    setMessage(data ? 'Answer saved. A Finding was created and the next relevant branch has been recalculated.' : 'Answer saved as diagnostic evidence. Re-analyse when you want Calibre to narrow the fault again.')
    await load(false)
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
    await load(false)
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

  function renderAnswerControl(check: StepCheck) {
    if (check.answer_kind === 'choice' || check.answer_kind === 'yes_no') {
      return <div className="bench-step-answer-options" role="group" aria-label={`${check.label} answer`}>
        {(check.answer_options ?? []).map((option) => {
          const selected = (answers[check.id] ?? '') === option.value
          const problem = check.problem_values?.includes(option.value)
          return <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className={`${selected ? 'selected' : ''} ${problem ? 'problem-choice' : ''}`}
            disabled={savingId === check.id}
            onClick={() => {
              setAnswers((current) => ({ ...current, [check.id]: option.value }))
              setEditingId(check.id)
              setMessage('')
            }}
          >{option.label}</button>
        })}
      </div>
    }
    if (check.answer_kind === 'text' || check.answer_kind === 'number') {
      return <div className="bench-step-answer-entry">
        {check.answer_kind === 'text'
          ? <textarea rows={2} value={answers[check.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [check.id]: event.target.value }))} placeholder="Record the finding that narrows this branch…" />
          : <input inputMode="decimal" value={answers[check.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [check.id]: event.target.value }))} placeholder="Enter result" />}
        <button type="button" disabled={savingId === check.id || !(answers[check.id] ?? '').trim()} onClick={() => void answerCheck(check)}>{savingId === check.id ? 'Saving…' : check.answer_value ? 'Update answer' : 'Save answer'}</button>
      </div>
    }
    return null
  }

  function renderCheck(check: StepCheck, depth = 0): React.ReactNode {
    if (!check.is_active) return null
    const done = check.status === 'complete' || check.status === 'not_applicable'
    const editing = editingId === check.id || Boolean(check.result_text)
    const recordingProblem = problemId === check.id
    const structured = check.answer_kind !== 'status' && check.answer_kind !== 'tool_result'
    const children = (childrenByParent.get(check.id) ?? []).filter((child) => child.is_active)
    const savedImplication = check.answer_value ? check.outcome_implications?.[check.answer_value] ?? '' : ''
    const selectedChoice = ['choice', 'yes_no'].includes(check.answer_kind) ? (answers[check.id] ?? '').trim() : ''
    const choiceEditing = ['choice', 'yes_no'].includes(check.answer_kind) && editingId === check.id
    const choiceNeedsNote = selectedChoice === 'other'

    return <div key={check.id} className={`bench-step-branch ${depth ? 'is-child' : 'is-root'}`} style={{ marginLeft: `${Math.min(depth, 4) * 18}px` }}>
      <article className={`bench-step-check status-${check.status} ${check.origin_kind === 'ai_reasoning' ? 'is-ai-diagnostic' : ''}`}>
        <div className="bench-step-check-state" aria-hidden="true">{check.status === 'complete' ? '✓' : check.status === 'not_applicable' ? '–' : check.status === 'problem' ? '!' : depth ? '↳' : '○'}</div>
        <div className="bench-step-check-body">
          <div className="bench-step-check-title">
            <div><strong>{check.label}</strong><span>{check.required ? 'Required' : 'Optional'} · {check.check_type.replaceAll('_', ' ')}{check.origin_kind === 'ai_reasoning' ? ' · Calibre Reasoning' : check.origin_kind === 'movement_knowledge' ? ' · Movement Intelligence' : ''}{depth ? ` · branch ${depth}` : ''}</span></div>
            <em>{statusLabel(check)}</em>
          </div>
          {check.description && <p>{check.description}</p>}
          {check.origin_kind === 'ai_reasoning' && check.recommendation_why && <div className="bench-step-ai-context"><strong>Why this check?</strong><span>{check.recommendation_why}</span></div>}
          {check.evidence_required && <small className="bench-step-evidence">Evidence expected</small>}
          {check.knowledge_scope && <small className="bench-step-context">Calibre context: {check.knowledge_scope.replaceAll('_', ' ')}</small>}
          {structured && renderAnswerControl(check)}
          {check.answer_value && <div className="bench-step-answer-saved"><span>Result</span><strong>{check.answer_options?.find((option) => option.value === check.answer_value)?.label ?? check.answer_value}</strong></div>}
          {savedImplication && <div className="bench-step-implication"><strong>What this means</strong><span>{savedImplication}</span></div>}

          {(editing || recordingProblem) && !['text','number'].includes(check.answer_kind) && <textarea rows={2} value={drafts[check.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [check.id]: event.target.value }))} placeholder={recordingProblem ? 'Describe exactly what you found…' : choiceNeedsNote ? 'Describe what actually happened…' : 'Observation / result (optional)…'} />}

          {recordingProblem && <div className="bench-step-problem-controls"><label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="info">Info</option><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="major">Major</option><option value="critical">Critical</option></select></label><button type="button" onClick={() => void recordProblem(check)} disabled={savingId === check.id}>{savingId === check.id ? 'Recording…' : 'Create Finding & diagnose'}</button><button type="button" className="secondary" onClick={() => setProblemId('')}>Cancel</button></div>}

          {!recordingProblem && <div className="bench-step-check-actions">
            {!structured && check.answer_kind !== 'tool_result' && !done && <button type="button" onClick={() => void updateCheck(check, 'complete')} disabled={savingId === check.id}>Done</button>}
            {!structured && check.answer_kind !== 'tool_result' && !done && <button type="button" className="secondary warning" onClick={() => { setProblemId(check.id); setEditingId(check.id) }}>Problem</button>}
            {choiceEditing && <button type="button" onClick={() => void answerCheck(check)} disabled={savingId === check.id || !selectedChoice || (choiceNeedsNote && !(drafts[check.id] ?? '').trim())}>{savingId === check.id ? 'Saving…' : check.answer_value ? 'Update findings' : 'Save findings'}</button>}
            {!done && <button type="button" className="secondary" onClick={() => void updateCheck(check, 'not_applicable')} disabled={savingId === check.id}>N/A</button>}
            {check.tool_key && <button type="button" className="secondary" onClick={() => openTool(check)}>{toolLabel(check.tool_key)}</button>}
            {editingId !== check.id && !['text','number'].includes(check.answer_kind) && <button type="button" className="secondary quiet" onClick={() => setEditingId(check.id)}>{check.result_text ? 'Edit note' : 'Add note'}</button>}
            {editingId === check.id && !done && !structured && <button type="button" className="secondary" onClick={() => void saveObservation(check)} disabled={savingId === check.id}>Save note</button>}
            {check.status === 'problem' && <button type="button" className="secondary" onClick={() => onOpenTool('diagnosis')}>Open Diagnosis</button>}
          </div>}
        </div>
      </article>
      {children.length > 0 && <div className="bench-step-children">{children.map((child) => renderCheck(child, depth + 1))}</div>}
    </div>
  }

  return (
    <section className="bench-step-checklist">
      <div className="bench-step-checklist-head">
        <div>
          <p className="eyebrow">GUIDED STEP</p>
          <strong>{step.label}</strong>
          <small>{completedCount}/{activeChecks.length} active checks cleared · {requiredOpen.length} required remaining</small>
        </div>
        {step.status === 'not_started' && <button type="button" onClick={() => void beginStep()} disabled={savingId === 'main'}>{savingId === 'main' ? 'Starting…' : 'Begin step'}</button>}
      </div>

      <div className="bench-step-flow-note"><strong>Follow the active branch.</strong><span>Your answers reveal the next useful check and suppress questions that no longer matter.</span></div>

      {loading ? <p className="muted">Loading guided checks…</p> : checks.length === 0 ? <p className="bench-step-checklist-empty">No detailed checklist is defined for this procedure step yet. The main step can still be documented with Bench quick capture.</p> : (
        <div className="bench-step-check-list">{roots.map((check) => renderCheck(check))}</div>
      )}

      {inactiveChecks.length > 0 && <details className="bench-step-inactive"><summary>Ruled out / not needed · {inactiveChecks.length}</summary><div>{inactiveChecks.map((check) => <div key={check.id}><strong>{check.label}</strong><span>{check.state_reason || 'Inactive branch'}</span></div>)}</div></details>}

      {checks.length > 0 && <div className="bench-step-checklist-foot">
        <div>
          <strong>{readyToComplete ? 'Stage ready' : `${requiredOpen.length} required check${requiredOpen.length === 1 ? '' : 's'} remaining`}</strong>
          <span>{readyToComplete ? 'All active required checks are complete or explicitly N/A.' : `Complete: ${requiredOpen.map((check) => check.label).join(' · ')}`}</span>
        </div>
        <button type="button" onClick={() => void completeStep()} disabled={!readyToComplete || savingId === 'main' || step.status === 'done'}>{savingId === 'main' ? 'Completing…' : 'Complete stage'}</button>
      </div>}
      {message && <p className="bench-step-checklist-message">{message}</p>}
    </section>
  )
}
