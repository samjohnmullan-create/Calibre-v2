import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type ItemRow = { id: string; item_number: number; title: string; status: string; purpose: string; created_at: string }
type WorkRow = { id: string; item_id: string; work_number: number; title: string; status: string; waiting_reason: string | null; next_action: string; blocker: string; priority: number; opened_at: string }
type InvoiceRow = { id: string; vendor_name: string; invoice_number: string; original_filename: string; extraction_status: string; created_at: string }

function isHomeRoute() {
  return window.location.hash.replace(/\/$/, '') === '#/home'
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function HomeRoute() {
  const [active, setActive] = useState(isHomeRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [work, setWork] = useState<WorkRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
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
    const [itemResult, workResult, invoiceResult] = await Promise.all([
      supabase.from('items')
        .select('id,item_number,title,status,purpose,created_at')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('work_records')
        .select('id,item_id,work_number,title,status,waiting_reason,next_action,blocker,priority,opened_at')
        .eq('workspace_id', workspaceId)
        .order('priority', { ascending: false })
        .order('opened_at', { ascending: false })
        .limit(200),
      supabase.from('acquisition_invoices')
        .select('id,vendor_name,invoice_number,original_filename,extraction_status,created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    setLoading(false)
    const error = itemResult.error ?? workResult.error ?? invoiceResult.error
    if (error) {
      setMessage(`Home failed to load: ${error.message}`)
      return
    }
    setItems((itemResult.data ?? []) as ItemRow[])
    setWork((workResult.data ?? []) as WorkRow[])
    setInvoices((invoiceResult.data ?? []) as InvoiceRow[])
    setMessage('')
  }

  useEffect(() => { if (active && workspaceId) void load() }, [active, workspaceId])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const activeWork = useMemo(() => work.filter((record) => !['complete', 'cancelled'].includes(record.status)), [work])
  const onBench = activeWork.filter((record) => record.status === 'on_bench')
  const waiting = activeWork.filter((record) => record.status === 'waiting')
  const qc = activeWork.filter((record) => record.status === 'qc')
  const ready = activeWork.filter((record) => record.status === 'ready')
  const unreadInvoices = invoices.filter((invoice) => invoice.extraction_status === 'uploaded')
  const readyForSale = items.filter((item) => item.status === 'ready_for_sale')

  const attention = useMemo(() => {
    const rows: { key: string; label: string; title: string; detail: string; action: string; hash: string }[] = []
    for (const record of waiting.slice(0, 4)) {
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
    for (const record of qc.slice(0, Math.max(0, 6 - rows.length))) {
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
  }, [waiting, qc, unreadInvoices, readyForSale, itemById])

  const recentItems = items.slice(0, 5)
  const recentWork = [...work].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()).slice(0, 5)

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
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>On bench</span><strong>{onBench.length}</strong><small>actively being worked</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>Waiting</span><strong>{waiting.length}</strong><small>blocked or awaiting something</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>Ready</span><strong>{ready.length}</strong><small>ready to pick up</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/intake' }}><span>Intake</span><strong>{unreadInvoices.length}</strong><small>invoice{unreadInvoices.length === 1 ? '' : 's'} to review</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/items' }}><span>Ready for sale</span><strong>{readyForSale.length}</strong><small>Item{readyForSale.length === 1 ? '' : 's'} waiting for sale workflow</small></button>
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
        <button type="button" onClick={() => { window.location.hash = '#/workbench' }}><span>⌁</span><strong>Open Workbench</strong><small>{activeWork.length} active job{activeWork.length === 1 ? '' : 's'}</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/intake' }}><span>↧</span><strong>Process Intake</strong><small>{unreadInvoices.length} waiting</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/items' }}><span>◫</span><strong>Browse Inventory</strong><small>{items.length} Item{items.length === 1 ? '' : 's'}</small></button>
        <button type="button" onClick={() => { window.location.hash = '#/calibre' }}><span>◇</span><strong>Open Library</strong><small>Research & compatibility</small></button>
      </section>
    </main>
  )
}
