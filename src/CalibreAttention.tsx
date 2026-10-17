import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './calibre-attention.css'

type Severity = 'critical' | 'warning' | 'action' | 'info'
type AttentionKind = 'blocker' | 'qc' | 'part' | 'waiting' | 'evidence' | 'ready'

type WorkRow = {
  id: string
  item_id: string
  work_number: number
  title: string
  status: string
  waiting_reason: string | null
  priority: number
  next_action: string
  blocker: string
  updated_at: string
}

type ItemRow = { id: string; item_number: number; title: string }
type NeedRow = { id: string; work_record_id: string; item_id: string; part_type: string; description: string; status: string; updated_at: string }
type QcRow = { id: string; work_id: string; item_id: string; label: string; check_key: string; status: string; updated_at: string }

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
const workHref = (id: string) => `#/work/${encodeURIComponent(id)}`

function ageLabel(value: string) {
  const time = Date.parse(value || '')
  if (!Number.isFinite(time)) return ''
  const days = Math.max(0, Math.floor((Date.now() - time) / 86_400_000))
  if (days === 0) return 'updated today'
  if (days === 1) return 'updated yesterday'
  return `updated ${days} days ago`
}

function itemLabel(work: WorkRow, items: Map<string, ItemRow>) {
  const item = items.get(work.item_id)
  if (!item) return `Work #${work.work_number}`
  return `#${item.item_number} ${item.title}`
}

export default function CalibreAttention({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [work, setWork] = useState<WorkRow[]>([])
  const [items, setItems] = useState<Map<string, ItemRow>>(new Map())
  const [needs, setNeeds] = useState<NeedRow[]>([])
  const [failedQc, setFailedQc] = useState<QcRow[]>([])
  const [evidenceCount, setEvidenceCount] = useState(0)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setMessage('')

    const [workResult, needResult, qcResult, evidenceResult] = await Promise.all([
      supabase.from('work_records')
        .select('id,item_id,work_number,title,status,waiting_reason,priority,next_action,blocker,updated_at')
        .eq('workspace_id', workspaceId)
        .in('status', activeStatuses)
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: true }),
      supabase.from('work_part_needs')
        .select('id,work_record_id,item_id,part_type,description,status,updated_at')
        .eq('workspace_id', workspaceId)
        .in('status', ['open', 'reserved'])
        .order('updated_at', { ascending: true }),
      supabase.from('work_qc_checks')
        .select('id,work_id,item_id,label,check_key,status,updated_at')
        .eq('workspace_id', workspaceId)
        .eq('status', 'failed')
        .order('updated_at', { ascending: true }),
      supabase.from('knowledge_document_findings')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('review_status', 'candidate'),
    ])

    const baseError = workResult.error ?? needResult.error ?? qcResult.error ?? evidenceResult.error
    if (baseError) {
      setLoading(false)
      setMessage(`Calibre Attention could not load: ${baseError.message}`)
      return
    }

    const nextWork = (workResult.data ?? []) as WorkRow[]
    const nextNeeds = (needResult.data ?? []) as NeedRow[]
    const nextQc = (qcResult.data ?? []) as QcRow[]
    setWork(nextWork)
    setNeeds(nextNeeds)
    setFailedQc(nextQc)
    setEvidenceCount(evidenceResult.count ?? 0)

    const itemIds = [...new Set(nextWork.map((row) => row.item_id).filter(Boolean))]
    if (itemIds.length) {
      const itemResult = await supabase.from('items')
        .select('id,item_number,title')
        .eq('workspace_id', workspaceId)
        .in('id', itemIds)
      if (itemResult.error) {
        setLoading(false)
        setMessage(`Attention loaded, but Item context could not load: ${itemResult.error.message}`)
        return
      }
      const nextItems = (itemResult.data ?? []) as ItemRow[]
      setItems(new Map(nextItems.map((row) => [row.id, row])))
    } else {
      setItems(new Map())
    }

    setLoading(false)
  }

  useEffect(() => { void load() }, [workspaceId])

  const snapshot = useMemo<Snapshot>(() => {
    const blockerIds = new Set(work.filter((row) => Boolean(row.blocker?.trim())).map((row) => row.id))
    const failedQcIds = new Set(failedQc.map((row) => row.work_id))
    return {
      evidence: evidenceCount,
      blocked: new Set([...blockerIds, ...failedQcIds]).size,
      waiting: work.filter((row) => row.status === 'waiting').length,
      parts: needs.length,
      qc: work.filter((row) => row.status === 'qc').length,
      ready: work.filter((row) => row.status === 'ready').length,
    }
  }, [work, failedQc, needs, evidenceCount])

  const entries = useMemo(() => {
    const rows: AttentionEntry[] = []
    const workById = new Map(work.map((row) => [row.id, row]))
    const needsByWork = new Map<string, NeedRow[]>()
    const qcByWork = new Map<string, QcRow[]>()

    for (const need of needs) needsByWork.set(need.work_record_id, [...(needsByWork.get(need.work_record_id) ?? []), need])
    for (const check of failedQc) qcByWork.set(check.work_id, [...(qcByWork.get(check.work_id) ?? []), check])

    for (const row of work) {
      const label = itemLabel(row, items)
      const failed = qcByWork.get(row.id) ?? []
      const partNeeds = needsByWork.get(row.id) ?? []

      if (row.blocker?.trim()) {
        rows.push({
          key: `blocker-${row.id}`,
          kind: 'blocker',
          severity: 'critical',
          title: `${label} is blocked`,
          detail: row.blocker.trim(),
          meta: [row.next_action && `Next: ${row.next_action}`, ageLabel(row.updated_at)].filter(Boolean).join(' · '),
          href: workHref(row.id),
          action: 'Open work',
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
        const examples = partNeeds.slice(0, 2).map((need) => need.part_type || need.description || 'Part').join(' · ')
        rows.push({
          key: `parts-${row.id}`,
          kind: 'part',
          severity: open.length ? 'warning' : 'action',
          title: open.length ? `${label} needs parts` : `${label} has reserved parts to verify`,
          detail: examples,
          meta: [open.length ? `${open.length} open` : '', reserved.length ? `${reserved.length} reserved` : ''].filter(Boolean).join(' · '),
          href: workHref(row.id),
          action: open.length ? 'Open parts need' : 'Verify fit',
          rank: open.length ? 80 + row.priority : 68 + row.priority,
        })
      }

      if (row.status === 'waiting' && !row.blocker?.trim() && partNeeds.length === 0) {
        rows.push({
          key: `waiting-${row.id}`,
          kind: 'waiting',
          severity: 'warning',
          title: `${label} is waiting`,
          detail: row.waiting_reason ? `Waiting for ${titleCase(row.waiting_reason)}.` : 'No waiting reason has been recorded.',
          meta: [row.next_action && `Next: ${row.next_action}`, ageLabel(row.updated_at)].filter(Boolean).join(' · '),
          href: workHref(row.id),
          action: 'Open work',
          rank: 60 + row.priority,
        })
      }

      if (row.status === 'qc' && failed.length === 0) {
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
          action: 'Open work',
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
        detail: 'Accept or reject page-level facts before they can become reusable workshop knowledge.',
        href: '#/calibre/review',
        action: 'Review evidence',
        rank: 72,
      })
    }

    return rows.sort((a, b) => b.rank - a.rank).slice(0, 12)
  }, [work, items, needs, failedQc, evidenceCount])

  const activeWork = work.length
  const totalAttention = snapshot.blocked + snapshot.waiting + snapshot.parts + snapshot.evidence

  return (
    <main className="attention-page">
      <section className="attention-hero">
        <div>
          <p className="eyebrow">CALIBRE ATTENTION</p>
          <h1>What needs you now</h1>
          <p className="muted">Exceptions first. Evidence next. Routine work stays out of the way until it becomes actionable.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>{loading ? 'Checking…' : 'Refresh'}</button>
      </section>

      {message && <p className="attention-message" role="status">{message}</p>}

      <section className="attention-snapshot" aria-label="Workshop attention snapshot">
        <article><span>Needs review</span><strong>{snapshot.evidence}</strong><small>Library evidence</small></article>
        <article className={snapshot.blocked ? 'hot' : ''}><span>Blocked</span><strong>{snapshot.blocked}</strong><small>Blockers / failed QC</small></article>
        <article><span>Waiting</span><strong>{snapshot.waiting}</strong><small>Work records</small></article>
        <article><span>Parts</span><strong>{snapshot.parts}</strong><small>Open / reserved needs</small></article>
        <article><span>At QC</span><strong>{snapshot.qc}</strong><small>Final validation</small></article>
        <article><span>Ready</span><strong>{snapshot.ready}</strong><small>Ready to pick up</small></article>
      </section>

      <section className="attention-main">
        <div className="attention-heading">
          <div><p className="eyebrow">NEXT ACTIONS</p><h2>{loading ? 'Checking workshop state…' : totalAttention ? 'Prioritised attention' : 'Workshop is clear'}</h2></div>
          {!loading && <span>{activeWork} active work</span>}
        </div>

        {loading ? <div className="attention-empty"><strong>Reading workshop evidence…</strong><p>Checking Work, Parts, QC and Library review state.</p></div> : entries.length === 0 ? (
          <div className="attention-empty clear"><strong>✓ Nothing urgent is asking for attention.</strong><p>Use Workbench to choose the next queued or ready job.</p><a className="attention-primary-link" href="#/workbench">Open Workbench</a></div>
        ) : (
          <div className="attention-list">
            {entries.map((entry) => (
              <article className={`attention-row ${entry.severity}`} key={entry.key}>
                <span className="attention-icon" aria-hidden="true">{entry.severity === 'critical' ? '!' : entry.severity === 'warning' ? '△' : entry.kind === 'evidence' ? '◈' : '→'}</span>
                <div className="attention-copy">
                  <div className="attention-row-top"><span>{titleCase(entry.kind)}</span>{entry.meta && <small>{entry.meta}</small>}</div>
                  <strong>{entry.title}</strong>
                  <p>{entry.detail}</p>
                </div>
                <a href={entry.href}>{entry.action}</a>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="attention-principle">
        <div><p className="eyebrow">SIGNAL, NOT NOISE</p><strong>Calibre only escalates what has evidence behind it.</strong></div>
        <p>Potential donor alerts will appear here only when a real movement or part compatibility signal supports them — not because two descriptions happen to look similar.</p>
      </section>
    </main>
  )
}
