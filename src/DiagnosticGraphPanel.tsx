import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './diagnostic-graph.css'

type SupportState = 'strongly_supported' | 'supported' | 'possible' | 'weak' | 'ruled_out' | 'confirmed'
type GraphEvidence = {
  stage: string
  step_key: string
  check: string
  check_key: string
  answer: string
  effect: 'supports' | 'weakens' | 'rules_out' | 'confirms'
  strength: 'strong' | 'moderate' | 'weak'
  rationale: string
  note: string
  work_step_check_id: string
}
type GraphRow = {
  hypothesis_key: string
  title: string
  description: string
  category: string
  support_state: SupportState
  score: number
  evidence_count: number
  supports_count: number
  against_count: number
  contradiction: boolean
  evidence_for: GraphEvidence[]
  evidence_against: GraphEvidence[]
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function DiagnosticGraphPanel({
  workspaceId,
  workId,
  refreshKey = 0,
}: {
  workspaceId: string
  workId: string
  refreshKey?: number
}) {
  const [rows, setRows] = useState<GraphRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!workspaceId || !workId) return
    setLoading(true)
    const { data, error: loadError } = await supabase.rpc('get_work_diagnostic_graph', {
      p_workspace_id: workspaceId,
      p_work_id: workId,
    })
    setLoading(false)
    if (loadError) {
      setError(loadError.message)
      return
    }
    setError('')
    setRows((data ?? []) as GraphRow[])
  }

  useEffect(() => { void load() }, [workspaceId, workId, refreshKey])

  const active = useMemo(() => rows.filter((row) => row.support_state !== 'ruled_out'), [rows])
  const ruledOut = useMemo(() => rows.filter((row) => row.support_state === 'ruled_out'), [rows])

  return <section className="diagnostic-graph-panel">
    <div className="diagnostic-graph-heading">
      <div><p className="eyebrow">CROSS-STAGE EVIDENCE</p><strong>What the completed checks currently support or weaken</strong></div>
      <span>Deterministic · live database evidence</span>
    </div>

    {loading && <p className="diagnostic-graph-message">Combining structured findings across the job…</p>}
    {error && <p className="diagnostic-graph-message diagnostic-graph-error">Evidence graph could not load: {error}</p>}
    {!loading && !error && rows.length === 0 && <div className="diagnostic-graph-empty">
      <strong>No mapped structured evidence yet.</strong>
      <span>This graph will build as you answer the new decision-style procedure checks. Older flat Done/Problem history is not guessed or rewritten.</span>
    </div>}

    {!loading && !error && active.length > 0 && <div className="diagnostic-graph-list">
      {active.slice(0, 5).map((row) => <details key={row.hypothesis_key} className={`diagnostic-graph-row graph-${row.support_state}`} open={['confirmed', 'strongly_supported', 'supported'].includes(row.support_state)}>
        <summary>
          <div><strong>{row.title}</strong><small>{row.supports_count} supporting · {row.against_count} against{row.contradiction ? ' · mixed evidence' : ''}</small></div>
          <em>{pretty(row.support_state)}</em>
        </summary>
        <p>{row.description}</p>
        <div className="diagnostic-graph-evidence">
          <div><span>Supports</span>{row.evidence_for.length ? row.evidence_for.map((evidence, index) => <small key={`${evidence.work_step_check_id}-for-${index}`}><b>{evidence.stage}</b> · {evidence.check}: {pretty(evidence.answer)}<br />{evidence.rationale}</small>) : <small>None recorded</small>}</div>
          <div><span>Against</span>{row.evidence_against.length ? row.evidence_against.map((evidence, index) => <small key={`${evidence.work_step_check_id}-against-${index}`}><b>{evidence.stage}</b> · {evidence.check}: {pretty(evidence.answer)}<br />{evidence.rationale}</small>) : <small>None recorded</small>}</div>
        </div>
      </details>)}
    </div>}

    {!loading && !error && ruledOut.length > 0 && <details className="diagnostic-graph-ruled"><summary>Ruled down / out · {ruledOut.length}</summary>{ruledOut.map((row) => <div key={row.hypothesis_key}><strong>{row.title}</strong><span>{row.evidence_against[0]?.rationale ?? 'Current structured evidence rules this cause down.'}</span></div>)}</details>}
  </section>
}
