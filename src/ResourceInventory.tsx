import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import ArchiveConfirmDialog from './ArchiveConfirmDialog'

type ResourceKind = 'tool' | 'consumable'
type ResourceRow = {
  id: string
  name: string
  category: string
  detail: string
  quantity: number
  unit: string
  value: number | null
  reorderLevel: number | null
  storageLocationId: string | null
}
type StorageLocation = { id: string; parent_id: string | null; name: string; code: string | null; sort_order: number }

const pageSize = 40

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function money(value: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(value)
}

function cleanSearch(value: string) {
  return value.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

export default function ResourceInventory({ kind, workspaceId, onArchived }: { kind: ResourceKind; workspaceId: string; onArchived?: () => void }) {
  const [rows, setRows] = useState<ResourceRow[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [archiveTarget, setArchiveTarget] = useState<ResourceRow | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)

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
      const result = location.parent_id ? `${build(location.parent_id, seen)} / ${own}` : own
      cache.set(id, result)
      return result
    }
    for (const location of locations) build(location.id)
    return cache
  }, [locations])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => { setPage(0) }, [debouncedQuery, kind])

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    const clean = cleanSearch(debouncedQuery)
    const from = page * pageSize

    const locationPromise = supabase.from('storage_locations')
      .select('id,parent_id,name,code,sort_order')
      .eq('workspace_id', workspaceId)
      .order('sort_order')
      .order('name')
      .limit(500)

    if (kind === 'tool') {
      let request = supabase.from('tools')
        .select('id,name,category,manufacturer,model,quantity,purchase_cost,storage_location_id', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
      if (clean) {
        const pattern = `%${clean}%`
        request = request.or(`name.ilike.${pattern},category.ilike.${pattern},manufacturer.ilike.${pattern},model.ilike.${pattern},notes.ilike.${pattern}`)
      }
      const [result, locationResult] = await Promise.all([
        request.order('updated_at', { ascending: false }).range(from, from + pageSize - 1),
        locationPromise,
      ])
      setLoading(false)
      const error = result.error ?? locationResult.error
      if (error) { setMessage(`Tools could not be loaded: ${error.message}`); return }
      const total = result.count ?? 0
      if (page > 0 && from >= total) { setPage(Math.max(0, Math.ceil(total / pageSize) - 1)); return }
      setCount(total)
      setLocations((locationResult.data ?? []) as StorageLocation[])
      setRows((result.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        detail: [row.manufacturer, row.model].filter(Boolean).join(' · '),
        quantity: Number(row.quantity ?? 0),
        unit: '',
        value: row.purchase_cost == null ? null : Number(row.purchase_cost),
        reorderLevel: null,
        storageLocationId: row.storage_location_id,
      })))
      setMessage('')
      return
    }

    let request = supabase.from('consumables')
      .select('id,name,category,quantity,unit,reorder_level,storage_location_id', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
    if (clean) {
      const pattern = `%${clean}%`
      request = request.or(`name.ilike.${pattern},category.ilike.${pattern},notes.ilike.${pattern}`)
    }
    const [result, locationResult] = await Promise.all([
      request.order('updated_at', { ascending: false }).range(from, from + pageSize - 1),
      locationPromise,
    ])
    setLoading(false)
    const error = result.error ?? locationResult.error
    if (error) { setMessage(`Consumables could not be loaded: ${error.message}`); return }
    const total = result.count ?? 0
    if (page > 0 && from >= total) { setPage(Math.max(0, Math.ceil(total / pageSize) - 1)); return }
    setCount(total)
    setLocations((locationResult.data ?? []) as StorageLocation[])
    setRows((result.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      detail: '',
      quantity: Number(row.quantity ?? 0),
      unit: row.unit || '',
      value: null,
      reorderLevel: row.reorder_level == null ? null : Number(row.reorder_level),
      storageLocationId: row.storage_location_id,
    })))
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, kind, page, debouncedQuery])

  async function archive(reason: string) {
    if (!archiveTarget || archiveBusy) return
    const target = archiveTarget
    setArchiveBusy(true)
    const { error } = await supabase.rpc('archive_inventory_entity', {
      p_workspace_id: workspaceId,
      p_entity_type: kind,
      p_entity_id: target.id,
      p_reason: reason,
    })
    setArchiveBusy(false)
    if (error) { setMessage(`${titleCase(kind)} could not be archived: ${error.message}`); return }
    setArchiveTarget(null)
    setMessage(`${target.name} archived. It can be restored from Trash.`)
    onArchived?.()
    await load()
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const firstShown = count === 0 ? 0 : page * pageSize + 1
  const lastShown = Math.min(count, (page + 1) * pageSize)
  const plural = kind === 'tool' ? 'Tools' : 'Consumables'

  return (
    <section className="resource-inventory">
      <div className="resource-inventory-heading">
        <div><p className="eyebrow">{plural.toUpperCase()}</p><h2>{plural} registry</h2><p className="muted">Active stock only. Removing a record archives it without erasing receiving, cost, storage or audit history.</p></div>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <div className="inventory-list-toolbar">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${plural.toLowerCase()}…`} aria-label={`Search ${plural.toLowerCase()}`} />
        <span>{count ? `${firstShown}–${lastShown} of ${count}` : `0 ${plural.toLowerCase()}`}</span>
      </div>

      {message && <p className="inventory-message">{message}</p>}
      {loading && rows.length === 0 && <div className="loading-card">Loading {plural.toLowerCase()}…</div>}
      {!loading && rows.length === 0 && <div className="inventory-empty"><strong>No active {plural.toLowerCase()} match.</strong><span>{debouncedQuery ? 'Try another search.' : 'Received stock will appear here automatically.'}</span></div>}

      <div className="resource-inventory-list">
        {rows.map((row) => {
          const location = row.storageLocationId ? pathById.get(row.storageLocationId) || 'Unknown location' : 'Needs put-away'
          const lowStock = kind === 'consumable' && row.reorderLevel != null && row.quantity <= row.reorderLevel
          return <article className="resource-inventory-row" key={row.id}>
            <div className="resource-inventory-main"><strong>{row.name}</strong><span>{[titleCase(row.category || 'other'), row.detail].filter(Boolean).join(' · ')}</span><small>{location}</small></div>
            <div><span>Quantity</span><strong className={lowStock ? 'resource-low-stock' : ''}>{row.quantity}{row.unit ? ` ${row.unit}` : ''}</strong>{lowStock && <small>At/below reorder level {row.reorderLevel}</small>}</div>
            {kind === 'tool' && <div><span>Purchase cost</span><strong>{money(row.value)}</strong></div>}
            {kind === 'consumable' && <div><span>Reorder level</span><strong>{row.reorderLevel ?? '—'}</strong></div>}
            <button type="button" className="secondary small" onClick={() => setArchiveTarget(row)}>Remove</button>
          </article>
        })}
      </div>

      {count > pageSize && <div className="business-v2-pager">
        <button type="button" className="secondary small" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>← Previous</button>
        <span>Page {page + 1} of {totalPages}</span>
        <button type="button" className="secondary small" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next →</button>
      </div>}

      <ArchiveConfirmDialog open={Boolean(archiveTarget)} label={archiveTarget?.name || titleCase(kind)} busy={archiveBusy} onCancel={() => { if (!archiveBusy) setArchiveTarget(null) }} onConfirm={archive} />
    </section>
  )
}
