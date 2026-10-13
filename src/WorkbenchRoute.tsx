import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import WorkJobCard from './WorkJobCard'

type WorkStatus = 'queued' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete' | 'cancelled'
type WorkRow = {
  id: string
  item_id: string
  work_number: number
  type: string
  title: string
  status: WorkStatus
  waiting_reason: string | null
  priority: number
  next_action: string
  blocker: string
  diagnosis: string
  opened_at: string
  completed_at: string | null
  item_number: number
  item_title: string
  item_type: string
}
type ViewKey = 'active' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete'

const views: { key: ViewKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'ready', label: 'Ready' },
  { key: 'on_bench', label: 'On bench' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'qc', label: 'QC' },
  { key: 'complete', label: 'Complete' },
]
const pageSize = 40

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isWorkbench() {
  return window.location.hash.replace(/\/$/, '') === '#/workbench'
}

function cleanSearch(value: string) {
  return value.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildSearchExpression(value: string) {
  const text = cleanSearch(value)
  if (!text) return ''
  const pattern = `%${text}%`
  const clauses = [
    `item_title.ilike.${pattern}`,
    `title.ilike.${pattern}`,
    `type.ilike.${pattern}`,
    `status.ilike.${pattern}`,
    `next_action.ilike.${pattern}`,
    `blocker.ilike.${pattern}`,
    `diagnosis.ilike.${pattern}`,
  ]
  if (/^\d+$/.test(text)) {
    clauses.push(`work_number.eq.${Number(text)}`)
    clauses.push(`item_number.eq.${Number(text)}`)
  }
  return clauses.join(',')
}

export default function WorkbenchRoute() {
  const [active, setActive] = useState(isWorkbench)
  const [workspaceId, setWorkspaceId] = useState('')
  const [work, setWork] = useState<WorkRow[]>([])
  const [view, setView] = useState<ViewKey>('active')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedWorkId, setSelectedWorkId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [counts, setCounts] = useState<Record<ViewKey, number>>({ active: 0, ready: 0, on_bench: 0, waiting: 0, qc: 0, complete: 0 })

  const selectedWork = work.find((record) => record.id === selectedWorkId) ?? null

  useEffect(() => {
    const sync = () => setActive(isWorkbench())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setPage(0)
  }, [view, debouncedQuery])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setMessage(`Workbench unavailable: ${result.error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(result.data.id)
    })()
    return () => { cancelled = true }
  }, [active])

  useEffect(() => {
    if (!active || !workspaceId) return
    let cancelled = false
    ;(async () => {
      const countBase = () => supabase.from('workbench_jobs').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)
      const [activeResult, readyResult, benchResult, waitingResult, qcResult, completeResult] = await Promise.all([
        countBase().neq('status', 'complete').neq('status', 'cancelled'),
        countBase().eq('status', 'ready'),
        countBase().eq('status', 'on_bench'),
        countBase().eq('status', 'waiting'),
        countBase().eq('status', 'qc'),
        countBase().eq('status', 'complete'),
      ])
      if (cancelled) return
      const error = activeResult.error ?? readyResult.error ?? benchResult.error ?? waitingResult.error ?? qcResult.error ?? completeResult.error
      if (error) {
        setMessage(`Workbench summary failed to load: ${error.message}`)
        return
      }
      setCounts({
        active: activeResult.count ?? 0,
        ready: readyResult.count ?? 0,
        on_bench: benchResult.count ?? 0,
        waiting: waitingResult.count ?? 0,
        qc: qcResult.count ?? 0,
        complete: completeResult.count ?? 0,
      })
    })()
    return () => { cancelled = true }
  }, [active, workspaceId])

  async function loadPage() {
    if (!active || !workspaceId) return
    setLoading(true)

    let request = supabase
      .from('workbench_jobs')
      .select('id,item_id,work_number,type,title,status,waiting_reason,priority,next_action,blocker,diagnosis,opened_at,completed_at,item_number,item_title,item_type', { count: 'exact' })
      .eq('workspace_id', workspaceId)

    if (view === 'active') request = request.neq('status', 'complete').neq('status', 'cancelled')
    else request = request.eq('status', view)

    const searchExpression = buildSearchExpression(debouncedQuery)
    if (searchExpression) request = request.or(searchExpression)

    const from = page * pageSize
    const to = from + pageSize - 1
    const result = await request
      .order('priority', { ascending: false })
      .order('work_number', { ascending: false })
      .range(from, to)

    setLoading(false)
    if (result.error) {
      setMessage(`Workbench failed to load: ${result.error.message}`)
      return
    }

    const count = result.count ?? 0
    if (page > 0 && from >= count) {
      setPage(Math.max(0, Math.ceil(count / pageSize) - 1))
      return
    }

    setWork((result.data ?? []) as WorkRow[])
    setMatchCount(count)
    setMessage('')
  }

  useEffect(() => { if (active && workspaceId) void loadPage() }, [active, workspaceId, view, page, debouncedQuery])

  function closeJob() {
    setSelectedWorkId('')
    void loadPage()
  }

  const totalPages = Math.max(1, Math.ceil(matchCount / pageSize))
  const firstShown = matchCount === 0 ? 0 : page * pageSize + 1
  const lastShown = Math.min(matchCount, (page + 1) * pageSize)

  if (!active) return null

  return (
    <main className="workbench-v2-page">
      <header className="workbench-v2-heading">
        <div>
          <p className="eyebrow">WORKSHOP</p>
          <h1>Workbench</h1>
          <p className="muted">A focused view of what needs doing now. Parts, timing, measurements and QC stay inside each Job Card.</p>
        </div>
        <button type="button" className="secondary" onClick={() => { window.location.hash = '#/items' }}>Start Work from an Item</button>
      </header>

      <section className="workbench-v2-metrics" aria-label="Workbench summary">
        <button type="button" className={view === 'on_bench' ? 'active' : ''} onClick={() => setView('on_bench')}><span>On bench</span><strong>{counts.on_bench}</strong></button>
        <button type="button" className={view === 'waiting' ? 'active' : ''} onClick={() => setView('waiting')}><span>Waiting</span><strong>{counts.waiting}</strong></button>
        <button type="button" className={view === 'ready' ? 'active' : ''} onClick={() => setView('ready')}><span>Ready</span><strong>{counts.ready}</strong></button>
        <button type="button" className={view === 'qc' ? 'active' : ''} onClick={() => setView('qc')}><span>QC</span><strong>{counts.qc}</strong></button>
      </section>

      <section className="workbench-v2-controls">
        <nav className="workbench-v2-tabs" aria-label="Workbench views">
          {views.map((entry) => (
            <button type="button" key={entry.key} className={view === entry.key ? 'active' : ''} onClick={() => setView(entry.key)}>
              <span>{entry.label}</span><small>{counts[entry.key]}</small>
            </button>
          ))}
        </nav>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Work #, Item #, title, next action…" aria-label="Search workbench" />
      </section>

      {message && <p className="workbench-v2-message">{message}</p>}
      {loading ? <div className="loading-card">Loading Workbench…</div> : (
        <section className="workbench-v2-list" aria-label={`${titleCase(view)} Work`}>
          <div className="workbench-v2-list-heading"><div><p className="eyebrow">{view === 'active' ? 'ACTIVE WORK' : titleCase(view)}</p><h2>{matchCount} job{matchCount === 1 ? '' : 's'}</h2></div>{query && <button type="button" className="secondary small" onClick={() => setQuery('')}>Clear search</button>}</div>
          {work.length === 0 ? (
            <div className="workbench-v2-empty"><strong>Nothing here.</strong><span>{query ? 'Try a different search.' : 'This view has no Work records right now.'}</span></div>
          ) : (
            <div className="workbench-v2-cards">
              {work.map((record) => (
                <button type="button" className={`workbench-v2-card status-${record.status}`} key={record.id} onClick={() => setSelectedWorkId(record.id)}>
                  <div className="workbench-v2-card-top">
                    <div><span>Work #{record.work_number}</span><span>Item #{record.item_number}</span></div>
                    <span className={`status-pill status-${record.status}`}>{titleCase(record.status)}</span>
                  </div>
                  <h3>{record.item_title || record.title}</h3>
                  <p className="workbench-v2-work-type">{titleCase(record.type)} · {record.title}</p>
                  <div className="workbench-v2-next"><span>Next</span><strong>{record.next_action || (record.status === 'waiting' ? 'Resolve blocker' : 'Open Job Card')}</strong></div>
                  {record.status === 'waiting' && <div className="workbench-v2-blocker"><span>{record.waiting_reason ? titleCase(record.waiting_reason) : 'Waiting'}</span><strong>{record.blocker || 'No blocker detail recorded'}</strong></div>}
                  <div className="workbench-v2-card-foot"><span>P{record.priority}</span><span>{new Date(record.opened_at).toLocaleDateString('en-AU')}</span><strong>Open Job Card →</strong></div>
                </button>
              ))}
            </div>
          )}

          {matchCount > pageSize && (
            <div className="workbench-v2-list-heading" aria-label="Workbench pagination">
              <button type="button" className="secondary small" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
              <span>{firstShown}–{lastShown} of {matchCount} · Page {page + 1} of {totalPages}</span>
              <button type="button" className="secondary small" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          )}
        </section>
      )}

      {selectedWork && workspaceId && (
        <div className="workbench-v2-job-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeJob() }}>
          <aside className="workbench-v2-job-panel" role="dialog" aria-modal="true" aria-label={`Work #${selectedWork.work_number} Job Card`}>
            <div className="workbench-v2-job-toolbar">
              <div><span>Work #{selectedWork.work_number}</span><strong>{selectedWork.item_title || selectedWork.title}</strong></div>
              <div><button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(selectedWork.item_id)}` }}>Open Item</button><button type="button" className="secondary small" onClick={closeJob}>Close</button></div>
            </div>
            <div className="workbench-v2-job-scroll"><WorkJobCard workspaceId={workspaceId} itemId={selectedWork.item_id} focusWorkId={selectedWork.id} /></div>
          </aside>
        </div>
      )}
    </main>
  )
}
