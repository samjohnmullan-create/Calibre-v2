import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-induction-plan.css'

type InductionStatus = 'pending' | 'in_progress' | 'complete' | 'legacy_skipped'
type JobPlanStatus = 'pending' | 'ready' | 'applied'
type CheckStatus = 'pending' | 'pass' | 'problem' | 'na'

type WorkLifecycle = {
  induction_status: InductionStatus
  job_plan_status: JobPlanStatus
  induction_started_at: string | null
  induction_completed_at: string | null
}

type InductionCheck = {
  id: string
  check_key: string
  category: string
  label: string
  description: string
  sequence: number
  required: boolean
  status: CheckStatus
  notes: string
}

type Finding = {
  id: string
  induction_check_id: string | null
  title: string
  details: string
  severity: string
  status: string
}

type PlanAction = {
  id: string
  action_key: string
  label: string
  sequence: number
  procedure_template_id: string | null
  status: string
}

type PlanOption = {
  key: string
  label: string
  description: string
  group: 'movement' | 'external' | 'decision'
}

const planOptions: PlanOption[] = [
  { key: 'mechanical_service', label: 'Full mechanical service', description: 'Strip, clean, inspect, lubricate, reassemble and regulate the movement.', group: 'movement' },
  { key: 'repair_fault', label: 'Repair fault', description: 'Investigate and repair a specific mechanical fault identified during induction.', group: 'movement' },
  { key: 'regulation_timing', label: 'Regulation / timing', description: 'Timing-focused work without committing to a full service.', group: 'movement' },
  { key: 'further_diagnosis', label: 'Further diagnosis', description: 'Continue investigation before deciding whether a larger repair is justified.', group: 'movement' },
  { key: 'movement_replacement', label: 'Movement replacement', description: 'Fit and verify a replacement or donor movement.', group: 'movement' },
  { key: 'crystal_replacement', label: 'Crystal replacement', description: 'Measure, source and fit a replacement crystal.', group: 'external' },
  { key: 'case_clean', label: 'Case clean / polish', description: 'Clean or restore the case within the intended finish and scope.', group: 'external' },
  { key: 'dial_hands', label: 'Dial / hand work', description: 'Correct, clean, refit or restore dial and hand issues.', group: 'external' },
  { key: 'strap_bracelet', label: 'Strap / bracelet', description: 'Replace, repair or refit the strap, bracelet, clasp or spring bars.', group: 'external' },
  { key: 'restoration', label: 'Restoration', description: 'A broader restoration plan spanning multiple areas of the watch.', group: 'external' },
  { key: 'listing_prep', label: 'Prepare for sale', description: 'Final presentation and evidence required to make the Item sale-ready.', group: 'decision' },
  { key: 'sell_as_is', label: 'No repair / sell as-is', description: 'Preserve the induction findings and disclose the watch in its current condition.', group: 'decision' },
  { key: 'donor', label: 'Convert to donor', description: 'Retain cost and history, then manage harvested parts through donor lineage.', group: 'decision' },
  { key: 'other', label: 'Other workshop work', description: 'Record a planned action not covered by the standard options.', group: 'decision' },
]

const resultLabels: Record<CheckStatus, string> = {
  pending: 'Not checked',
  pass: 'OK',
  problem: 'Problem',
  na: 'N/A',
}

export default function WorkInductionPlan({
  workspaceId,
  itemId,
  workId,
  compact = false,
  onChanged,
}: {
  workspaceId: string
  itemId: string
  workId: string
  compact?: boolean
  onChanged?: () => Promise<void> | void
}) {
  const [work, setWork] = useState<WorkLifecycle | null>(null)
  const [checks, setChecks] = useState<InductionCheck[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [planActions, setPlanActions] = useState<PlanAction[]>([])
  const [notesById, setNotesById] = useState<Record<string, string>>({})
  const [selectedPlan, setSelectedPlan] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!workspaceId || !workId) return
    setLoading(true)
    const [workResult, checkResult, findingResult, planResult] = await Promise.all([
      supabase
        .from('work_records')
        .select('induction_status,job_plan_status,induction_started_at,induction_completed_at')
        .eq('workspace_id', workspaceId)
        .eq('id', workId)
        .maybeSingle(),
      supabase
        .from('work_induction_checks')
        .select('id,check_key,category,label,description,sequence,required,status,notes')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .order('sequence', { ascending: true }),
      supabase
        .from('work_findings')
        .select('id,induction_check_id,title,details,severity,status')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .order('created_at', { ascending: true }),
      supabase
        .from('work_plan_actions')
        .select('id,action_key,label,sequence,procedure_template_id,status')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .order('sequence', { ascending: true }),
    ])
    setLoading(false)
    const error = workResult.error ?? checkResult.error ?? findingResult.error ?? planResult.error
    if (error) {
      setMessage(`Workshop induction could not load: ${error.message}`)
      return
    }

    setWork((workResult.data ?? null) as WorkLifecycle | null)
    const nextChecks = (checkResult.data ?? []) as InductionCheck[]
    setChecks(nextChecks)
    setNotesById(Object.fromEntries(nextChecks.map((check) => [check.id, check.notes || ''])))
    setFindings((findingResult.data ?? []) as Finding[])
    setPlanActions((planResult.data ?? []) as PlanAction[])
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, workId])

  const requiredPending = useMemo(() => checks.filter((check) => check.required && check.status === 'pending').length, [checks])
  const answered = useMemo(() => checks.filter((check) => check.status !== 'pending').length, [checks])
  const problemChecks = useMemo(() => checks.filter((check) => check.status === 'problem'), [checks])
  const openFindings = useMemo(() => findings.filter((finding) => finding.status === 'open'), [findings])

  async function changed() {
    await load()
    await onChanged?.()
  }

  async function startInduction() {
    if (saving) return
    setSaving(true)
    setMessage('Starting workshop induction…')
    const { error } = await supabase.rpc('start_work_induction', {
      p_workspace_id: workspaceId,
      p_work_id: workId,
    })
    setSaving(false)
    if (error) {
      setMessage(`Induction could not start: ${error.message}`)
      return
    }
    await changed()
  }

  async function setCheckResult(check: InductionCheck, status: CheckStatus) {
    if (saving) return
    setSaving(true)
    const { error } = await supabase.rpc('set_work_induction_check', {
      p_workspace_id: workspaceId,
      p_check_id: check.id,
      p_status: status,
      p_notes: notesById[check.id] ?? check.notes ?? '',
    })
    setSaving(false)
    if (error) {
      setMessage(`Induction check could not be saved: ${error.message}`)
      return
    }
    await changed()
  }

  async function saveCheckNotes(check: InductionCheck) {
    const note = notesById[check.id] ?? ''
    if (note === (check.notes || '')) return
    setSaving(true)
    const { error } = await supabase.rpc('set_work_induction_check', {
      p_workspace_id: workspaceId,
      p_check_id: check.id,
      p_status: check.status,
      p_notes: note,
    })
    setSaving(false)
    if (error) {
      setMessage(`Induction note could not be saved: ${error.message}`)
      return
    }
    await changed()
  }

  async function completeInduction() {
    if (saving || requiredPending > 0) return
    setSaving(true)
    setMessage('Completing induction…')
    const { error } = await supabase.rpc('complete_work_induction', {
      p_workspace_id: workspaceId,
      p_work_id: workId,
    })
    setSaving(false)
    if (error) {
      setMessage(`Induction could not be completed: ${error.message}`)
      return
    }
    await changed()
  }

  function togglePlan(key: string) {
    setSelectedPlan((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])
  }

  async function applyPlan() {
    if (saving || selectedPlan.length === 0) return
    setSaving(true)
    setMessage('Creating job plan…')
    const { data, error } = await supabase.rpc('apply_work_job_plan', {
      p_workspace_id: workspaceId,
      p_work_id: workId,
      p_actions: selectedPlan,
    })
    setSaving(false)
    if (error) {
      setMessage(`Job plan could not be created: ${error.message}`)
      return
    }
    setMessage(`Job plan created with ${Number(data ?? 0)} checklist steps.`)
    setSelectedPlan([])
    await changed()
  }

  if (loading) return <section className={`work-induction-plan ${compact ? 'compact' : ''}`}><div className="loading-card">Loading workshop induction…</div></section>
  if (!work) return null

  if (work.induction_status === 'legacy_skipped') {
    return (
      <section className={`work-induction-plan legacy ${compact ? 'compact' : ''}`}>
        <div className="work-induction-heading"><div><p className="eyebrow">WORKSHOP INDUCTION</p><h3>Legacy Work record</h3></div><span className="work-induction-state">Not required</span></div>
        <p className="muted">This Work already had workshop history before induction was introduced. Its existing checklist remains the source of truth.</p>
      </section>
    )
  }

  if (work.induction_status === 'pending') {
    return (
      <section className={`work-induction-plan pending ${compact ? 'compact' : ''}`}>
        <div className="work-induction-heading">
          <div><p className="eyebrow">WORKSHOP INDUCTION</p><h3>Assess before deciding the repair</h3></div>
          <span className="work-induction-state">Required</span>
        </div>
        <p className="muted">Start by recording how the watch arrived, whether it runs, what functions work, visible condition and a timing baseline where possible. The repair plan comes after this assessment.</p>
        <div className="work-induction-actions"><button type="button" onClick={() => void startInduction()} disabled={saving}>{saving ? 'Starting…' : 'Start Induction'}</button></div>
        {message && <p className="work-induction-message">{message}</p>}
      </section>
    )
  }

  if (work.induction_status === 'in_progress') {
    return (
      <section className={`work-induction-plan active ${compact ? 'compact' : ''}`}>
        <div className="work-induction-heading">
          <div><p className="eyebrow">WORKSHOP INDUCTION</p><h3>{answered} of {checks.length} checks recorded</h3></div>
          <span className="work-induction-state">{requiredPending ? `${requiredPending} required left` : 'Ready to finish'}</span>
        </div>
        <div className="work-induction-progress"><span style={{ width: `${checks.length ? Math.round((answered / checks.length) * 100) : 0}%` }} /></div>
        <div className="work-induction-checks">
          {checks.map((check) => (
            <article className={`work-induction-check result-${check.status}`} key={check.id}>
              <div className="work-induction-check-copy">
                <div><strong>{check.label}{check.required ? <span className="required-dot">•</span> : null}</strong><span>{resultLabels[check.status]}</span></div>
                {!compact && check.description && <p>{check.description}</p>}
              </div>
              <div className="work-induction-result-buttons" role="group" aria-label={`${check.label} result`}>
                <button type="button" className={check.status === 'pass' ? 'selected' : ''} onClick={() => void setCheckResult(check, 'pass')} disabled={saving}>OK</button>
                <button type="button" className={`problem ${check.status === 'problem' ? 'selected' : ''}`} onClick={() => void setCheckResult(check, 'problem')} disabled={saving}>Problem</button>
                <button type="button" className={check.status === 'na' ? 'selected' : ''} onClick={() => void setCheckResult(check, 'na')} disabled={saving}>N/A</button>
              </div>
              {(check.status === 'problem' || notesById[check.id]) && (
                <textarea
                  rows={compact ? 2 : 3}
                  value={notesById[check.id] ?? ''}
                  onChange={(event) => setNotesById((current) => ({ ...current, [check.id]: event.target.value }))}
                  onBlur={() => void saveCheckNotes(check)}
                  placeholder={check.status === 'problem' ? 'Describe what you found…' : 'Optional induction note…'}
                />
              )}
            </article>
          ))}
        </div>
        <div className="work-induction-actions">
          <button type="button" onClick={() => void completeInduction()} disabled={saving || requiredPending > 0}>{saving ? 'Saving…' : 'Complete Induction'}</button>
          {requiredPending > 0 && <span>{requiredPending} required check{requiredPending === 1 ? '' : 's'} still need a result.</span>}
        </div>
        {message && <p className="work-induction-message">{message}</p>}
      </section>
    )
  }

  if (work.job_plan_status !== 'applied') {
    return (
      <section className={`work-induction-plan planning ${compact ? 'compact' : ''}`}>
        <div className="work-induction-heading">
          <div><p className="eyebrow">INDUCTION COMPLETE</p><h3>Choose the job plan</h3></div>
          <span className={`work-induction-state ${problemChecks.length ? 'attention' : ''}`}>{problemChecks.length} problem{problemChecks.length === 1 ? '' : 's'}</span>
        </div>

        <div className="work-induction-summary">
          <div><strong>{checks.filter((check) => check.status === 'pass').length}</strong><span>OK</span></div>
          <div><strong>{problemChecks.length}</strong><span>Problems</span></div>
          <div><strong>{checks.filter((check) => check.status === 'na').length}</strong><span>N/A</span></div>
        </div>

        {openFindings.length > 0 && (
          <div className="work-induction-findings">
            <p className="eyebrow">FINDINGS</p>
            {openFindings.map((finding) => <div key={finding.id}><strong>{finding.title}</strong>{finding.details && <span>{finding.details}</span>}</div>)}
          </div>
        )}

        <div className="work-plan-intro"><strong>What are you planning to do?</strong><span>Select one or more. Calibre will build the guided checklist after you confirm the plan.</span></div>
        <div className="work-plan-options">
          {planOptions.map((option) => {
            const selected = selectedPlan.includes(option.key)
            return (
              <button type="button" key={option.key} className={selected ? 'selected' : ''} onClick={() => togglePlan(option.key)}>
                <span className="work-plan-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </button>
            )
          })}
        </div>
        <div className="work-induction-actions">
          <button type="button" onClick={() => void applyPlan()} disabled={saving || selectedPlan.length === 0}>{saving ? 'Creating…' : `Create Job Plan${selectedPlan.length ? ` · ${selectedPlan.length}` : ''}`}</button>
        </div>
        {message && <p className="work-induction-message">{message}</p>}
      </section>
    )
  }

  return (
    <section className={`work-induction-plan planned ${compact ? 'compact' : ''}`}>
      <div className="work-induction-heading">
        <div><p className="eyebrow">JOB PLAN</p><h3>{planActions.length ? `${planActions.length} planned action${planActions.length === 1 ? '' : 's'}` : 'Plan applied'}</h3></div>
        <span className="work-induction-state complete">Ready</span>
      </div>
      <div className="work-plan-applied-list">
        {planActions.map((action) => (
          <div key={action.id}>
            <span className="work-plan-sequence">{String(Math.max(1, Math.round(action.sequence / 10))).padStart(2, '0')}</span>
            <span><strong>{action.label}</strong><small>{action.procedure_template_id ? 'Guided procedure' : 'Planned workshop step'}</small></span>
          </div>
        ))}
      </div>
      {message && <p className="work-induction-message">{message}</p>}
    </section>
  )
}
