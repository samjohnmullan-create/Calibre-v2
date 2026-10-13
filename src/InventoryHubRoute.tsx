import { useEffect, useMemo, useState } from 'react'
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

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isInventoryRoot() {
  const hash = window.location.hash.replace(/\/$/, '')
  return hash === '#/items' || hash === '#items' || hash === ''
}

export default function InventoryHubRoute() {
  const [active, setActive] = useState(isInventoryRoot)
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [view, setView] = useState<InventoryView>('items')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [purposeFilter, setPurposeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    const sync = () => setActive(isInventoryRoot())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('inventory-hub-route-active', active)
    return () => document.body.classList.remove('inventory-hub-route-active')
  }, [active])

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

  async function loadItems() {
    if (!active || !workspaceId) return
    setLoading(true)
    const result = await supabase
      .from('items')
      .select('id,item_number,type,purpose,status,title,notes,created_at')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .order('item_number', { ascending: false })
    setLoading(false)
    if (result.error) {
      setMessage(`Inventory failed to load: ${result.error.message}`)
      return
    }
    setItems((result.data ?? []) as ItemRow[])
    setMessage('')
  }

  useEffect(() => {
    if (!active || !workspaceId) return
    void loadItems()
  }, [active, workspaceId])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return items.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false
      if (purposeFilter && item.purpose !== purposeFilter) return false
      if (statusFilter && item.status !== statusFilter) return false
      if (!text) return true
      return [item.title, item.type, item.purpose, item.status, item.notes, String(item.item_number)]
        .some((value) => value?.toLowerCase().includes(text))
    })
  }, [items, query, typeFilter, purposeFilter, statusFilter])

  const activeFilterCount = [typeFilter, purposeFilter, statusFilter].filter(Boolean).length
  const readyCount = items.filter((item) => item.status === 'ready_for_sale').length
  const donorCount = items.filter((item) => item.purpose === 'donor').length

  function clearFilters() {
    setTypeFilter('')
    setPurposeFilter('')
    setStatusFilter('')
    setQuery('')
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
          <span>Items</span><strong>{items.length}</strong>
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
            <div><span>Total Items</span><strong>{items.length}</strong></div>
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
              <span>{filtered.length} shown</span>
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
            {!loading && filtered.length === 0 && (
              <div className="inventory-empty">
                <strong>No Items match this view.</strong>
                <span>{items.length ? 'Clear a filter or try another search.' : 'Add your first Item or import a purchase through Intake.'}</span>
              </div>
            )}

            <div className="inventory-list">
              {filtered.map((item) => (
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
