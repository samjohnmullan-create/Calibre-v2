import { useEffect, useMemo, useState } from 'react'
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
}
type ItemRow = { id: string; item_number: number; title: string; type: string }
type ViewKey = 'active' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete'

const views: { key: ViewKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'ready', label: 'Ready' },
  { key: 'on_bench', label: 'On bench' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'qc', label: 'QC' },
  { key: 'complete', label: 'Complete' },
]

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isWorkbench() {
  return window.location.hash.replace(/\/$/, '') === '#/workbench'
}

export default function WorkbenchRoute() {
  const [active, setActive] = useState(isWorkbench)
  const [workspaceId, setWorkspaceId] = useState('')
  const [work, setWork] = useState<WorkRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [view, setView] = useState<ViewKey>('active')
  const [query, setQuery] = useState('')
  const [selectedWorkId, setSelectedWorkId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selectedWork = work.find((record) => record.id === selectedWorkId) ?? null

  useEffect(() => {
    const sync = () => setActive(isWorkbench())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

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

  async function load() {
    if (!active || !workspaceId) return
    setLoading(true)
    const [workResult, itemResult] = await Promise.all([
      supabase.from('work_records')
        .select('id,item_id,work_number,type,title,status,waiting_reason,priority,next_action,blocker,diagnosis,opened_at,completed_at')
        .eq('workspace_id', workspaceId)
        .order('priority', { ascending: false })
        .order('work_number', { ascending: false }),
      supabase.from('items')
        .select('id,item_number,title,type')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null),
    ])
    setLoading(false)
    const error = workResult.error ?? itemResult.error
    if (error) {
      setMessage(`Workbench failed to load: ${error.message}`)
      return
    }
    setWork((workResult.data ?? []) as WorkRow[])
    setItems((itemResult.data ?? []) as ItemRow[])
    setMessage('')
  }

  useEffect(() => { if (active && workspaceId) void load() }, [active, workspaceId])

  const counts = useMemo(() => ({
    active: work.filter((record) => !['complete', 'cancelled'].includes(record.status)).length,
    ready: work.filter((record) => record.status === 'ready').length,
    on_bench: work.filter((record) => record.status === 'on_bench').length,
    waiting: work.filter((record) => record.status === 'waiting').length,
    qc: work.filter((record) => record.status === 'qc').length,
    complete: work.filter((record) => record.status === 'complete').length,
  }), [work])

  const visibleWork = useMemo(() => {
    const text = query.trim().toLowerCase()
    return work.filter((record) => {
      if (record.status === 'cancelled') return false
      if (view === 'active' && ['complete', 'cancelled'].includes(record.status)) return false
      if (view !== 'active' && record.status !== view) return false
      if (!text) return true
      const item = itemById.get(record.item_id)
      return [
        String(record.work_number),
        item ? String(item.item_number) : '',
        item?.title ?? '',
        record.title,
        record.type,
        record.status,
        record.next_action,
        record.blocker,
        record.diagnosis,
      ].some((value) => value.toLowerCase().includes(text))
    })
  }, [work, itemById, view, query])

  function closeJob() {
    setSelectedWorkId('')
    void load()
  }

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
          <div className="workbench-v2-list-heading"><div><p className="eyebrow">{view === 'active' ? 'ACTIVE WORK' : titleCase(view)}</p><h2>{visibleWork.length} job{visibleWork.length === 1 ? '' : 's'}</h2></div>{query && <button type="button" className="secondary small" onClick={() => setQuery('')}>Clear search</button>}</div>
          {visibleWork.length === 0 ? (
            <div className="workbench-v2-empty"><strong>Nothing here.</strong><span>{query ? 'Try a different search.' : 'This view has no Work records right now.'}</span></div>
          ) : (
            <div className="workbench-v2-cards">
              {visibleWork.map((record) => {
                const item = itemById.get(record.item_id)
                return (
                  <button type="button" className={`workbench-v2-card status-${record.status}`} key={record.id} onClick={() => setSelectedWorkId(record.id)}>
                    <div className="workbench-v2-card-top">
                      <div><span>Work #{record.work_number}</span>{item && <span>Item #{item.item_number}</span>}</div>
                      <span className={`status-pill status-${record.status}`}>{titleCase(record.status)}</span>
                    </div>
                    <h3>{item?.title || record.title}</h3>
                    <p className="workbench-v2-work-type">{titleCase(record.type)} · {record.title}</p>
                    <div className="workbench-v2-next"><span>Next</span><strong>{record.next_action || (record.status === 'waiting' ? 'Resolve blocker' : 'Open Job Card')}</strong></div>
                    {record.status === 'waiting' && <div className="workbench-v2-blocker"><span>{record.waiting_reason ? titleCase(record.waiting_reason) : 'Waiting'}</span><strong>{record.blocker || 'No blocker detail recorded'}</strong></div>}
                    <div className="workbench-v2-card-foot"><span>P{record.priority}</span><span>{new Date(record.opened_at).toLocaleDateString('en-AU')}</span><strong>Open Job Card →</strong></div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      {selectedWork && workspaceId && (
        <div className="workbench-v2-job-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeJob() }}>
          <aside className="workbench-v2-job-panel" role="dialog" aria-modal="true" aria-label={`Work #${selectedWork.work_number} Job Card`}>
            <div className="workbench-v2-job-toolbar">
              <div><span>Work #{selectedWork.work_number}</span><strong>{itemById.get(selectedWork.item_id)?.title || selectedWork.title}</strong></div>
              <div><button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(selectedWork.item_id)}` }}>Open Item</button><button type="button" className="secondary small" onClick={closeJob}>Close</button></div>
            </div>
            <div className="workbench-v2-job-scroll"><WorkJobCard workspaceId={workspaceId} itemId={selectedWork.item_id} focusWorkId={selectedWork.id} /></div>
          </aside>
        </div>
      )}
    </main>
  )
}
