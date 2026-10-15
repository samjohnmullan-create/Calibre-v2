import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-findings.css'

type FindingStatus = 'open' | 'resolved' | 'accepted' | 'not_actioned'
type Finding = {
  id: string
  title: string
  details: string
  severity: string
  status: FindingStatus
  finding_type: string
  updated_at: string
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function BenchFindingsPanel({
  workspaceId,
  workId,
  refreshKey = 0,
  onChanged,
}: {
  workspaceId: string
  workId: string
  refreshKey?: number
  onChanged?: () => void | Promise<void>
}) {
  const [findings, setFindings] = useState<Finding[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [message, setMessage] = useState('')

  async function load(showLoading = false) {
    if (!workspaceId || !workId) return
    if (showLoading) setLoading(true)
    const { data, error } = await supabase
      .from('work_findings')
      .select('id,title,details,severity,status,finding_type,updated_at')
      .eq('workspace_id', workspaceId)
      .eq('work_id', workId)
      .order('created_at', { ascending: true })
    if (showLoading) setLoading(false)
    if (error) {
      setMessage(`Findings could not load: ${error.message}`)
      return
    }
    const rows = (data ?? []) as Finding[]
    setFindings(rows)
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, row.details || ''])))
    setMessage('')
  }

  useEffect(() => { void load(true) }, [workspaceId, workId])
  useEffect(() => { if (refreshKey) void load(false) }, [refreshKey])

  async function saveDetails(finding: Finding) {
    const details = (drafts[finding.id] ?? '').trim()
    setSavingId(finding.id)
    const { error } = await supabase
      .from('work_findings')
      .update({ details, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('id', finding.id)
    setSavingId('')
    if (error) {
      setMessage(`Finding could not update: ${error.message}`)
      return
    }
    setMessage('Observation updated. Diagnosis will treat this as factual workshop evidence, not a conclusion.')
    await load(false)
    await onChanged?.()
  }

  async function setStatus(finding: Finding, status: FindingStatus) {
    if (savingId) return
    setSavingId(finding.id)
    const { error } = await supabase
      .from('work_findings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .eq('id', finding.id)
    setSavingId('')
    if (error) {
      setMessage(`Finding status could not update: ${error.message}`)
      return
    }
    setMessage(status === 'open' ? 'Finding reopened.' : `Finding marked ${pretty(status).toLowerCase()}.`)
    await load(false)
    await onChanged?.()
  }

  const open = findings.filter((row) => row.status === 'open')
  const historical = findings.filter((row) => row.status !== 'open')

  return <section className="bench-findings-panel">
    <div className="bench-findings-heading">
      <div><p className="eyebrow">OBSERVED FINDINGS</p><strong>What is actually known from this watch</strong></div>
      <span>{open.length} open</span>
    </div>
    <p className="bench-findings-help">Findings are factual observations. Possible causes belong to the evidence graph and Calibre Reasoning, so this area deliberately does not generate a second set of hypotheses.</p>

    {loading && <p className="muted">Loading findings…</p>}
    {!loading && open.length === 0 && <div className="bench-findings-empty"><strong>No open findings.</strong><span>Problems recorded during induction, guided checks or Bench capture will appear here.</span></div>}

    <div className="bench-findings-list">
      {open.map((finding) => {
        const draft = drafts[finding.id] ?? ''
        const changed = draft.trim() !== (finding.details || '').trim()
        return <article key={finding.id} className={`bench-finding severity-${finding.severity}`}>
          <header><div><span>{pretty(finding.finding_type)} · {pretty(finding.severity)}</span><strong>{finding.title}</strong></div><em>Open</em></header>
          <textarea rows={3} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [finding.id]: event.target.value }))} placeholder="Record exactly what you observe, when it occurs, and any measurement, sound or feel that supports it…" />
          <div className="bench-finding-actions">
            <button type="button" disabled={!changed || savingId === finding.id} onClick={() => void saveDetails(finding)}>{savingId === finding.id ? 'Saving…' : 'Save observation'}</button>
            <button type="button" className="secondary" disabled={Boolean(savingId)} onClick={() => void setStatus(finding, 'resolved')}>Resolved</button>
            <button type="button" className="secondary" disabled={Boolean(savingId)} onClick={() => void setStatus(finding, 'accepted')}>Accept as caveat</button>
            <button type="button" className="secondary quiet" disabled={Boolean(savingId)} onClick={() => void setStatus(finding, 'not_actioned')}>No action</button>
          </div>
        </article>
      })}
    </div>

    {historical.length > 0 && <details className="bench-findings-history"><summary>Resolved / accepted findings · {historical.length}</summary><div>{historical.map((finding) => <article key={finding.id}><div><strong>{finding.title}</strong><span>{pretty(finding.status)} · {pretty(finding.severity)}</span></div>{finding.details && <p>{finding.details}</p>}<button type="button" className="secondary small" disabled={Boolean(savingId)} onClick={() => void setStatus(finding, 'open')}>Reopen</button></article>)}</div></details>}
    {message && <p className="bench-findings-message">{message}</p>}
  </section>
}
