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
type ReasoningPayload = {
  summary: string
  leading_conclusion: { title: string; support_state: SupportState; explanation: string }
  hypotheses: Hypothesis[]
  next_check: {
    title: string
    instructions: string
    why: string
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

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
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
  const [loading, setLoading] = useState(true)
  const [analysing, setAnalysing] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    if (!workspaceId || !workId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('work_reasoning_runs')
      .select('id,model,status,response_payload,summary,created_at')
      .eq('workspace_id', workspaceId)
      .eq('work_id', workId)
      .order('created_at', { ascending: false })
      .limit(6)
    setLoading(false)
    if (error) {
      setMessage(`Calibre Reasoning history could not load: ${error.message}`)
      return
    }
    setRuns((data ?? []) as ReasoningRun[])
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, refreshKey])

  const latest = runs[0] ?? null
  const reasoning = latest?.response_payload ?? null
  const activeHypotheses = useMemo(() => (reasoning?.hypotheses ?? []).filter((row) => row.support_state !== 'ruled_out'), [reasoning])
  const ruledOut = useMemo(() => (reasoning?.hypotheses ?? []).filter((row) => row.support_state === 'ruled_out'), [reasoning])

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

  return <section className="bench-guided-panel calibre-reasoning-panel">
    <div className="bench-guided-heading calibre-reasoning-heading">
      <div><p className="eyebrow">CALIBRE REASONING</p><strong>Evidence → likely cause → best next check</strong></div>
      <span>AI suggestion · not confirmed</span>
    </div>

    <div className="calibre-reasoning-intro">
      <p>Calibre uses the live job record as evidence. It should narrow possibilities and choose the check that removes the most uncertainty, not simply produce a longer fault list.</p>
      <button type="button" onClick={() => void analyse()} disabled={analysing}>{analysing ? 'Analysing…' : latest ? 'Re-analyse current evidence' : 'Analyse current evidence'}</button>
    </div>

    {loading && <p className="muted">Loading reasoning history…</p>}
    {message && <p className="calibre-reasoning-message">{message}</p>}

    {!loading && !reasoning && <div className="calibre-reasoning-empty"><strong>No AI reasoning run yet.</strong><span>Record the actual symptom and a few bench observations first, then analyse. Deterministic guided checks continue to work without AI.</span></div>}

    {reasoning && <div className="calibre-reasoning-body">
      <div className="calibre-reasoning-lead">
        <div className="calibre-reasoning-lead-title"><span>Current leading conclusion</span><em className={`support-${reasoning.leading_conclusion.support_state}`}>{label(reasoning.leading_conclusion.support_state)}</em></div>
        <h4>{reasoning.leading_conclusion.title}</h4>
        <p>{reasoning.leading_conclusion.explanation}</p>
        <small>{reasoning.summary}</small>
        {reasoning.insufficient_evidence && <div className="calibre-evidence-warning">Evidence is still insufficient for a firm conclusion. The next check is intended to narrow it.</div>}
      </div>

      <div className="calibre-next-check">
        <div><p className="eyebrow">BEST NEXT CHECK</p><strong>{reasoning.next_check.title}</strong></div>
        <p>{reasoning.next_check.instructions}</p>
        <details open><summary>Why this check?</summary><p>{reasoning.next_check.why}</p></details>
        {reasoning.next_check.expected_outcomes.length > 0 && <div className="calibre-outcomes">{reasoning.next_check.expected_outcomes.map((outcome, index) => <div key={`${outcome.result}-${index}`}><strong>If: {outcome.result}</strong><span>{outcome.implication}</span></div>)}</div>}
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

      <div className="calibre-reasoning-meta"><span>{new Date(latest!.created_at).toLocaleString('en-AU')}</span><span>{latest!.model}</span><span>Run {latest!.id.slice(0, 8)}</span></div>
      {runs.length > 1 && <details className="calibre-reasoning-history"><summary>Previous reasoning runs · {runs.length - 1}</summary>{runs.slice(1).map((run) => <div key={run.id}><strong>{run.summary || 'Reasoning run'}</strong><span>{new Date(run.created_at).toLocaleString('en-AU')} · {run.model}</span></div>)}</details>}
    </div>}
  </section>
}
