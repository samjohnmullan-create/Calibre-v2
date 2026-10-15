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
  item_number: number
  item_title: string
  item_type: string
}
type ChecklistProgress = {
  completed: number
  total: number
  requiredOpen: number
  blocked: number
  percent: number
}
type ViewKey = 'active' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'queued' | 'complete'
type CommandLaneKey = 'ready' | 'waiting' | 'qc' | 'queued'

const views: { key: ViewKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'ready', label: 'Ready' },
  { key: 'on_bench', label: 'On bench' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'qc', label: 'QC' },
  { key: 'queued', label: 'Queue' },
  { key: 'complete', label: 'Complete' },
]

const commandLanes: { key: CommandLaneKey; label: string; hint: string }[] = [
  { key: 'ready', label: 'Ready next', hint: 'Can be picked up now' },
  { key: 'waiting', label: 'Waiting', hint: 'Blocked or awaiting something' },
  { key: 'qc', label: 'QC', hint: 'Needs final evidence and sign-off' },
  { key: 'queued', label: 'Queue', hint: 'Captured but not yet scheduled' },
]

const pageSize = 40
const emptyProgress: ChecklistProgress = { completed: 0, total: 0, requiredOpen: 0, blocked: 0, percent: 0 }

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

function CommandCard({ record, progress, featured = false, onOpen }: { record: WorkRow; progress: ChecklistProgress; featured?: boolean; onOpen: () => void }) {
  const progressText = progress.total ? `${progress.completed}/${progress.total} steps` : 'Checklist not started'
  return (
    <button type="button" className={`workbench-command-card ${featured ? 'featured' : ''} status-${record.status}`} onClick={onOpen}>
      <div className="workbench-command-card-top">
        <div><span>Work #{record.work_number}</span><span>Item #{record.item_number}</span></div>
        <span className={`status-pill status-${record.status}`}>{titleCase(record.status)}</span>
      </div>
      <div className="workbench-command-title">
        <h3>{record.item_title || record.title}</h3>
        <p>{titleCase(record.type)} · P{record.priority}</p>
      </div>
      <div className="workbench-command-next">
        <span>{record.status === 'waiting' ? 'Blocked / next' : 'Next action'}</span>
        <strong>{record.next_action || (record.status === 'waiting' ? record.blocker || 'Resolve blocker' : 'Open Job Card')}</strong>
      </div>
      {record.status === 'waiting' && record.blocker && record.next_action && (
        <p className="workbench-command-blocker">{record.blocker}</p>
      )}
      <div className="workbench-command-progress" aria-label={`${progress.percent}% checklist complete`}>
        <div><span>{progressText}</span><strong>{progress.total ? `${progress.percent}%` : '—'}</strong></div>
        <div className="workbench-command-progress-track" aria-hidden="true"><span style={{ width: `${progress.percent}%` }} /></div>
      </div>
      <div className="workbench-command-flags">
        {progress.requiredOpen > 0 && <span>{progress.requiredOpen} required open</span>}
        {progress.blocked > 0 && <span className="warning">{progress.blocked} blocked</span>}
        {record.waiting_reason && <span>{titleCase(record.waiting_reason)}</span>}
      </div>
      <div className="workbench-command-open">Open Job Card →</div>
    </button>
  )
}

export default function WorkbenchRoute() {
  const [active, setActive] = useState(isWorkbench)
  const [workspaceId, setWorkspaceId] = useState('')
  const [work, setWork] = useState<WorkRow[]>([])
  const [commandWork, setCommandWork] = useState<WorkRow[]>([])
  const [commandProgress, setCommandProgress] = useState<Record<string, ChecklistProgress>>({})
  const [commandLoading, setCommandLoading] = useState(false)
  const [view, setView] = useState<ViewKey>('active')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedWorkId, setSelectedWorkId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [counts, setCounts] = useState<Record<ViewKey, number>>({ active: 0, ready: 0, on_bench: 0, waiting: 0, qc: 0, queued: 0, complete: 0 })

  const allKnownWork = useMemo(() => {
    const map = new Map<string, WorkRow>()
    for (const record of commandWork) map.set(record.id, record)
    for (const record of work) map.set(record.id, record)
    return [...map.values()]
  }, [commandWork, work])

  const selectedWork = allKnownWork.find((record) => record.id === selectedWorkId) ?? null

  const commandGroups = useMemo(() => ({
    on_bench: commandWork.filter((record) => record.status === 'on_bench'),
    ready: commandWork.filter((record) => record.status === 'ready'),
    waiting: commandWork.filter((record) => record.status === 'waiting'),
    qc: commandWork.filter((record) => record.status === 'qc'),
    queued: commandWork.filter((record) => record.status === 'queued'),
  }), [commandWork])

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

  async function loadSummary() {
    if (!active || !workspaceId) return
    const countBase = () => supabase.from('workbench_jobs').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)
    const [activeResult, readyResult, benchResult, waitingResult, qcResult, queuedResult, completeResult] = await Promise.all([
      countBase().neq('status', 'complete').neq('status', 'cancelled'),
      countBase().eq('status', 'ready'),
      countBase().eq('status', 'on_bench'),
      countBase().eq('status', 'waiting'),
      countBase().eq('status', 'qc'),
      countBase().eq('status', 'queued'),
      countBase().eq('status', 'complete'),
    ])
    const error = activeResult.error ?? readyResult.error ?? benchResult.error ?? waitingResult.error ?? qcResult.error ?? queuedResult.error ?? completeResult.error
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
      queued: queuedResult.count ?? 0,
      complete: completeResult.count ?? 0,
    })
  }

  async function loadCommandCentre() {
    if (!active || !workspaceId) return
    setCommandLoading(true)
    const result = await supabase
      .from('workbench_jobs')
      .select('id,item_id,work_number,type,title,status,waiting_reason,priority,next_action,blocker,diagnosis,opened_at,completed_at,item_number,item_title,item_type')
      .eq('workspace_id', workspaceId)
      .in('status', ['on_bench', 'ready', 'waiting', 'qc', 'queued'])
      .order('priority', { ascending: false })
      .order('work_number', { ascending: false })
      .limit(40)

    if (result.error) {
      setCommandLoading(false)
      setMessage(`Workbench command centre failed to load: ${result.error.message}`)
      return
    }

    const rows = (result.data ?? []) as WorkRow[]
    setCommandWork(rows)
    const ids = rows.map((record) => record.id)
    if (!ids.length) {
      setCommandProgress({})
      setCommandLoading(false)
      return
    }

    const checklistResult = await supabase
      .from('work_checklist_steps')
      .select('work_id,required,status')
      .eq('workspace_id', workspaceId)
      .in('work_id', ids)

    setCommandLoading(false)
    if (checklistResult.error) {
      setMessage(`Workbench checklist progress failed to load: ${checklistResult.error.message}`)
      return
    }

    const progress: Record<string, ChecklistProgress> = {}
    for (const id of ids) progress[id] = { ...emptyProgress }
    for (const step of checklistResult.data ?? []) {
      const row = progress[step.work_id] ?? { ...emptyProgress }
      row.total += 1
      if (step.status === 'done' || step.status === 'na') row.completed += 1
      if (step.required && step.status !== 'done' && step.status !== 'na') row.requiredOpen += 1
      if (step.status === 'blocked') row.blocked += 1
      progress[step.work_id] = row
    }
    for (const row of Object.values(progress)) row.percent = row.total ? Math.round((row.completed / row.total) * 100) : 0
    setCommandProgress(progress)
  }

  useEffect(() => {
    if (!active || !workspaceId) return
    void loadSummary()
    void loadCommandCentre()
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

  useEffect(() => {
    if (!active || !workspaceId) return
    let timer: number | undefined
    const refreshWorkbench = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void loadSummary()
        void loadCommandCentre()
        void loadPage()
      }, 80)
    }
    window.addEventListener('calibre:work-changed', refreshWorkbench)
    return () => {
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('calibre:work-changed', refreshWorkbench)
    }
  }, [active, workspaceId, view, page, debouncedQuery])

  function openJob(record: WorkRow) {
    setSelectedWorkId(record.id)
  }

  function closeJob() {
    setSelectedWorkId('')
    void loadPage()
    void loadSummary()
    void loadCommandCentre()
  }

  const totalPages = Math.max(1, Math.ceil(matchCount / pageSize))
  const firstShown = matchCount === 0 ? 0 : page * pageSize + 1
  const lastShown = Math.min(matchCount, (page + 1) * pageSize)
  const firstReady = commandGroups.ready[0] ?? null

  if (!active) return null

  return (
    <main className="workbench-v2-page">
      <header className="workbench-v2-heading">
        <div>
          <p className="eyebrow">WORKSHOP</p>
          <h1>Workbench</h1>
          <p className="muted">A command centre for what is on the bench, what is ready next, and what is blocking progress.</p>
        </div>
        <button type="button" className="secondary" onClick={() => { window.location.hash = '#/items' }}>Start Work from an Item</button>
      </header>

      {message && <p className="workbench-v2-message">{message}</p>}

      <section className="workbench-command-centre" aria-label="Workbench command centre">
        <div className="workbench-command-section-heading">
          <div><p className="eyebrow">ON MY BENCH</p><h2>{counts.on_bench ? `${counts.on_bench} active ${counts.on_bench === 1 ? 'job' : 'jobs'}` : 'Bench clear'}</h2></div>
          <button type="button" className="secondary small" onClick={() => setView('on_bench')}>View all on bench</button>
        </div>

        {commandLoading ? <div className="loading-card">Loading bench state…</div> : commandGroups.on_bench.length ? (
          <div className="workbench-command-bench-grid">
            {commandGroups.on_bench.map((record) => <CommandCard key={record.id} record={record} progress={commandProgress[record.id] ?? emptyProgress} featured onOpen={() => openJob(record)} />)}
          </div>
        ) : (
          <div className="workbench-command-empty">
            <div><strong>No Work is currently on the bench.</strong><span>{firstReady ? `${firstReady.item_title || firstReady.title} is ready to pick up next.` : 'Move a queued Work record to Ready when it can genuinely be started.'}</span></div>
            {firstReady && <button type="button" className="secondary" onClick={() => openJob(firstReady)}>Open Ready Job</button>}
          </div>
        )}

        <div className="workbench-command-lanes">
          {commandLanes.map((lane) => {
            const records = commandGroups[lane.key]
            return (
              <section className={`workbench-command-lane lane-${lane.key}`} key={lane.key}>
                <button type="button" className="workbench-command-lane-heading" onClick={() => setView(lane.key)}>
                  <div><span>{lane.label}</span><small>{lane.hint}</small></div><strong>{counts[lane.key]}</strong>
                </button>
                <div className="workbench-command-lane-list">
                  {records.length === 0 ? <p>Nothing here.</p> : records.slice(0, 3).map((record) => (
                    <CommandCard key={record.id} record={record} progress={commandProgress[record.id] ?? emptyProgress} onOpen={() => openJob(record)} />
                  ))}
                </div>
                {records.length > 3 && <button type="button" className="workbench-command-more" onClick={() => setView(lane.key)}>+ {records.length - 3} more</button>}
              </section>
            )
          })}
        </div>
      </section>

      <section className="workbench-v2-explorer" aria-label="All Work explorer">
        <div className="workbench-v2-explorer-heading"><div><p className="eyebrow">ALL WORK</p><h2>Find and review jobs</h2></div><span>{counts.active} active</span></div>
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

        {loading ? <div className="loading-card">Loading Workbench…</div> : (
          <section className="workbench-v2-list" aria-label={`${titleCase(view)} Work`}>
            <div className="workbench-v2-list-heading"><div><p className="eyebrow">{view === 'active' ? 'ACTIVE WORK' : titleCase(view)}</p><h2>{matchCount} job{matchCount === 1 ? '' : 's'}</h2></div>{query && <button type="button" className="secondary small" onClick={() => setQuery('')}>Clear search</button>}</div>
            {work.length === 0 ? (
              <div className="workbench-v2-empty"><strong>Nothing here.</strong><span>{query ? 'Try a different search.' : 'This view has no Work records right now.'}</span></div>
            ) : (
              <div className="workbench-v2-cards">
                {work.map((record) => (
                  <button type="button" className={`workbench-v2-card status-${record.status}`} key={record.id} onClick={() => openJob(record)}>
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
      </section>

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
