import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { useWorkshopSession } from './WorkshopSessionGate'
import './workbench-attention.css'

type Severity = 'critical' | 'warning' | 'action' | 'info'
type AttentionKind = 'blocker' | 'qc' | 'part' | 'waiting' | 'evidence' | 'ready'

type WorkRow = {
  id: string
  item_id: string
  work_number: number
  item_number: number
  item_title: string
  status: string
  waiting_reason: string | null
  priority: number
  next_action: string
  blocker: string
}

type NeedRow = {
  id: string
  work_record_id: string
  part_type: string
  description: string
  status: string
}

type QcRow = {
  id: string
  work_id: string
  label: string
  check_key: string
  status: string
}

type AttentionEntry = {
  key: string
  kind: AttentionKind
  severity: Severity
  title: string
  detail: string
  meta?: string
  href: string
  action: string
  rank: number
}

type Snapshot = {
  evidence: number
  blocked: number
  waiting: number
  parts: number
  qc: number
  ready: number
}

const activeStatuses = ['queued', 'ready', 'on_bench', 'waiting', 'qc']
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const workHref = (id: string) => `#/workbench/${encodeURIComponent(id)}`

function routeActive() {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0] === 'workbench'
}

function workLabel(work: WorkRow) {
  return work.item_number ? `#${work.item_number} ${work.item_title || `Work #${work.work_number}`}` : `Work #${work.work_number}`
}

export default function WorkbenchAttention() {
  const { workspace } = useWorkshopSession()
  const [active, setActive] = useState(routeActive)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [work, setWork] = useState<WorkRow[]>([])
  const [needs, setNeeds] = useState<NeedRow[]>([])
  const [failedQc, setFailedQc] = useState<QcRow[]>([])
  const [evidenceCount, setEvidenceCount] = useState(0)
  const [overviewOpen, setOverviewOpen] = useState(false)

  useEffect(() => {
    const sync = () => setActive(routeActive())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  async function load() {
    if (!active || !workspace.id) return
    setLoading(true)
    setMessage('')

    const [workResult, needResult, qcResult, evidenceResult] = await Promise.all([
      supabase.from('workbench_jobs')
        .select('id,item_id,work_number,item_number,item_title,status,waiting_reason,priority,next_action,blocker')
        .eq('workspace_id', workspace.id)
        .in('status', activeStatuses)
        .order('priority', { ascending: false })
        .order('work_number', { ascending: false }),
      supabase.from('work_part_needs')
        .select('id,work_record_id,part_type,description,status')
        .eq('workspace_id', workspace.id)
        .in('status', ['open', 'reserved']),
      supabase.from('work_qc_checks')
        .select('id,work_id,label,check_key,status')
        .eq('workspace_id', workspace.id)
        .eq('status', 'failed'),
      supabase.from('knowledge_document_findings')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .eq('review_status', 'candidate'),
    ])

    setLoading(false)
    const error = workResult.error ?? needResult.error ?? qcResult.error ?? evidenceResult.error
    if (error) {
      setMessage(`Attention could not load: ${error.message}`)
      return
    }

    const nextWork = (workResult.data ?? []) as WorkRow[]
    const activeWorkIds = new Set(nextWork.map((row) => row.id))
    setWork(nextWork)
    setNeeds(((needResult.data ?? []) as NeedRow[]).filter((row) => activeWorkIds.has(row.work_record_id)))
    setFailedQc(((qcResult.data ?? []) as QcRow[]).filter((row) => activeWorkIds.has(row.work_id)))
    setEvidenceCount(evidenceResult.count ?? 0)
  }

  useEffect(() => {
    if (!active) return
    void load()
  }, [active, workspace.id])

  useEffect(() => {
    if (!active) return
    let timer: number | undefined
    const refresh = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => void load(), 100)
    }
    window.addEventListener('calibre:work-changed', refresh)
    return () => {
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('calibre:work-changed', refresh)
    }
  }, [active, workspace.id])

  const snapshot = useMemo<Snapshot>(() => {
    const blockedWork = new Set(work.filter((row) => Boolean(row.blocker?.trim())).map((row) => row.id))
    for (const row of failedQc) blockedWork.add(row.work_id)
    return {
      evidence: evidenceCount,
      blocked: blockedWork.size,
      waiting: work.filter((row) => row.status === 'waiting').length,
      parts: needs.length,
      qc: work.filter((row) => row.status === 'qc').length,
      ready: work.filter((row) => row.status === 'ready').length,
    }
  }, [work, needs, failedQc, evidenceCount])

  const entries = useMemo(() => {
    const rows: AttentionEntry[] = []
    const needsByWork = new Map<string, NeedRow[]>()
    const qcByWork = new Map<string, QcRow[]>()

    for (const need of needs) needsByWork.set(need.work_record_id, [...(needsByWork.get(need.work_record_id) ?? []), need])
    for (const check of failedQc) qcByWork.set(check.work_id, [...(qcByWork.get(check.work_id) ?? []), check])

    for (const row of work) {
      const label = workLabel(row)
      const failed = qcByWork.get(row.id) ?? []
      const partNeeds = needsByWork.get(row.id) ?? []

      if (row.blocker?.trim()) {
        rows.push({
          key: `blocker-${row.id}`,
          kind: 'blocker',
          severity: 'critical',
          title: `${label} is blocked`,
          detail: row.blocker.trim(),
          meta: row.next_action ? `Next: ${row.next_action}` : undefined,
          href: workHref(row.id),
          action: 'Open job',
          rank: 100 + row.priority,
        })
      }

      if (failed.length) {
        rows.push({
          key: `qc-${row.id}`,
          kind: 'qc',
          severity: 'critical',
          title: `${label} has failed QC`,
          detail: failed.slice(0, 3).map((check) => check.label || titleCase(check.check_key)).join(' · '),
          meta: `${failed.length} failed check${failed.length === 1 ? '' : 's'}`,
          href: workHref(row.id),
          action: 'Review QC',
          rank: 96 + row.priority,
        })
      }

      if (partNeeds.length) {
        const open = partNeeds.filter((need) => need.status === 'open')
        const reserved = partNeeds.filter((need) => need.status === 'reserved')
        rows.push({
          key: `parts-${row.id}`,
          kind: 'part',
          severity: open.length ? 'warning' : 'action',
          title: open.length ? `${label} needs parts` : `${label} has reserved parts to verify`,
          detail: partNeeds.slice(0, 2).map((need) => need.part_type || need.description || 'Part').join(' · '),
          meta: [open.length ? `${open.length} open` : '', reserved.length ? `${reserved.length} reserved` : ''].filter(Boolean).join(' · '),
          href: workHref(row.id),
          action: open.length ? 'Open job' : 'Verify fit',
          rank: open.length ? 80 + row.priority : 68 + row.priority,
        })
      }

      if (row.status === 'waiting' && !row.blocker?.trim() && !partNeeds.length) {
        rows.push({
          key: `waiting-${row.id}`,
          kind: 'waiting',
          severity: 'warning',
          title: `${label} is waiting`,
          detail: row.waiting_reason ? `Waiting for ${titleCase(row.waiting_reason)}.` : 'No waiting reason has been recorded.',
          meta: row.next_action ? `Next: ${row.next_action}` : undefined,
          href: workHref(row.id),
          action: 'Open job',
          rank: 60 + row.priority,
        })
      }

      if (row.status === 'qc' && !failed.length) {
        rows.push({
          key: `qc-ready-${row.id}`,
          kind: 'ready',
          severity: 'action',
          title: `${label} is at Final QC`,
          detail: row.next_action || 'Complete the remaining QC evidence before release.',
          meta: `Priority P${row.priority}`,
          href: workHref(row.id),
          action: 'Continue QC',
          rank: 48 + row.priority,
        })
      }

      if (row.status === 'ready') {
        rows.push({
          key: `ready-${row.id}`,
          kind: 'ready',
          severity: 'info',
          title: `${label} is ready to pick up`,
          detail: row.next_action || 'Ready to move onto the bench.',
          meta: `Priority P${row.priority}`,
          href: workHref(row.id),
          action: 'Open job',
          rank: 36 + row.priority,
        })
      }
    }

    if (evidenceCount > 0) {
      rows.push({
        key: 'evidence-review',
        kind: 'evidence',
        severity: 'action',
        title: `${evidenceCount} evidence finding${evidenceCount === 1 ? '' : 's'} need review`,
        detail: 'Accept or reject page-level facts before they become reusable workshop knowledge.',
        href: '#/calibre/review',
        action: 'Review evidence',
        rank: 72,
      })
    }

    return rows.sort((a, b) => b.rank - a.rank).slice(0, 6)
  }, [work, needs, failedQc, evidenceCount])

  if (!active) return null

  const actionable = snapshot.blocked + snapshot.waiting + snapshot.parts + snapshot.evidence

  if (!loading && !message && entries.length === 0 && !overviewOpen) {
    return <section className="workbench-attention workbench-attention-compact" aria-label="Workshop attention">
      <strong>✓ No urgent exceptions</strong>
      <button type="button" className="secondary small" aria-expanded={false} onClick={() => setOverviewOpen(true)}>Show overview</button>
    </section>
  }

  return (
    <section className="workbench-attention" aria-label="Workshop attention">
      <div className="workbench-attention-heading">
        <div>
          <p className="eyebrow">NEEDS ATTENTION</p>
          <h2>{loading ? 'Checking workshop state…' : actionable ? 'What needs you now' : 'No urgent exceptions'}</h2>
        </div>
        <div className="workbench-attention-actions">
          {overviewOpen && !entries.length && <button type="button" className="secondary small" aria-expanded={true} onClick={() => setOverviewOpen(false)}>Hide overview</button>}
          <button type="button" className="secondary small" onClick={() => void load()} disabled={loading}>{loading ? 'Checking…' : 'Refresh'}</button>
        </div>
      </div>

      <div className="workbench-attention-snapshot">
        <button type="button" onClick={() => { window.location.hash = '#/calibre/review' }}><span>Evidence</span><strong>{snapshot.evidence}</strong></button>
        <button type="button" className={snapshot.blocked ? 'hot' : ''} onClick={() => { window.location.hash = '#/workbench' }}><span>Blocked</span><strong>{snapshot.blocked}</strong></button>
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>Waiting</span><strong>{snapshot.waiting}</strong></button>
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>Parts</span><strong>{snapshot.parts}</strong></button>
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>Final QC</span><strong>{snapshot.qc}</strong></button>
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>Ready</span><strong>{snapshot.ready}</strong></button>
      </div>

      {message && <p className="workbench-attention-message" role="status">{message}</p>}

      {!loading && entries.length > 0 && (
        <div className="workbench-attention-list">
          {entries.map((entry) => (
            <a href={entry.href} className={`workbench-attention-row ${entry.severity}`} key={entry.key}>
              <span className="workbench-attention-icon" aria-hidden="true">{entry.severity === 'critical' ? '!' : entry.severity === 'warning' ? '△' : entry.kind === 'evidence' ? '◈' : '→'}</span>
              <div>
                <div className="workbench-attention-meta"><span>{titleCase(entry.kind)}</span>{entry.meta && <small>{entry.meta}</small>}</div>
                <strong>{entry.title}</strong>
                <p>{entry.detail}</p>
              </div>
              <b>{entry.action} →</b>
            </a>
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="workbench-attention-clear"><strong>✓ Nothing urgent needs intervention.</strong><span>Pick the next Ready job or continue what is already on the bench.</span></div>
      )}
    </section>
  )
}
