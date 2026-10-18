import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './record-health.css'

type LocationRow = {
  id: string
  parent_id: string | null
  name: string
  code: string | null
  location_type: string
  sort_order: number
}

type ItemStorageRow = {
  storage_location_id: string | null
}

type RecordHealth = {
  completion_pct: number
  health_state: string
  missing_labels: string[]
}

type MoveEvent = {
  id: string
  from_location_id: string | null
  to_location_id: string | null
  note: string
  moved_at: string
}

type Props = {
  workspaceId: string
  itemId: string
  mode?: 'summary' | 'history'
  onMoved?: () => void | Promise<void>
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function ItemStoragePanel({ workspaceId, itemId, mode = 'summary', onMoved }: Props) {
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [storageLocationId, setStorageLocationId] = useState<string | null>(null)
  const [health, setHealth] = useState<RecordHealth | null>(null)
  const [history, setHistory] = useState<MoveEvent[]>([])
  const [moving, setMoving] = useState(false)
  const [destinationId, setDestinationId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
    const knownIds = new Set(locations.map((location) => location.id))
    for (const location of locations) {
      if (!location.parent_id || !knownIds.has(location.parent_id)) roots.push(location)
      else {
        const list = children.get(location.parent_id) ?? []
        list.push(location)
        children.set(location.parent_id, list)
      }
    }
    const sort = (rows: LocationRow[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    const result: Array<LocationRow & { depth: number }> = []
    const walk = (rows: LocationRow[], depth: number) => {
      for (const row of sort(rows)) {
        result.push({ ...row, depth })
        walk(children.get(row.id) ?? [], depth + 1)
      }
    }
    walk(roots, 0)
    return result
  }, [locations])

  async function load() {
    if (!workspaceId || !itemId) return
    const [locationResult, itemResult, healthResult, historyResult] = await Promise.all([
      supabase
        .from('storage_locations')
        .select('id,parent_id,name,code,location_type,sort_order')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
        .limit(500),
      supabase
        .from('items')
        .select('storage_location_id')
        .eq('workspace_id', workspaceId)
        .eq('id', itemId)
        .maybeSingle(),
      supabase
        .from('item_record_health')
        .select('completion_pct,health_state,missing_labels')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .maybeSingle(),
      supabase
        .from('storage_location_events')
        .select('id,from_location_id,to_location_id,note,moved_at')
        .eq('workspace_id', workspaceId)
        .eq('entity_type', 'item')
        .eq('entity_id', itemId)
        .order('moved_at', { ascending: false })
        .limit(mode === 'history' ? 50 : 8),
    ])

    const error = locationResult.error ?? itemResult.error ?? healthResult.error ?? historyResult.error
    if (error) {
      setMessage(`Storage failed to load: ${error.message}`)
      return
    }

    setLocations((locationResult.data ?? []) as LocationRow[])
    setStorageLocationId((itemResult.data as ItemStorageRow | null)?.storage_location_id ?? null)
    setHealth((healthResult.data ?? null) as RecordHealth | null)
    setHistory((historyResult.data ?? []) as MoveEvent[])
    setMessage('')
  }

  useEffect(() => {
    void load()
  }, [workspaceId, itemId, mode])

  async function submitMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    const { data, error } = await supabase.rpc('move_storage_entity', {
      p_workspace_id: workspaceId,
      p_entity_type: 'item',
      p_entity_id: itemId,
      p_to_location_id: destinationId || null,
      p_note: String(form.get('move_note') || '').trim(),
    })
    setSaving(false)
    if (error) {
      setMessage(`Move failed: ${error.message}`)
      return
    }

    const result = data as { to_location_name?: string } | null
    setMessage(`Moved to ${result?.to_location_name || (destinationId ? 'the selected location' : 'Unassigned')}.`)
    setMoving(false)
    await load()
    await onMoved?.()
  }

  function locationPath(locationId: string | null) {
    return locationId ? pathById.get(locationId) || 'Unknown location' : 'Unassigned'
  }

  if (mode === 'history') {
    return (
      <section className="section-card item-storage-history">
        <div className="item-v2-section-heading">
          <div>
            <p className="eyebrow">STORAGE HISTORY</p>
            <h2>Physical location moves</h2>
          </div>
          <span className="item-storage-current">Now: {locationPath(storageLocationId)}</span>
        </div>
        {message && <p className="item-v2-message">{message}</p>}
        {history.length === 0 ? (
          <p className="muted">No storage moves recorded yet.</p>
        ) : (
          <div className="item-v2-timeline item-storage-timeline">
            {history.map((event) => (
              <div key={event.id}>
                <time>{new Date(event.moved_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                <strong>{locationPath(event.from_location_id)} → {locationPath(event.to_location_id)}</strong>
                <span>{event.note || 'Physical location changed.'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="section-card item-storage-card">
      <div className="item-storage-card-heading">
        <div>
          <p className="eyebrow">STORAGE</p>
          <h3>{locationPath(storageLocationId)}</h3>
        </div>
        <span className={`item-storage-state ${storageLocationId ? 'assigned' : 'unassigned'}`}>
          {storageLocationId ? 'Assigned' : 'Unassigned'}
        </span>
      </div>
      <p className="muted">{storageLocationId ? 'Current physical location.' : 'This Item still needs a physical storage location.'}</p>

      {health && <div className={`record-health-compact state-${health.health_state}`}>
        <div className="record-health-compact-head"><span>Record health</span><strong>{health.completion_pct}%</strong></div>
        <div className="record-health-track" aria-label={`Record health ${health.completion_pct}%`}><span style={{ width: `${health.completion_pct}%` }} /></div>
        <small>{health.missing_labels.length ? `Needs ${health.missing_labels.slice(0, 3).join(' · ')}${health.missing_labels.length > 3 ? ` · +${health.missing_labels.length - 3}` : ''}` : 'Core Item record complete.'}</small>
      </div>}

      {message && <p className="item-v2-message">{message}</p>}

      {!moving ? (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setDestinationId(storageLocationId || '')
            setMoving(true)
            setMessage('')
          }}
        >
          {storageLocationId ? 'Move Item →' : 'Put away →'}
        </button>
      ) : (
        <form className="item-storage-move" onSubmit={submitMove}>
          <label>
            Destination
            <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
              <option value="">Unassigned</option>
              {flattenedLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {'—'.repeat(location.depth)} {location.code ? `${location.code} · ` : ''}{location.name} · {titleCase(location.location_type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Move note
            <input name="move_note" placeholder="Optional — e.g. put away after service" />
          </label>
          <div className="item-storage-actions">
            <button type="button" className="secondary small" disabled={saving} onClick={() => setMoving(false)}>Cancel</button>
            <button type="submit" className="small" disabled={saving}>{saving ? 'Moving…' : storageLocationId ? 'Confirm move' : 'Put away'}</button>
          </div>
        </form>
      )}
    </section>
  )
}
