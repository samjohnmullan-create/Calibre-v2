import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './calibre-reasoning.css'

type SupportState = 'strongly_supported' | 'supported' | 'possible' | 'weak' | 'ruled_out' | 'confirmed'
type Hypothesis = {
  title: string
  support_state: SupportState
  rationale: string
  evidence_for: string[]
  evidence_against: string[]
  missing_evidence: string[]
}
type Placement = {
  mode: 'current_stage' | 'existing_stage' | 'manual'
  checklist_step_key: string
  reason: string
}
type ReasoningPayload = {
  summary: string
  leading_conclusion: { title: string; support_state: SupportState; explanation: string }
  hypotheses: Hypothesis[]
  next_check: {
    title: string
    instructions: string
    why: string
    placement?: Placement
    expected_outcomes: { result: string; implication: string }[]
  }
  plan_change: { recommended: boolean; reason: string; suggested_actions: string[] }
  insufficient_evidence: boolean
  warnings: string[]
}
type ReasoningRun = {
  id: string
  model: string
  status: string
  response_payload: ReasoningPayload
  summary: string
  created_at: string
}
type ProcedureStep = {
  id: string
  step_key: string
  label: string
  sequence: number
  status: string
}
type ScheduledCheck = {
  id: string
  source_reasoning_run_id: string
  checklist_step_id: string
  label: string
  status: string
}
type ReasoningFreshness = {
  latest_run_id: string | null
  reasoning_at: string | null
  latest_evidence_at: string | null
  is_stale: boolean
  stale_sources: string[]
  source_timestamps: Record<string, string>
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function evidenceSourceLabel(value: string) {
  const names: Record<string, string> = {
    finding: 'Finding',
    guided_answer: 'Guided answer',
    timing: 'Timing run',
    measurement: 'Measurement',
    movement_identity: 'Movement identity',
    research: 'Research',
    part_fit: 'Part-fit result',
    diagnostic_state: 'Diagnostic state',
    diagnostic_evidence: 'Diagnostic evidence',
    job_plan: 'Job plan',
  }
  return names[value] ?? label(value)
}

export default function CalibreReasoningPanel({
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
  const [runs, setRuns] = useState<ReasoningRun[]>([])
  const [steps, setSteps] = useState<ProcedureStep[]>([])
  const [scheduledChecks, setScheduledChecks] = useState<ScheduledCheck[]>([])
  const [freshness, setFreshness] = useState<ReasoningFreshness | null>(null)
  const [targetStepId, setTargetStepId] = useState('')
  const [loading, setLoading] = useState(true)
  const [analysing, setAnalysing] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!workspaceId || !workId) return
    setLoading(true)
    const [runsResult, stepsResult, scheduledResult, freshnessResult] = await Promise.all([
      supabase
        .from('work_reasoning_runs')
        .select('id,model,status,response_payload,summary,created_at')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('work_checklist_steps')
        .select('id,step_key,label,sequence,status')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .order('sequence', { ascending: true }),
      supabase
        .from('work_step_checks')
        .select('id,source_reasoning_run_id,checklist_step_id,label,status')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .not('source_reasoning_run_id', 'is', null)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_work_reasoning_freshness', { p_workspace_id: workspaceId, p_work_id: workId }),
    ])
    setLoading(false)
    const error = runsResult.error ?? stepsResult.error ?? scheduledResult.error ?? freshnessResult.error
    if (error) {
      setMessage(`Calibre Reasoning could not load: ${error.message}`)
      return
    }

    const nextRuns = (runsResult.data ?? []) as ReasoningRun[]
    const nextSteps = (stepsResult.data ?? []) as ProcedureStep[]
    const nextScheduled = (scheduledResult.data ?? []) as ScheduledCheck[]
    const freshnessRows = (freshnessResult.data ?? []) as ReasoningFreshness[]
    setRuns(nextRuns)
    setSteps(nextSteps)
    setScheduledChecks(nextScheduled)
    setFreshness(freshnessRows[0] ?? null)

    const latestRun = nextRuns[0]
    const placement = latestRun?.response_payload?.next_check?.placement
    const alreadyScheduled = latestRun ? nextScheduled.find((row) => row.source_reasoning_run_id === latestRun.id) : null
    if (alreadyScheduled) {
      setTargetStepId(alreadyScheduled.checklist_step_id)
    } else if (placement?.checklist_step_key) {
      const proposed = nextSteps.find((step) => step.step_key === placement.checklist_step_key && !['done', 'na'].includes(step.status))
      setTargetStepId(proposed?.id ?? '')
    } else {
      setTargetStepId('')
    }
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, refreshKey])

  const latest = runs[0] ?? null
  const reasoning = latest?.response_payload ?? null
  const activeHypotheses = useMemo(() => (reasoning?.hypotheses ?? []).filter((row) => row.support_state !== 'ruled_out'), [reasoning])
  const ruledOut = useMemo(() => (reasoning?.hypotheses ?? []).filter((row) => row.support_state === 'ruled_out'), [reasoning])
  const openSteps = useMemo(() => steps.filter((step) => !['done', 'na'].includes(step.status)), [steps])
  const scheduledForLatest = useMemo(() => latest ? scheduledChecks.find((row) => row.source_reasoning_run_id === latest.id) ?? null : null, [latest, scheduledChecks])
  const scheduledStage = scheduledForLatest ? steps.find((step) => step.id === scheduledForLatest.checklist_step_id) ?? null : null
  const selectedStage = steps.find((step) => step.id === targetStepId) ?? null
  const reasoningStale = Boolean(latest && freshness?.latest_run_id === latest.id && freshness.is_stale)
  const staleSourceText = freshness?.stale_sources.map(evidenceSourceLabel).join(' · ') ?? ''

  async function analyse() {
    if (analysing) return
    setAnalysing(true)
    setMessage('Reviewing current findings, branch answers, timing, parts and movement evidence…')
    const { data, error } = await supabase.functions.invoke('calibre-reasoning', { body: { work_id: workId } })
    setAnalysing(false)
    if (error) {
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context
      let detail = error.message
      try {
        const body = await context?.json?.() as { error?: string } | undefined
        if (body?.error) detail = body.error
      } catch { /* keep the connector error */ }
      setMessage(`Calibre Reasoning could not complete: ${detail}`)
      return
    }
    if (!data?.ok) {
      setMessage(`Calibre Reasoning could not complete: ${data?.error ?? 'Unknown response.'}`)
      return
    }
    setMessage('Reasoning updated from the current workshop evidence.')
    await load()
    await onChanged?.()
  }

  async function addCheckToJob() {
    if (!latest || !targetStepId || scheduling) return
    setScheduling(true)
    setMessage('Adding the diagnostic check to the guided procedure…')
    const { error } = await supabase.rpc('schedule_reasoning_next_check', {
      p_workspace_id: workspaceId,
      p_reasoning_run_id: latest.id,
      p_checklist_step_id: targetStepId,
    })
    setScheduling(false)
    if (error) {
      setMessage(`Diagnostic check could not be added: ${error.message}`)
      return
    }
    setMessage(`Diagnostic check added to ${selectedStage?.label ?? 'the selected procedure stage'}.`)
    await load()
    await onChanged?.()
  }

  return <section className="bench-guided-panel calibre-reasoning-panel">
    <div className="bench-guided-heading calibre-reasoning-heading">
      <div><p className="eyebrow">CALIBRE REASONING</p><strong>Evidence → likely cause → best next check</strong></div>
      <span>{reasoningStale ? 'OUT OF DATE' : 'AI suggestion · not confirmed'}</span>
    </div>

    <div className="calibre-reasoning-intro">
      <p>Calibre uses the live job record as evidence. It should narrow possibilities and choose the check that removes the most uncertainty, not simply produce a longer fault list.</p>
      <button type="button" onClick={() => void analyse()} disabled={analysing}>{analysing ? 'Analysing…' : reasoningStale ? 'Update reasoning' : latest ? 'Re-analyse current evidence' : 'Analyse current evidence'}</button>
    </div>

    {reasoningStale && <div className="calibre-evidence-warning">
      <strong>Reasoning out of date — new evidence recorded.</strong><br />
      <span>The conclusion below is preserved as history, but it no longer represents all current evidence{staleSourceText ? `: ${staleSourceText}.` : '.'}</span>
    </div>}

    {loading && <p className="muted">Loading reasoning history…</p>}
    {message && <p className="calibre-reasoning-message">{message}</p>}

    {!loading && !reasoning && <div className="calibre-reasoning-empty"><strong>No AI reasoning run yet.</strong><span>Record the actual symptom and a few bench observations first, then analyse. Deterministic guided checks continue to work without AI.</span></div>}

    {reasoning && <div className="calibre-reasoning-body">
      <div className="calibre-reasoning-lead">
        <div className="calibre-reasoning-lead-title"><span>{reasoningStale ? 'Previous leading conclusion' : 'Current leading conclusion'}</span><em className={`support-${reasoning.leading_conclusion.support_state}`}>{label(reasoning.leading_conclusion.support_state)}</em></div>
        <h4>{reasoning.leading_conclusion.title}</h4>
        <p>{reasoning.leading_conclusion.explanation}</p>
        <small>{reasoning.summary}</small>
        {reasoning.insufficient_evidence && <div className="calibre-evidence-warning">Evidence is still insufficient for a firm conclusion. The next check is intended to narrow it.</div>}
      </div>

      <div className="calibre-next-check">
        <div><p className="eyebrow">{reasoningStale ? 'PREVIOUS BEST DIAGNOSTIC CHECK' : 'BEST NEXT DIAGNOSTIC CHECK'}</p><strong>{reasoning.next_check.title}</strong></div>
        <p>{reasoning.next_check.instructions}</p>
        <details open><summary>Why this check?</summary><p>{reasoning.next_check.why}</p></details>
        {reasoning.next_check.expected_outcomes.length > 0 && <div className="calibre-outcomes">{reasoning.next_check.expected_outcomes.map((outcome, index) => <div key={`${outcome.result}-${index}`}><strong>If: {outcome.result}</strong><span>{outcome.implication}</span></div>)}</div>}

        {scheduledForLatest ? <div className="calibre-check-scheduled">
          <div><span>Added to job</span><strong>{scheduledStage?.label ?? 'Procedure stage'}</strong></div>
          <small>This becomes a required guided check when that stage is reached. Its answer is saved as diagnostic evidence.</small>
        </div> : !reasoningStale ? <div className="calibre-check-placement">
          <div>
            <span>Schedule this check</span>
            {reasoning.next_check.placement?.reason && <small>{reasoning.next_check.placement.reason}</small>}
          </div>
          <label>
            Procedure stage
            <select value={targetStepId} onChange={(event) => setTargetStepId(event.target.value)}>
              <option value="">Choose procedure stage…</option>
              {openSteps.map((step) => <option key={step.id} value={step.id}>{step.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void addCheckToJob()} disabled={!targetStepId || scheduling}>{scheduling ? 'Adding…' : 'Add to job'}</button>
          {!reasoning.next_check.placement?.checklist_step_key && <small>Calibre could not safely choose a procedure stage for this older/manual recommendation. Choose where the prerequisite will actually be satisfied.</small>}
        </div> : <div className="calibre-check-placement"><div><span>Update before scheduling</span><small>New evidence may change the best diagnostic check. Update reasoning before adding this recommendation to the live Job Plan.</small></div></div>}
      </div>

      {activeHypotheses.length > 0 && <details className="calibre-hypotheses" open><summary>Remaining hypotheses · {activeHypotheses.length}</summary><div>{activeHypotheses.map((row, index) => <article key={`${row.title}-${index}`}>
        <header><strong>{row.title}</strong><em className={`support-${row.support_state}`}>{label(row.support_state)}</em></header>
        <p>{row.rationale}</p>
        <div className="calibre-evidence-columns">
          <div><span>Supports</span>{row.evidence_for.length ? row.evidence_for.map((text, i) => <small key={i}>+ {text}</small>) : <small>None recorded</small>}</div>
          <div><span>Against</span>{row.evidence_against.length ? row.evidence_against.map((text, i) => <small key={i}>− {text}</small>) : <small>None recorded</small>}</div>
          <div><span>Still needed</span>{row.missing_evidence.length ? row.missing_evidence.map((text, i) => <small key={i}>? {text}</small>) : <small>No missing evidence listed</small>}</div>
        </div>
      </article>)}</div></details>}

      {ruledOut.length > 0 && <details className="calibre-ruled-out"><summary>Ruled out · {ruledOut.length}</summary><div>{ruledOut.map((row, index) => <div key={`${row.title}-${index}`}><strong>{row.title}</strong><span>{row.rationale}</span></div>)}</div></details>}

      {reasoning.plan_change.recommended && <div className="calibre-plan-change"><div><p className="eyebrow">JOB PLAN MAY NEED TO CHANGE</p><strong>{reasoning.plan_change.reason}</strong></div>{reasoning.plan_change.suggested_actions.length > 0 && <div>{reasoning.plan_change.suggested_actions.map((action, index) => <span key={index}>{action}</span>)}</div>}<small>Suggestion only — Calibre has not changed the Job Plan.</small></div>}

      {reasoning.warnings.length > 0 && <details className="calibre-reasoning-warnings"><summary>Warnings / limits · {reasoning.warnings.length}</summary>{reasoning.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}

      <div className="calibre-reasoning-meta"><span>{new Date(latest!.created_at).toLocaleString('en-AU')}</span><span>{latest!.model}</span><span>Run {latest!.id.slice(0, 8)}</span>{reasoningStale && freshness?.latest_evidence_at && <span>New evidence {new Date(freshness.latest_evidence_at).toLocaleString('en-AU')}</span>}</div>
      {runs.length > 1 && <details className="calibre-reasoning-history"><summary>Previous reasoning runs · {runs.length - 1}</summary>{runs.slice(1).map((run) => <div key={run.id}><strong>{run.summary || 'Reasoning run'}</strong><span>{new Date(run.created_at).toLocaleString('en-AU')} · {run.model}</span></div>)}</details>}
    </div>}
  </section>
}
