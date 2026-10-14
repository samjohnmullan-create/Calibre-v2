import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import PartsInventory from './PartsInventory'
import StorageManager from './StorageManager'

type ItemRow = {
  id: string
  item_number: number
  type: string
  purpose: string
  status: string
  title: string
  notes: string
  created_at: string
  storage_location_id: string | null
}

type StorageLocation = { id: string; parent_id: string | null; name: string; code: string | null; sort_order: number }
type InventoryView = 'items' | 'parts' | 'storage'

const itemTypes = ['watch', 'clock', 'jewellery', 'accessory', 'other']
const itemPurposes = ['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other']
const itemStatuses = ['acquired', 'researching', 'preparing', 'ready_for_sale', 'listed', 'sold', 'archived']
const pageSize = 50

function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function isInventoryRoot() { const hash = window.location.hash.replace(/\/$/, ''); return hash === '#/items' || hash === '#items' || hash === '' }
function cleanSearch(value: string) { return value.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim() }
function buildSearchExpression(value: string) {
  const text = cleanSearch(value)
  if (!text) return ''
  const pattern = `%${text}%`
  const clauses = [`title.ilike.${pattern}`, `notes.ilike.${pattern}`, `type.ilike.${pattern}`, `purpose.ilike.${pattern}`, `status.ilike.${pattern}`]
  if (/^\d+$/.test(text)) clauses.push(`item_number.eq.${Number(text)}`)
  return clauses.join(',')
}

export default function InventoryHubRoute() {
  const [active, setActive] = useState(isInventoryRoot)
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [view, setView] = useState<InventoryView>('items')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [purposeFilter, setPurposeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [storageFilter, setStorageFilter] = useState('')
  const [page, setPage] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [readyCount, setReadyCount] = useState(0)
  const [donorCount, setDonorCount] = useState(0)
  const [unassignedCount, setUnassignedCount] = useState(0)

  const pathById = useMemo(() => {
    const byId = new Map(locations.map((location) => [location.id, location]))
    const cache = new Map<string, string>()
    const build = (id: string, seen = new Set<string>()): string => {
      if (cache.has(id)) return cache.get(id) || ''
      if (seen.has(id)) return 'Invalid hierarchy'
      const location = byId.get(id)
      if (!location) return 'Unknown location'
      seen.add(id)
      const own = location.code ? `${location.code} · ${location.name}` : location.name
      const path = location.parent_id ? `${build(location.parent_id, seen)} / ${own}` : own
      cache.set(id, path)
      return path
    }
    for (const location of locations) build(location.id)
    return cache
  }, [locations])

  useEffect(() => {
    const sync = () => setActive(isInventoryRoot())
    window.addEventListener('hashchange', sync); sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    const openView = (event: Event) => {
      const requested = (event as CustomEvent<string>).detail
      if (requested === 'items' || requested === 'parts' || requested === 'storage') setView(requested)
      if (requested === 'workshop') setView('storage')
    }
    const chooseWorkItem = () => { setView('items'); setMessage('Choose the Item you want to work on, then open its Work tab.') }
    window.addEventListener('calibre:inventory-view', openView)
    window.addEventListener('calibre:choose-item-for-work', chooseWorkItem)
    return () => { window.removeEventListener('calibre:inventory-view', openView); window.removeEventListener('calibre:choose-item-for-work', chooseWorkItem) }
  }, [])

  useEffect(() => { document.body.classList.toggle('inventory-hub-route-active', active); return () => document.body.classList.remove('inventory-hub-route-active') }, [active])
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => { setPage(0) }, [debouncedQuery, typeFilter, purposeFilter, statusFilter, storageFilter])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) { setMessage(`Inventory unavailable: ${result.error?.message ?? 'No workspace found.'}`); return }
      setWorkspaceId(result.data.id)
    })()
    return () => { cancelled = true }
  }, [active])

  useEffect(() => {
    if (!active || !workspaceId) return
    let cancelled = false
    ;(async () => {
      const base = () => supabase.from('items').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null)
      const [allResult, readyResult, donorResult, unassignedResult, locationResult] = await Promise.all([
        base(), base().eq('status', 'ready_for_sale'), base().eq('purpose', 'donor'), base().is('storage_location_id', null),
        supabase.from('storage_locations').select('id,parent_id,name,code,sort_order').eq('workspace_id', workspaceId).order('sort_order').order('name'),
      ])
      if (cancelled) return
      const error = allResult.error ?? readyResult.error ?? donorResult.error ?? unassignedResult.error ?? locationResult.error
      if (error) { setMessage(`Inventory summary failed to load: ${error.message}`); return }
      setTotalItems(allResult.count ?? 0); setReadyCount(readyResult.count ?? 0); setDonorCount(donorResult.count ?? 0); setUnassignedCount(unassignedResult.count ?? 0)
      setLocations((locationResult.data ?? []) as StorageLocation[])
    })()
    return () => { cancelled = true }
  }, [active, workspaceId])

  useEffect(() => {
    if (!active || !workspaceId || view !== 'items') return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      let request = supabase.from('items')
        .select('id,item_number,type,purpose,status,title,notes,created_at,storage_location_id', { count: 'exact' })
        .eq('workspace_id', workspaceId).is('archived_at', null)
      if (typeFilter) request = request.eq('type', typeFilter)
      if (purposeFilter) request = request.eq('purpose', purposeFilter)
      if (statusFilter) request = request.eq('status', statusFilter)
      if (storageFilter === 'unassigned') request = request.is('storage_location_id', null)
      else if (storageFilter) request = request.eq('storage_location_id', storageFilter)
      const searchExpression = buildSearchExpression(debouncedQuery)
      if (searchExpression) request = request.or(searchExpression)
      const from = page * pageSize
      const result = await request.order('item_number', { ascending: false }).range(from, from + pageSize - 1)
      if (cancelled) return
      setLoading(false)
      if (result.error) { setMessage(`Inventory failed to load: ${result.error.message}`); return }
      const count = result.count ?? 0
      if (page > 0 && from >= count) { setPage(Math.max(0, Math.ceil(count / pageSize) - 1)); return }
      setItems((result.data ?? []) as ItemRow[]); setMatchCount(count)
      setMessage((current) => current.startsWith('Choose the Item') ? current : '')
    })()
    return () => { cancelled = true }
  }, [active, workspaceId, view, page, debouncedQuery, typeFilter, purposeFilter, statusFilter, storageFilter])

  const activeFilterCount = [typeFilter, purposeFilter, statusFilter, storageFilter].filter(Boolean).length
  const totalPages = Math.max(1, Math.ceil(matchCount / pageSize))
  const firstShown = matchCount === 0 ? 0 : page * pageSize + 1
  const lastShown = Math.min(matchCount, (page + 1) * pageSize)
  function clearFilters() { setTypeFilter(''); setPurposeFilter(''); setStatusFilter(''); setStorageFilter(''); setQuery(''); setPage(0) }
  if (!active) return null

  return (
    <main className="inventory-hub-page inventory-v2-page">
      <header className="inventory-hub-heading inventory-v2-heading">
        <div><p className="eyebrow">INVENTORY</p><h1>Inventory</h1><p className="muted">What it is, what is happening to it and where it physically is are kept as separate facts.</p></div>
        <button type="button" aria-label="Create item">＋ Add Item</button>
      </header>

      <nav className="inventory-v2-primary" aria-label="Inventory views">
        <button type="button" className={view === 'items' ? 'active' : ''} onClick={() => setView('items')}><span>Items</span><strong>{totalItems}</strong></button>
        <button type="button" className={view === 'parts' ? 'active' : ''} onClick={() => setView('parts')}><span>Parts</span></button>
        <button type="button" className={view === 'storage' ? 'active' : ''} onClick={() => setView('storage')}><span>Storage</span></button>
      </nav>

      {view === 'items' && <>
        <section className="inventory-v2-summary" aria-label="Inventory summary">
          <div><span>Total Items</span><strong>{totalItems}</strong></div>
          <button type="button" onClick={() => setStatusFilter('ready_for_sale')}><span>Ready for sale</span><strong>{readyCount}</strong></button>
          <button type="button" onClick={() => setPurposeFilter('donor')}><span>Donors</span><strong>{donorCount}</strong></button>
          <button type="button" onClick={() => setStorageFilter('unassigned')}><span>Needs put-away</span><strong>{unassignedCount}</strong></button>
        </section>

        <section className="inventory-v2-controls">
          <div className="inventory-v2-search-row"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Item #, title, type, status or notes…" aria-label="Search inventory" /><span>{matchCount ? `${firstShown}–${lastShown} of ${matchCount}` : '0 shown'}</span></div>
          <div className="inventory-v2-filters" aria-label="Inventory filters">
            <label>Type<select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">All types</option>{itemTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label>Purpose<select value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)}><option value="">All purposes</option>{itemPurposes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label>Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option>{itemStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label>Location<select value={storageFilter} onChange={(e) => setStorageFilter(e.target.value)}><option value="">All locations</option><option value="unassigned">Needs put-away</option>{locations.map((location) => <option key={location.id} value={location.id}>{pathById.get(location.id) || location.name}</option>)}</select></label>
            {(activeFilterCount > 0 || query) && <button type="button" className="secondary small" onClick={clearFilters}>Clear</button>}
          </div>
        </section>

        <section className="inventory-list-panel inventory-v2-list-panel">
          {message && <p className="inventory-message">{message}</p>}
          {loading && <p className="inventory-empty">Loading inventory…</p>}
          {!loading && items.length === 0 && <div className="inventory-empty"><strong>No Items match this view.</strong><span>{totalItems ? 'Clear a filter or try another search.' : 'Add your first Item or import a purchase through Intake.'}</span></div>}
          <div className="inventory-list">
            {items.map((item) => <button key={item.id} type="button" className="inventory-row" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(item.id)}` }}>
              <span className="inventory-row-number">#{item.item_number}</span>
              <span className="inventory-row-main"><strong>{item.title}</strong><small>{titleCase(item.type)} · {titleCase(item.purpose)} · {item.storage_location_id ? (pathById.get(item.storage_location_id) || 'Unknown location') : 'Needs put-away'}</small></span>
              <span className={`status-pill status-${item.status}`}>{titleCase(item.status)}</span>
            </button>)}
          </div>
          {matchCount > pageSize && <div className="inventory-v2-search-row" aria-label="Inventory pagination"><button type="button" className="secondary small" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><span>Page {page + 1} of {totalPages}</span><button type="button" className="secondary small" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
        </section>
      </>}

      {view === 'parts' && <PartsInventory />}

      {view === 'storage' && <section className="inventory-v2-workshop">
        <div className="inventory-v2-workshop-copy"><p className="eyebrow">PHYSICAL STORAGE</p><h2>Location is independent of workflow.</h2><p className="muted">Create any physical zones you actually use — Incoming, Watch Stock, Parts Storage, Donor Watches, Bench, Tools, Dispatch or something else. Nothing is automatically treated as being in the workshop.</p></div>
        {workspaceId && <StorageManager workspaceId={workspaceId} />}
      </section>}
    </main>
  )
}
