import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type LocationRow = { id: string; parent_id: string | null; name: string; code: string | null; location_type: string; sort_order: number; notes: string }
type EntityType = 'item' | 'part' | 'tool' | 'consumable'
type StoredEntity = { id: string; entityType: EntityType; label: string; detail: string; storageLocationId: string | null }
type MoveEvent = { id: string; entity_type: EntityType; entity_id: string; entity_label: string; from_location_id: string | null; to_location_id: string | null; note: string; moved_at: string }
type LocationCounts = { items: number; parts: number; tools: number; consumables: number }
type PutAwayFilter = 'all' | EntityType

const locationTypes = ['site', 'room', 'cabinet', 'drawer', 'shelf', 'box', 'tray', 'bin', 'position', 'other']
const entityTypes: EntityType[] = ['item', 'part', 'tool', 'consumable']

function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function cleanSearch(value: string) { return value.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim() }

export default function StorageManager({ workspaceId }: { workspaceId: string }) {
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [counts, setCounts] = useState<LocationCounts>({ items: 0, parts: 0, tools: 0, consumables: 0 })
  const [contents, setContents] = useState<StoredEntity[]>([])
  const [history, setHistory] = useState<MoveEvent[]>([])
  const [entityType, setEntityType] = useState<EntityType>('item')
  const [putAwayFilter, setPutAwayFilter] = useState<PutAwayFilter>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StoredEntity[]>([])
  const [moveTarget, setMoveTarget] = useState<StoredEntity | null>(null)
  const [destinationId, setDestinationId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const pathById = useMemo(() => {
    const byId = new Map(locations.map((location) => [location.id, location]))
    const cache = new Map<string, string>()
    const build = (id: string, visited = new Set<string>()): string => {
      if (cache.has(id)) return cache.get(id) || ''
      if (visited.has(id)) return 'Invalid hierarchy'
      const location = byId.get(id)
      if (!location) return 'Unknown location'
      visited.add(id)
      const own = location.code ? `${location.code} · ${location.name}` : location.name
      const path = location.parent_id ? `${build(location.parent_id, visited)} / ${own}` : own
      cache.set(id, path)
      return path
    }
    for (const location of locations) build(location.id)
    return cache
  }, [locations])

  const flattenedLocations = useMemo(() => {
    const children = new Map<string, LocationRow[]>()
    const roots: LocationRow[] = []
    const ids = new Set(locations.map((location) => location.id))
    for (const location of locations) {
      if (!location.parent_id || !ids.has(location.parent_id)) roots.push(location)
      else children.set(location.parent_id, [...(children.get(location.parent_id) ?? []), location])
    }
    const sort = (rows: LocationRow[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    const result: Array<LocationRow & { depth: number }> = []
    const walk = (rows: LocationRow[], depth: number) => {
      for (const row of sort(rows)) { result.push({ ...row, depth }); walk(children.get(row.id) ?? [], depth + 1) }
    }
    walk(roots, 0)
    return result
  }, [locations])

  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? null
  const isPutAwayQueue = selectedLocationId === ''
  const visibleContents = useMemo(() => isPutAwayQueue && putAwayFilter !== 'all' ? contents.filter((entity) => entity.entityType === putAwayFilter) : contents, [contents, isPutAwayQueue, putAwayFilter])
  const totalWaiting = counts.items + counts.parts + counts.tools + counts.consumables

  async function loadLocations(selectId?: string) {
    const { data, error } = await supabase.from('storage_locations').select('id,parent_id,name,code,location_type,sort_order,notes').eq('workspace_id', workspaceId).order('sort_order').order('name').limit(500)
    if (error) { setMessage(`Storage locations failed to load: ${error.message}`); return }
    const rows = (data ?? []) as LocationRow[]
    setLocations(rows)
    if (selectId && rows.some((row) => row.id === selectId)) setSelectedLocationId(selectId)
  }

  async function loadHistory() {
    const { data, error } = await supabase.from('storage_location_events').select('id,entity_type,entity_id,entity_label,from_location_id,to_location_id,note,moved_at').eq('workspace_id', workspaceId).order('moved_at', { ascending: false }).limit(30)
    if (error) { setMessage(`Storage history failed to load: ${error.message}`); return }
    setHistory((data ?? []) as MoveEvent[])
  }

  function locationFilter<T>(request: T): T {
    const builder = request as any
    return (selectedLocationId ? builder.eq('storage_location_id', selectedLocationId) : builder.is('storage_location_id', null)) as T
  }

  async function loadContents() {
    if (!workspaceId) return
    setLoading(true)
    const [itemResult, partResult, toolResult, consumableResult] = await Promise.all([
      locationFilter(supabase.from('items').select('id,item_number,title,type,storage_location_id', { count: 'exact' }).eq('workspace_id', workspaceId).is('archived_at', null)).order('updated_at', { ascending: false }).limit(100),
      locationFilter(supabase.from('parts').select('id,part_type,manufacturer,reference,quantity,storage_location_id', { count: 'exact' }).eq('workspace_id', workspaceId).is('archived_at', null)).order('updated_at', { ascending: false }).limit(100),
      locationFilter(supabase.from('tools').select('id,name,category,manufacturer,model,quantity,storage_location_id', { count: 'exact' }).eq('workspace_id', workspaceId).is('archived_at', null)).order('updated_at', { ascending: false }).limit(100),
      locationFilter(supabase.from('consumables').select('id,name,category,quantity,unit,storage_location_id', { count: 'exact' }).eq('workspace_id', workspaceId).is('archived_at', null)).order('updated_at', { ascending: false }).limit(100),
    ])
    setLoading(false)
    const error = itemResult.error ?? partResult.error ?? toolResult.error ?? consumableResult.error
    if (error) { setMessage(`Storage contents failed to load: ${error.message}`); return }
    const rows: StoredEntity[] = []
    for (const row of itemResult.data ?? []) rows.push({ id: row.id, entityType: 'item', label: `#${row.item_number} ${row.title}`, detail: titleCase(row.type), storageLocationId: row.storage_location_id })
    for (const row of partResult.data ?? []) rows.push({ id: row.id, entityType: 'part', label: [row.part_type, row.manufacturer, row.reference].filter(Boolean).join(' · '), detail: `Qty ${row.quantity}`, storageLocationId: row.storage_location_id })
    for (const row of toolResult.data ?? []) rows.push({ id: row.id, entityType: 'tool', label: row.name, detail: [row.category, row.manufacturer, row.model].filter(Boolean).join(' · '), storageLocationId: row.storage_location_id })
    for (const row of consumableResult.data ?? []) rows.push({ id: row.id, entityType: 'consumable', label: row.name, detail: `${row.quantity}${row.unit ? ` ${row.unit}` : ''}${row.category ? ` · ${row.category}` : ''}`, storageLocationId: row.storage_location_id })
    setContents(rows)
    setCounts({ items: itemResult.count ?? 0, parts: partResult.count ?? 0, tools: toolResult.count ?? 0, consumables: consumableResult.count ?? 0 })
  }

  async function searchEntities() {
    const text = cleanSearch(debouncedQuery)
    if (!text) { setSearchResults([]); return }
    const pattern = `%${text}%`
    if (entityType === 'item') {
      const clauses = [`title.ilike.${pattern}`, `notes.ilike.${pattern}`]
      if (/^\d+$/.test(text)) clauses.push(`item_number.eq.${Number(text)}`)
      const { data, error } = await supabase.from('items').select('id,item_number,title,type,storage_location_id').eq('workspace_id', workspaceId).is('archived_at', null).or(clauses.join(',')).order('updated_at', { ascending: false }).limit(20)
      if (error) { setMessage(`Item search failed: ${error.message}`); return }
      setSearchResults((data ?? []).map((row) => ({ id: row.id, entityType: 'item' as const, label: `#${row.item_number} ${row.title}`, detail: titleCase(row.type), storageLocationId: row.storage_location_id })))
      return
    }
    if (entityType === 'part') {
      const { data, error } = await supabase.from('parts').select('id,part_type,manufacturer,reference,quantity,storage_location_id').eq('workspace_id', workspaceId).is('archived_at', null).or(`part_type.ilike.${pattern},manufacturer.ilike.${pattern},reference.ilike.${pattern},description.ilike.${pattern}`).order('updated_at', { ascending: false }).limit(20)
      if (error) { setMessage(`Part search failed: ${error.message}`); return }
      setSearchResults((data ?? []).map((row) => ({ id: row.id, entityType: 'part' as const, label: [row.part_type, row.manufacturer, row.reference].filter(Boolean).join(' · '), detail: `Qty ${row.quantity}`, storageLocationId: row.storage_location_id })))
      return
    }
    if (entityType === 'tool') {
      const { data, error } = await supabase.from('tools').select('id,name,category,manufacturer,model,storage_location_id').eq('workspace_id', workspaceId).is('archived_at', null).or(`name.ilike.${pattern},category.ilike.${pattern},manufacturer.ilike.${pattern},model.ilike.${pattern}`).order('updated_at', { ascending: false }).limit(20)
      if (error) { setMessage(`Tool search failed: ${error.message}`); return }
      setSearchResults((data ?? []).map((row) => ({ id: row.id, entityType: 'tool' as const, label: row.name, detail: [row.category, row.manufacturer, row.model].filter(Boolean).join(' · '), storageLocationId: row.storage_location_id })))
      return
    }
    const { data, error } = await supabase.from('consumables').select('id,name,category,quantity,unit,storage_location_id').eq('workspace_id', workspaceId).is('archived_at', null).or(`name.ilike.${pattern},category.ilike.${pattern}`).order('updated_at', { ascending: false }).limit(20)
    if (error) { setMessage(`Consumable search failed: ${error.message}`); return }
    setSearchResults((data ?? []).map((row) => ({ id: row.id, entityType: 'consumable' as const, label: row.name, detail: `${row.quantity}${row.unit ? ` ${row.unit}` : ''}`, storageLocationId: row.storage_location_id })))
  }

  useEffect(() => { if (workspaceId) { void loadLocations(); void loadHistory() } }, [workspaceId])
  useEffect(() => { if (workspaceId) { setMoveTarget(null); void loadContents() } }, [workspaceId, selectedLocationId])
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query), 250); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => { if (workspaceId) { setMoveTarget(null); void searchEntities() } }, [workspaceId, entityType, debouncedQuery])

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    if (!name) { setMessage('Location name is required.'); return }
    setSaving(true)
    const { data, error } = await supabase.from('storage_locations').insert({ workspace_id: workspaceId, parent_id: String(form.get('parent_id') || '') || null, name, code: String(form.get('code') || '').trim() || null, location_type: String(form.get('location_type') || 'other'), notes: String(form.get('notes') || '').trim(), sort_order: Number(form.get('sort_order')) || 0 }).select('id').single()
    setSaving(false)
    if (error) { setMessage(`Location could not be created: ${error.message}`); return }
    event.currentTarget.reset(); setShowCreate(false); setMessage('Storage location created.'); await loadLocations(data.id)
  }

  function chooseMove(entity: StoredEntity) {
    if (moveTarget?.id === entity.id && moveTarget.entityType === entity.entityType) { setMoveTarget(null); return }
    setMoveTarget(entity)
    const recent = entity.storageLocationId ? entity.storageLocationId : localStorage.getItem('calibre:last-put-away-location') || ''
    setDestinationId(locations.some((location) => location.id === recent) ? recent : '')
    setMessage('')
  }

  async function moveEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!moveTarget) return
    const form = new FormData(event.currentTarget)
    setSaving(true)
    const { data, error } = await supabase.rpc('move_storage_entity', { p_workspace_id: workspaceId, p_entity_type: moveTarget.entityType, p_entity_id: moveTarget.id, p_to_location_id: destinationId || null, p_note: String(form.get('move_note') || '').trim() })
    setSaving(false)
    if (error) { setMessage(`Move failed: ${error.message}`); return }
    if (!moveTarget.storageLocationId && destinationId) localStorage.setItem('calibre:last-put-away-location', destinationId)
    const result = data as { to_location_name?: string } | null
    setMessage(`${moveTarget.label} moved to ${result?.to_location_name || (destinationId ? 'the selected location' : 'Needs put-away')}.`)
    setMoveTarget(null)
    await Promise.all([loadContents(), loadHistory()])
    if (query.trim()) await searchEntities()
  }

  function currentPath(locationId: string | null) { return locationId ? pathById.get(locationId) || 'Unknown location' : 'Needs put-away' }
  function isMoveTarget(entity: StoredEntity) { return moveTarget?.id === entity.id && moveTarget.entityType === entity.entityType }

  function renderMoveForm(entity: StoredEntity) {
    if (!isMoveTarget(entity)) return null
    return <form className="storage-move-inline" onSubmit={moveEntity}>
      <div className="storage-move-inline-copy"><small>{entity.storageLocationId ? 'Moving from' : 'Putting away'}</small><strong>{currentPath(entity.storageLocationId)}</strong></div>
      <label>Destination<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} disabled={saving}><option value="">Needs put-away</option>{flattenedLocations.map((location) => <option key={location.id} value={location.id}>{pathById.get(location.id)}</option>)}</select></label>
      <label>Move note<input name="move_note" placeholder="Optional — put-away, bench return…" disabled={saving} /></label>
      <div className="storage-move-actions"><button type="button" className="secondary" onClick={() => setMoveTarget(null)} disabled={saving}>Cancel</button><button type="submit" className="primary" disabled={saving || destinationId === (entity.storageLocationId || '')}>{saving ? 'Moving…' : entity.storageLocationId ? 'Confirm move' : 'Put away'}</button></div>
    </form>
  }

  return <section className="storage-manager">
    <div className="storage-heading"><div><p className="eyebrow">PHYSICAL STORAGE</p><h2>Know exactly where everything is.</h2><p className="muted">Create any physical hierarchy you actually use — Incoming, Watch Stock, Parts Storage, Donor Watches, Bench, Tools, Dispatch or something else. Location never starts Work automatically.</p></div><button type="button" className="primary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close' : 'Add location'}</button></div>
    {message && <p className="inventory-message">{message}</p>}
    {showCreate && <form className="panel storage-create" onSubmit={createLocation}><div className="storage-create-grid"><label>Name<input name="name" required placeholder="e.g. Drawer 03" /></label><label>Code<input name="code" placeholder="e.g. PS-C1-D03" /></label><label>Type<select name="location_type" defaultValue="drawer">{locationTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</select></label><label>Parent<select name="parent_id" defaultValue=""><option value="">Top level</option>{flattenedLocations.map((location) => <option key={location.id} value={location.id}>{'—'.repeat(location.depth)} {location.code ? `${location.code} · ` : ''}{location.name}</option>)}</select></label><label>Sort order<input name="sort_order" type="number" defaultValue="0" /></label></div><label>Notes<textarea name="notes" rows={2} /></label><button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create location'}</button></form>}

    <div className="storage-layout">
      <aside className="panel storage-tree"><div className="storage-tree-head"><strong>Locations</strong><span>{locations.length}</span></div><button type="button" className={isPutAwayQueue ? 'storage-location-row active' : 'storage-location-row'} onClick={() => setSelectedLocationId('')}><span className="storage-location-icon">?</span><span><strong>Needs put-away</strong><small>{isPutAwayQueue ? `${totalWaiting} waiting` : 'Not allocated yet'}</small></span></button>{flattenedLocations.length === 0 && <p className="muted">No physical locations yet. Add the areas, cabinets, drawers or trays you actually use.</p>}{flattenedLocations.map((location) => <button key={location.id} type="button" className={selectedLocationId === location.id ? 'storage-location-row active' : 'storage-location-row'} style={{ paddingLeft: `${0.75 + location.depth * 0.85}rem` }} onClick={() => setSelectedLocationId(location.id)}><span className="storage-location-icon">{location.location_type === 'position' ? '•' : location.depth + 1}</span><span><strong>{location.code ? `${location.code} · ` : ''}{location.name}</strong><small>{titleCase(location.location_type)}</small></span></button>)}</aside>

      <div className="storage-main">
        <section className={`panel storage-location-detail ${isPutAwayQueue ? 'storage-put-away' : ''}`}>
          <div className="storage-location-detail-head"><div><p className="eyebrow">{selectedLocation ? titleCase(selectedLocation.location_type) : 'PUT-AWAY QUEUE'}</p><h3>{selectedLocation ? pathById.get(selectedLocation.id) : 'Received stock waiting for a home'}</h3>{isPutAwayQueue && <p className="muted">Pick a type, tap Move and allocate it without leaving the queue. Your last put-away destination is remembered for the next item.</p>}</div><strong>{totalWaiting}</strong></div>
          <div className="storage-counts"><button type="button" className={putAwayFilter === 'all' ? 'active' : ''} onClick={() => isPutAwayQueue && setPutAwayFilter('all')}><strong>{totalWaiting}</strong><small>{isPutAwayQueue ? 'All waiting' : 'Total'}</small></button><button type="button" className={putAwayFilter === 'item' ? 'active' : ''} onClick={() => isPutAwayQueue && setPutAwayFilter('item')}><strong>{counts.items}</strong><small>Items</small></button><button type="button" className={putAwayFilter === 'part' ? 'active' : ''} onClick={() => isPutAwayQueue && setPutAwayFilter('part')}><strong>{counts.parts}</strong><small>Parts</small></button><button type="button" className={putAwayFilter === 'tool' ? 'active' : ''} onClick={() => isPutAwayQueue && setPutAwayFilter('tool')}><strong>{counts.tools}</strong><small>Tools</small></button><button type="button" className={putAwayFilter === 'consumable' ? 'active' : ''} onClick={() => isPutAwayQueue && setPutAwayFilter('consumable')}><strong>{counts.consumables}</strong><small>Consumables</small></button></div>
          {loading && <p className="muted">Loading contents…</p>}{!loading && visibleContents.length === 0 && <p className="muted">{isPutAwayQueue ? 'Nothing waiting in this view.' : 'Nothing is stored here yet.'}</p>}
          <div className="storage-contents-list">{visibleContents.map((entity) => <div key={`${entity.entityType}-${entity.id}`} className={`storage-entity-card ${isMoveTarget(entity) ? 'expanded' : ''}`}><div className="storage-entity-row"><span className="storage-entity-type">{titleCase(entity.entityType)}</span><span><strong>{entity.label}</strong><small>{entity.detail || 'No extra detail'}</small></span><button type="button" className={isMoveTarget(entity) ? 'secondary' : ''} onClick={() => chooseMove(entity)}>{isMoveTarget(entity) ? 'Close' : isPutAwayQueue ? 'Put away' : 'Move'}</button></div>{renderMoveForm(entity)}</div>)}</div>
        </section>

        <section className="panel storage-quick-move"><div><p className="eyebrow">QUICK MOVE</p><h3>Find it, tap it, put it away.</h3><p className="muted">Search results expand in place, so the thing you are moving stays in context.</p></div><div className="storage-search-controls"><select value={entityType} onChange={(event) => setEntityType(event.target.value as EntityType)}>{entityTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</select><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${entityType}s…`} /></div>{query.trim() && searchResults.length === 0 ? <p className="muted">No matches.</p> : null}<div className="storage-search-results">{searchResults.map((entity) => <div key={`${entity.entityType}-${entity.id}`} className={`storage-search-result-card ${isMoveTarget(entity) ? 'expanded' : ''}`}><button className="storage-search-result-row" type="button" onClick={() => chooseMove(entity)}><span><strong>{entity.label}</strong><small>{entity.detail || titleCase(entity.entityType)}</small></span><span><small>Currently</small><strong>{currentPath(entity.storageLocationId)}</strong></span></button>{renderMoveForm(entity)}</div>)}</div></section>

        <section className="panel storage-history"><div><p className="eyebrow">LOCATION HISTORY</p><h3>Recent moves</h3></div>{history.length === 0 && <p className="muted">No storage moves recorded yet.</p>}{history.map((event) => <div key={event.id} className="storage-history-row"><span>{titleCase(event.entity_type)}</span><span><strong>{event.entity_label || 'Stored record'}</strong><small>{currentPath(event.from_location_id)} → {currentPath(event.to_location_id)}{event.note ? ` · ${event.note}` : ''}</small></span><time dateTime={event.moved_at}>{new Date(event.moved_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>)}</section>
      </div>
    </div>
  </section>
}
