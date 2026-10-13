import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import PartsInventory from './PartsInventory'

type ItemRow = {
  id: string
  item_number: number
  type: string
  purpose: string
  status: string
  title: string
  notes: string
  created_at: string
}

type InventoryView = 'items' | 'parts' | 'workshop'

const itemTypes = ['watch', 'clock', 'jewellery', 'accessory', 'other']
const itemPurposes = ['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other']
const itemStatuses = ['acquired', 'researching', 'preparing', 'ready_for_sale', 'listed', 'sold', 'archived']
const pageSize = 50

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isInventoryRoot() {
  const hash = window.location.hash.replace(/\/$/, '')
  return hash === '#/items' || hash === '#items' || hash === ''
}

function cleanSearch(value: string) {
  return value.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildSearchExpression(value: string) {
  const text = cleanSearch(value)
  if (!text) return ''
  const pattern = `%${text}%`
  const clauses = [
    `title.ilike.${pattern}`,
    `notes.ilike.${pattern}`,
    `type.ilike.${pattern}`,
    `purpose.ilike.${pattern}`,
    `status.ilike.${pattern}`,
  ]
  if (/^\d+$/.test(text)) clauses.push(`item_number.eq.${Number(text)}`)
  return clauses.join(',')
}

export default function InventoryHubRoute() {
  const [active, setActive] = useState(isInventoryRoot)
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [view, setView] = useState<InventoryView>('items')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [purposeFilter, setPurposeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [readyCount, setReadyCount] = useState(0)
  const [donorCount, setDonorCount] = useState(0)

  useEffect(() => {
    const sync = () => setActive(isInventoryRoot())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    const openView = (event: Event) => {
      const requested = (event as CustomEvent<string>).detail
      if (requested === 'items' || requested === 'parts' || requested === 'workshop') setView(requested)
    }
    const chooseWorkItem = () => {
      setView('items')
      setMessage('Choose the Item you want to work on, then open its Work tab.')
    }
    window.addEventListener('calibre:inventory-view', openView)
    window.addEventListener('calibre:choose-item-for-work', chooseWorkItem)
    return () => {
      window.removeEventListener('calibre:inventory-view', openView)
      window.removeEventListener('calibre:choose-item-for-work', chooseWorkItem)
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('inventory-hub-route-active', active)
    return () => document.body.classList.remove('inventory-hub-route-active')
  }, [active])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setPage(0)
  }, [debouncedQuery, typeFilter, purposeFilter, statusFilter])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setMessage(`Inventory unavailable: ${result.error?.message ?? 'No workspace found.'}`)
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
      const base = () => supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)

      const [allResult, readyResult, donorResult] = await Promise.all([
        base(),
        base().eq('status', 'ready_for_sale'),
        base().eq('purpose', 'donor'),
      ])
      if (cancelled) return
      const error = allResult.error ?? readyResult.error ?? donorResult.error
      if (error) {
        setMessage(`Inventory summary failed to load: ${error.message}`)
        return
      }
      setTotalItems(allResult.count ?? 0)
      setReadyCount(readyResult.count ?? 0)
      setDonorCount(donorResult.count ?? 0)
    })()
    return () => { cancelled = true }
  }, [active, workspaceId])

  useEffect(() => {
    if (!active || !workspaceId || view !== 'items') return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      let request = supabase
        .from('items')
        .select('id,item_number,type,purpose,status,title,notes,created_at', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)

      if (typeFilter) request = request.eq('type', typeFilter)
      if (purposeFilter) request = request.eq('purpose', purposeFilter)
      if (statusFilter) request = request.eq('status', statusFilter)

      const searchExpression = buildSearchExpression(debouncedQuery)
      if (searchExpression) request = request.or(searchExpression)

      const from = page * pageSize
      const to = from + pageSize - 1
      const result = await request.order('item_number', { ascending: false }).range(from, to)
      if (cancelled) return
      setLoading(false)
      if (result.error) {
        setMessage(`Inventory failed to load: ${result.error.message}`)
        return
      }

      const count = result.count ?? 0
      if (page > 0 && from >= count) {
        setPage(Math.max(0, Math.ceil(count / pageSize) - 1))
        return
      }

      setItems((result.data ?? []) as ItemRow[])
      setMatchCount(count)
      setMessage((current) => current.startsWith('Choose the Item') ? current : '')
    })()
    return () => { cancelled = true }
  }, [active, workspaceId, view, page, debouncedQuery, typeFilter, purposeFilter, statusFilter])

  const activeFilterCount = [typeFilter, purposeFilter, statusFilter].filter(Boolean).length
  const totalPages = Math.max(1, Math.ceil(matchCount / pageSize))
  const firstShown = matchCount === 0 ? 0 : page * pageSize + 1
  const lastShown = Math.min(matchCount, (page + 1) * pageSize)

  function clearFilters() {
    setTypeFilter('')
    setPurposeFilter('')
    setStatusFilter('')
    setQuery('')
    setPage(0)
  }

  if (!active) return null

  return (
    <main className="inventory-hub-page inventory-v2-page">
      <header className="inventory-hub-heading inventory-v2-heading">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h1>Inventory</h1>
          <p className="muted">Everything Calibre owns or manages, separated by what it is — not by a growing list of feature tabs.</p>
        </div>
        <button type="button" aria-label="Create item">＋ Add Item</button>
      </header>

      <nav className="inventory-v2-primary" aria-label="Inventory views">
        <button type="button" className={view === 'items' ? 'active' : ''} onClick={() => setView('items')}>
          <span>Items</span><strong>{totalItems}</strong>
        </button>
        <button type="button" className={view === 'parts' ? 'active' : ''} onClick={() => setView('parts')}>
          <span>Parts</span>
        </button>
        <button type="button" className={view === 'workshop' ? 'active' : ''} onClick={() => setView('workshop')}>
          <span>Workshop</span>
        </button>
      </nav>

      {view === 'items' && (
        <>
          <section className="inventory-v2-summary" aria-label="Inventory summary">
            <div><span>Total Items</span><strong>{totalItems}</strong></div>
            <button type="button" onClick={() => setStatusFilter('ready_for_sale')}><span>Ready for sale</span><strong>{readyCount}</strong></button>
            <button type="button" onClick={() => setPurposeFilter('donor')}><span>Donors</span><strong>{donorCount}</strong></button>
          </section>

          <section className="inventory-v2-controls">
            <div className="inventory-v2-search-row">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Item #, title, type, status or notes…"
                aria-label="Search inventory"
              />
              <span>{matchCount ? `${firstShown}–${lastShown} of ${matchCount}` : '0 shown'}</span>
            </div>

            <div className="inventory-v2-filters" aria-label="Inventory filters">
              <label>Type
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="">All types</option>
                  {itemTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </select>
              </label>
              <label>Purpose
                <select value={purposeFilter} onChange={(event) => setPurposeFilter(event.target.value)}>
                  <option value="">All purposes</option>
                  {itemPurposes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </select>
              </label>
              <label>Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {itemStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </select>
              </label>
              {(activeFilterCount > 0 || query) && <button type="button" className="secondary small" onClick={clearFilters}>Clear</button>}
            </div>
          </section>

          <section className="inventory-list-panel inventory-v2-list-panel">
            {message && <p className="inventory-message">{message}</p>}
            {loading && <p className="inventory-empty">Loading inventory…</p>}
            {!loading && items.length === 0 && (
              <div className="inventory-empty">
                <strong>No Items match this view.</strong>
                <span>{totalItems ? 'Clear a filter or try another search.' : 'Add your first Item or import a purchase through Intake.'}</span>
              </div>
            )}

            <div className="inventory-list">
              {items.map((item) => (
                <button key={item.id} type="button" className="inventory-row" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(item.id)}` }}>
                  <span className="inventory-row-number">#{item.item_number}</span>
                  <span className="inventory-row-main">
                    <strong>{item.title}</strong>
                    <small>{titleCase(item.type)} · {titleCase(item.purpose)}</small>
                  </span>
                  <span className={`status-pill status-${item.status}`}>{titleCase(item.status)}</span>
                </button>
              ))}
            </div>

            {matchCount > pageSize && (
              <div className="inventory-v2-search-row" aria-label="Inventory pagination">
                <button type="button" className="secondary small" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
                <span>Page {page + 1} of {totalPages}</span>
                <button type="button" className="secondary small" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
              </div>
            )}
          </section>
        </>
      )}

      {view === 'parts' && <PartsInventory />}

      {view === 'workshop' && (
        <section className="inventory-v2-workshop">
          <div className="inventory-v2-workshop-copy">
            <p className="eyebrow">WORKSHOP INVENTORY</p>
            <h2>Workshop resources belong together.</h2>
            <p className="muted">Tools, consumables, oils and storage locations will live here instead of becoming separate top-level sections.</p>
          </div>
          <div className="inventory-v2-workshop-grid">
            <article><span>01</span><strong>Tools & equipment</strong><p>Bench tools, machines, test equipment and specialist holders.</p></article>
            <article><span>02</span><strong>Consumables</strong><p>Oils, cleaning fluids, Rodico, pegwood and workshop supplies.</p></article>
            <article><span>03</span><strong>Storage</strong><p>Cabinets, drawers, trays and physical locations for stock.</p></article>
          </div>
          <p className="inventory-v2-workshop-note">This is the destination structure. The existing Tools, Consumables and Storage records will be surfaced here as we connect the next Inventory layer.</p>
        </section>
      )}
    </main>
  )
}
