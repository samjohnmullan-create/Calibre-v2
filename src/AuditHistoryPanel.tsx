import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import SystemHealthPanel from './SystemHealthPanel'

type AuditRow = {
  id: number
  entity_type: string
  entity_id: string | null
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  actor_type: string
  source: string
  created_at: string
}

const pageSize = 50
const ignoredFields = new Set(['updated_at'])

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function changedFields(row: AuditRow) {
  if (row.action === 'insert') return Object.keys(row.new_data ?? {}).filter((key) => !ignoredFields.has(key))
  if (row.action === 'delete') return Object.keys(row.old_data ?? {}).filter((key) => !ignoredFields.has(key))
  const keys = new Set([...Object.keys(row.old_data ?? {}), ...Object.keys(row.new_data ?? {})])
  return [...keys].filter((key) => !ignoredFields.has(key) && JSON.stringify(row.old_data?.[key]) !== JSON.stringify(row.new_data?.[key]))
}

function entityLabel(value: string) {
  const labels: Record<string, string> = {
    items: 'Item',
    work_records: 'Work',
    cost_entries: 'Item cost',
    valuations: 'Valuation',
    sales: 'Sale',
    business_ledger_entries: 'Business ledger',
  }
  return labels[value] ?? titleCase(value)
}

export default function AuditHistoryPanel({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => { setPage(0) }, [typeFilter])

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      let request = supabase
        .from('audit_events')
        .select('id,entity_type,entity_id,action,old_data,new_data,actor_type,source,created_at', { count: 'exact' })
        .eq('workspace_id', workspaceId)

      if (typeFilter) request = request.eq('entity_type', typeFilter)

      const from = page * pageSize
      const result = await request.order('id', { ascending: false }).range(from, from + pageSize - 1)
      if (cancelled) return
      setLoading(false)
      if (result.error) {
        setMessage(`Audit history could not be loaded: ${result.error.message}`)
        return
      }
      const total = result.count ?? 0
      if (page > 0 && from >= total) {
        setPage(Math.max(0, Math.ceil(total / pageSize) - 1))
        return
      }
      setRows((result.data ?? []) as AuditRow[])
      setCount(total)
      setMessage('')
    })()
    return () => { cancelled = true }
  }, [workspaceId, page, typeFilter])

  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const range = useMemo(() => {
    if (!count) return '0 events'
    const first = page * pageSize + 1
    const last = Math.min(count, (page + 1) * pageSize)
    return `${first}–${last} of ${count}`
  }, [count, page])

  function openRow(row: AuditRow) {
    if (!row.entity_id) return
    if (row.entity_type === 'items') window.location.hash = `#/items/${encodeURIComponent(row.entity_id)}`
    if (row.entity_type === 'work_records') window.location.hash = `#/work/${encodeURIComponent(row.entity_id)}`
  }

  return (
    <>
      <SystemHealthPanel workspaceId={workspaceId} />

      <article className="settings-v2-card audit-v2-card">
        <div className="audit-v2-heading">
          <div><p className="eyebrow">AUDIT TRAIL</p><h2>Critical business changes</h2><p className="muted">Database-level history for Item, Work and financial records. This survives page refreshes and does not depend on the UI remembering to log a change.</p></div>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter audit trail">
            <option value="">All audited records</option>
            <option value="items">Items</option>
            <option value="work_records">Work</option>
            <option value="cost_entries">Item costs</option>
            <option value="valuations">Valuations</option>
            <option value="sales">Sales</option>
            <option value="business_ledger_entries">Business ledger</option>
          </select>
        </div>

        {message && <p className="settings-v2-message">{message}</p>}
        {loading && <div className="loading-card">Loading audit trail…</div>}
        {!loading && rows.length === 0 && <div className="audit-v2-empty"><strong>No audit events yet.</strong><span>New changes to audited records will appear here.</span></div>}

        {!loading && rows.length > 0 && <div className="audit-v2-list">
          {rows.map((row) => {
            const fields = changedFields(row)
            const canOpen = Boolean(row.entity_id && (row.entity_type === 'items' || row.entity_type === 'work_records'))
            return (
              <button type="button" className="audit-v2-row" key={row.id} disabled={!canOpen} onClick={() => openRow(row)}>
                <span className={`audit-v2-action action-${row.action}`}>{titleCase(row.action)}</span>
                <span className="audit-v2-copy"><strong>{entityLabel(row.entity_type)}</strong><small>{fields.length ? `${fields.slice(0, 5).map(titleCase).join(', ')}${fields.length > 5 ? ` +${fields.length - 5}` : ''}` : 'Record changed'}</small></span>
                <span className="audit-v2-meta"><strong>{new Date(row.created_at).toLocaleString('en-AU')}</strong><small>{titleCase(row.actor_type)} · {row.source === 'database_trigger' ? 'Database audit' : titleCase(row.source)}</small></span>
              </button>
            )
          })}
        </div>}

        {count > pageSize && <div className="audit-v2-pagination">
          <button type="button" className="secondary small" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
          <span>{range} · Page {page + 1} of {totalPages}</span>
          <button type="button" className="secondary small" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>}
      </article>
    </>
  )
}
