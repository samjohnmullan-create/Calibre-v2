import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type ItemRow = { id: string; item_number: number; title: string; status: string; purpose: string; created_at: string }
type WorkRow = { id: string; item_id: string; work_number: number; title: string; status: string; waiting_reason: string | null; next_action: string; blocker: string; priority: number; opened_at: string }
type InvoiceRow = { id: string; vendor_name: string; invoice_number: string; original_filename: string; extraction_status: string; created_at: string }
type HomeCounts = { totalItems: number; activeWork: number; onBench: number; waiting: number; ready: number; intake: number; readyForSale: number }

const emptyCounts: HomeCounts = { totalItems: 0, activeWork: 0, onBench: 0, waiting: 0, ready: 0, intake: 0, readyForSale: 0 }

function isHomeRoute() {
  return window.location.hash.replace(/\/$/, '') === '#/home'
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function HomeRoute() {
  const [active, setActive] = useState(isHomeRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [counts, setCounts] = useState<HomeCounts>(emptyCounts)
  const [waitingWork, setWaitingWork] = useState<WorkRow[]>([])
  const [qcWork, setQcWork] = useState<WorkRow[]>([])
  const [unreadInvoices, setUnreadInvoices] = useState<InvoiceRow[]>([])
  const [readyForSale, setReadyForSale] = useState<ItemRow[]>([])
  const [recentItems, setRecentItems] = useState<ItemRow[]>([])
  const [recentWork, setRecentWork] = useState<WorkRow[]>([])
  const [itemById, setItemById] = useState<Map<string, ItemRow>>(new Map())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => setActive(isHomeRoute())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('home-route-active', active)
    return () => document.body.classList.remove('home-route-active')
  }, [active])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setMessage(`Home unavailable: ${result.error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(result.data.id)
    })()
    return () => { cancelled = true }
  }, [active])

  async function load() {
    if (!workspaceId) return
    setLoading(true)

    const itemCountBase = () => supabase.from('items').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null)
    const workCountBase = () => supabase.from('work_records').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)

    const [
      totalItemsResult,
      activeWorkResult,
      onBenchCountResult,
      waitingCountResult,
      readyCountResult,
      intakeCountResult,
      readySaleCountResult,
      waitingResult,
      qcResult,
      invoiceResult,
      readySaleResult,
      recentItemsResult,
      recentWorkResult,
    ] = await Promise.all([
      itemCountBase(),
      workCountBase().neq('status', 'complete').neq('status', 'cancelled'),
      workCountBase().eq('status', 'on_bench'),
      workCountBase().eq('status', 'waiting'),
      workCountBase().eq('status', 'ready'),
      supabase.from('acquisition_invoices').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('extraction_status', 'uploaded'),
      itemCountBase().eq('status', 'ready_for_sale'),
      supabase.from('work_records').select('id,item_id,work_number,title,status,waiting_reason,next_action,blocker,priority,opened_at').eq('workspace_id', workspaceId).eq('status', 'waiting').order('priority', { ascending: false }).order('opened_at', { ascending: false }).limit(4),
      supabase.from('work_records').select('id,item_id,work_number,title,status,waiting_reason,next_action,blocker,priority,opened_at').eq('workspace_id', workspaceId).eq('status', 'qc').order('priority', { ascending: false }).order('opened_at', { ascending: false }).limit(6),
      supabase.from('acquisition_invoices').select('id,vendor_name,invoice_number,original_filename,extraction_status,created_at').eq('workspace_id', workspaceId).eq('extraction_status', 'uploaded').order('created_at', { ascending: false }).limit(6),
      supabase.from('items').select('id,item_number,title,status,purpose,created_at').eq('workspace_id', workspaceId).is('archived_at', null).eq('status', 'ready_for_sale').order('created_at', { ascending: false }).limit(6),
      supabase.from('items').select('id,item_number,title,status,purpose,created_at').eq('workspace_id', workspaceId).is('archived_at', null).order('created_at', { ascending: false }).limit(5),
      supabase.from('work_records').select('id,item_id,work_number,title,status,waiting_reason,next_action,blocker,priority,opened_at').eq('workspace_id', workspaceId).order('opened_at', { ascending: false }).limit(5),
    ])

    const error = totalItemsResult.error ?? activeWorkResult.error ?? onBenchCountResult.error ?? waitingCountResult.error ?? readyCountResult.error ?? intakeCountResult.error ?? readySaleCountResult.error ?? waitingResult.error ?? qcResult.error ?? invoiceResult.error ?? readySaleResult.error ?? recentItemsResult.error ?? recentWorkResult.error
    if (error) {
      setLoading(false)
      setMessage(`Home failed to load: ${error.message}`)
      return
    }

    const nextWaiting = (waitingResult.data ?? []) as WorkRow[]
    const nextQc = (qcResult.data ?? []) as WorkRow[]
    const nextRecentWork = (recentWorkResult.data ?? []) as WorkRow[]
    const baseItems = (recentItemsResult.data ?? []) as ItemRow[]
    const saleItems = (readySaleResult.data ?? []) as ItemRow[]
    const referencedItemIds = [...new Set([...nextWaiting, ...nextQc, ...nextRecentWork].map((record) => record.item_id))]

    const itemMap = new Map<string, ItemRow>()
    ;[...baseItems, ...saleItems].forEach((item) => itemMap.set(item.id, item))
    const missingIds = referencedItemIds.filter((id) => !itemMap.has(id))
    if (missingIds.length) {
      const itemLookup = await supabase.from('items').select('id,item_number,title,status,purpose,created_at').eq('workspace_id', workspaceId).in('id', missingIds)
      if (itemLookup.error) {
        setLoading(false)
        setMessage(`Home item lookup failed: ${itemLookup.error.message}`)
        return
      }
      ;((itemLookup.data ?? []) as ItemRow[]).forEach((item) => itemMap.set(item.id, item))
    }

    setCounts({
      totalItems: totalItemsResult.count ?? 0,
      activeWork: activeWorkResult.count ?? 0,
      onBench: onBenchCountResult.count ?? 0,
      waiting: waitingCountResult.count ?? 0,
      ready: readyCountResult.count ?? 0,
      intake: intakeCountResult.count ?? 0,
      readyForSale: readySaleCountResult.count ?? 0,
    })
    setWaitingWork(nextWaiting)
    setQcWork(nextQc)
    setUnreadInvoices((invoiceResult.data ?? []) as InvoiceRow[])
    setReadyForSale(saleItems)
    setRecentItems(baseItems)
    setRecentWork(nextRecentWork)
    setItemById(itemMap)
    setLoading(false)
    setMessage('')
  }

  useEffect(() => { if (active && workspaceId) void load() }, [active, workspaceId])

  const attention = useMemo(() => {
    const rows: { key: string; label: string; title: string; detail: string; action: string; hash: string }[] = []
    for (const record of waitingWork) {
      const item = itemById.get(record.item_id)
      rows.push({
        key: `work-${record.id}`,
        label: record.waiting_reason === 'parts' ? 'WAITING FOR PARTS' : 'WAITING',
        title: item ? `#${item.item_number} ${item.title}` : record.title,
        detail: record.blocker || record.next_action || 'Waiting for the next action.',
        action: 'Open job',
        hash: `#/work/${encodeURIComponent(record.id)}`,
      })
    }
    for (const record of qcWork.slice(0, Math.max(0, 6 - rows.length))) {
      const item = itemById.get(record.item_id)
      rows.push({
        key: `qc-${record.id}`,
        label: 'QC',
        title: item ? `#${item.item_number} ${item.title}` : record.title,
        detail: record.next_action || 'Final checks are waiting to be completed.',
        action: 'Open QC',
        hash: `#/work/${encodeURIComponent(record.id)}`,
      })
    }
    for (const invoice of unreadInvoices.slice(0, Math.max(0, 6 - rows.length))) {
      rows.push({
        key: `invoice-${invoice.id}`,
        label: 'INTAKE',
        title: invoice.vendor_name || invoice.original_filename,
        detail: invoice.invoice_number ? `Invoice ${invoice.invoice_number} is waiting to be read.` : 'Invoice is waiting to be read.',
        action: 'Review intake',
        hash: '#/intake',
      })
    }
    for (const item of readyForSale.slice(0, Math.max(0, 6 - rows.length))) {
      rows.push({
        key: `sale-${item.id}`,
        label: 'READY FOR SALE',
        title: `#${item.item_number} ${item.title}`,
        detail: 'Workshop work is clear and the Item is ready for its sale workflow.',
        action: 'Open Item',
        hash: `#/items/${encodeURIComponent(item.id)}`,
      })
    }
    return rows.slice(0, 6)
  }, [waitingWork, qcWork, unreadInvoices, readyForSale, itemById])

  if (!active) return null

  return (
    <main className="home-v2-page">
      <header className="home-v2-heading">
        <div>
          <p className="eyebrow">TODAY</p>
          <h1>Workshop overview</h1>
          <p className="muted">What needs attention, what is moving, and what is ready to become the next job.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      {message && <p className="home-v2-message">{message}</p>}

      <section className="home-v2-metrics" aria-label="Calibre overview">
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>On bench</span><strong>{counts.onBench}</strong><small>actively being worked</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>Waiting</span><strong>{counts.waiting}</strong><small>blocked or awaiting something</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>Ready</span><strong>{counts.ready}</strong><small>ready to pick up</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/intake' }}><span>Intake</span><strong>{counts.intake}</strong><small>invoice{counts.intake === 1 ? '' : 's'} to review</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/items' }}><span>Ready for sale</span><strong>{counts.readyForSale}</strong><small>Item{counts.readyForSale === 1 ? '' : 's'} waiting for sale workflow</small></button>
      </section>

      <div className="home-v2-grid">
        <section className="section-card home-v2-attention">
          <div className="home-v2-section-heading"><div><p className="eyebrow">NEEDS ATTENTION</p><h2>{attention.length ? 'Your next decisions' : 'Nothing urgent'}</h2></div><span>{attention.length}</span></div>
          {attention.length === 0 ? <p className="muted">No waiting jobs, QC work, unread invoices or sale-ready Items need attention right now.</p> : (
            <div className="home-v2-attention-list">
              {attention.map((row) => (
                <button key={row.key} type="button" onClick={() => { window.location.hash = row.hash }}>
                  <span className="home-v2-attention-label">{row.label}</span>
                  <strong>{row.title}</strong>
                  <p>{row.detail}</p>
                  <small>{row.action} →</small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="section-card home-v2-activity">
          <div className="home-v2-section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Latest records</h2></div></div>
          <div className="home-v2-activity-list">
            {recentWork.map((record) => {
              const item = itemById.get(record.item_id)
              return <button key={record.id} type="button" onClick={() => { window.location.hash = `#/work/${encodeURIComponent(record.id)}` }}><span>Work #{record.work_number}</span><strong>{item?.title || record.title}</strong><small>{titleCase(record.status)} · {new Date(record.opened_at).toLocaleDateString('en-AU')}</small></button>
            })}
            {recentItems.map((item) => <button key={item.id} type="button" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(item.id)}` }}><span>Item #{item.item_number}</span><strong>{item.title}</strong><small>{titleCase(item.status)} · {new Date(item.created_at).toLocaleDateString('en-AU')}</small></button>)}
            {recentWork.length === 0 && recentItems.length === 0 && <p className="muted">No recent activity yet.</p>}
          </div>
        </section>
      </div>

      <section className="home-v2-quick-actions">
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>⌁</span><strong>Open Workbench</strong><small>{counts.activeWork} active job{counts.activeWork === 1 ? '' : 's'}</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/intake' }}><span>↧</span><strong>Process Intake</strong><small>{counts.intake} waiting</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/items' }}><span>◫</span><strong>Browse Inventory</strong><small>{counts.totalItems} Item{counts.totalItems === 1 ? '' : 's'}</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/calibre' }}><span>◇</span><strong>Open Library</strong><small>Research & compatibility</small></button>
      </section>
    </main>
  )
}
