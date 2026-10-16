import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type DonorItem = {
  id: string
  item_number: number
  title: string
  type: string
  status: string
  storage_location_id: string | null
}

type DonorPart = {
  id: string
  donor_item_id: string | null
  part_type: string
  manufacturer: string
  reference: string
  description: string
  condition: string
  quantity: number
  storage_location_id: string | null
}

type StorageLocation = {
  id: string
  parent_id: string | null
  name: string
  code: string | null
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function DonorInventory({ workspaceId }: { workspaceId: string }) {
  const [donors, setDonors] = useState<DonorItem[]>([])
  const [parts, setParts] = useState<DonorPart[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [donorResult, partResult, locationResult] = await Promise.all([
        supabase.from('items')
          .select('id,item_number,title,type,status,storage_location_id')
          .eq('workspace_id', workspaceId)
          .eq('purpose', 'donor')
          .is('archived_at', null)
          .order('item_number', { ascending: false }),
        supabase.from('parts')
          .select('id,donor_item_id,part_type,manufacturer,reference,description,condition,quantity,storage_location_id')
          .eq('workspace_id', workspaceId)
          .not('donor_item_id', 'is', null)
          .is('archived_at', null)
          .order('created_at', { ascending: false }),
        supabase.from('storage_locations')
          .select('id,parent_id,name,code')
          .eq('workspace_id', workspaceId),
      ])
      if (cancelled) return
      setLoading(false)
      const error = donorResult.error ?? partResult.error ?? locationResult.error
      if (error) {
        setMessage(`Donor inventory failed to load: ${error.message}`)
        return
      }
      setDonors((donorResult.data ?? []) as DonorItem[])
      setParts((partResult.data ?? []) as DonorPart[])
      setLocations((locationResult.data ?? []) as StorageLocation[])
      setMessage('')
    })()
    return () => { cancelled = true }
  }, [workspaceId])

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
      const value = location.parent_id ? `${build(location.parent_id, seen)} / ${own}` : own
      cache.set(id, value)
      return value
    }
    locations.forEach((location) => build(location.id))
    return cache
  }, [locations])

  const partsByDonor = useMemo(() => {
    const grouped = new Map<string, DonorPart[]>()
    for (const part of parts) {
      if (!part.donor_item_id) continue
      const current = grouped.get(part.donor_item_id) ?? []
      current.push(part)
      grouped.set(part.donor_item_id, current)
    }
    return grouped
  }, [parts])

  const visibleDonors = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return donors
    return donors.filter((donor) => {
      const donorParts = partsByDonor.get(donor.id) ?? []
      const searchable = [
        donor.item_number,
        donor.title,
        donor.type,
        donor.status,
        ...donorParts.flatMap((part) => [part.part_type, part.manufacturer, part.reference, part.description, part.condition]),
      ].join(' ').toLowerCase()
      return searchable.includes(term)
    })
  }, [donors, partsByDonor, query])

  const totalUnits = useMemo(() => parts.reduce((sum, part) => sum + Math.max(0, Number(part.quantity) || 0), 0), [parts])
  const donorsWithHarvestedParts = useMemo(() => new Set(parts.filter((part) => part.donor_item_id).map((part) => part.donor_item_id)).size, [parts])

  function openPartsForHarvest() {
    window.dispatchEvent(new CustomEvent('calibre:inventory-view', { detail: 'parts' }))
    window.setTimeout(() => window.dispatchEvent(new Event('calibre:add-part')), 0)
  }

  return (
    <section className="parts-workspace-card">
      <div className="parts-heading">
        <div>
          <p className="eyebrow">DONOR STOCK</p>
          <h2>Donor watches & harvested parts</h2>
          <p className="muted">Donor watches remain permanent Items. Harvested parts stay in the normal Parts inventory and retain a link back to their source donor.</p>
        </div>
        <button type="button" onClick={openPartsForHarvest}>Add harvested part</button>
      </div>

      <div className="parts-stats">
        <div><span>Donor watches</span><strong>{donors.length}</strong></div>
        <div><span>Harvested part records</span><strong>{parts.length}</strong></div>
        <div><span>Parts in stock</span><strong>{totalUnits}</strong></div>
        <div><span>Donors harvested</span><strong>{donorsWithHarvestedParts}</strong></div>
      </div>

      <div className="parts-controls">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search donor, calibre clue, part, reference…"
          aria-label="Search donor inventory"
        />
      </div>

      {message && <p className="inventory-message">{message}</p>}
      {loading && <p className="inventory-empty">Loading donor stock…</p>}
      {!loading && visibleDonors.length === 0 && (
        <div className="inventory-empty">
          <strong>{donors.length ? 'No donor stock matches this search.' : 'No donor watches yet.'}</strong>
          <span>Move a watch to Donor from Inventory, then harvest parts into the Parts inventory as you strip it.</span>
        </div>
      )}

      {!loading && visibleDonors.map((donor) => {
        const donorParts = partsByDonor.get(donor.id) ?? []
        const availableUnits = donorParts.reduce((sum, part) => sum + Math.max(0, Number(part.quantity) || 0), 0)
        return (
          <section key={donor.id} className="inventory-list-panel">
            <div className="inventory-v2-list-heading">
              <div>
                <p className="eyebrow">DONOR ITEM #{donor.item_number}</p>
                <h2>{donor.title}</h2>
                <p className="muted">{titleCase(donor.type)} · {titleCase(donor.status)} · {donor.storage_location_id ? (pathById.get(donor.storage_location_id) || 'Unknown location') : 'Needs put-away'}</p>
              </div>
              <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(donor.id)}` }}>Open Item</button>
            </div>

            {donorParts.length === 0 ? (
              <div className="inventory-empty"><span>No harvested parts recorded from this donor yet.</span></div>
            ) : (
              <div className="inventory-list">
                {donorParts.map((part) => (
                  <div key={part.id} className="inventory-row">
                    <span className="inventory-row-number">{part.quantity}×</span>
                    <span className="inventory-row-main">
                      <strong>{part.description || titleCase(part.part_type)}</strong>
                      <small>{[part.manufacturer, part.reference, titleCase(part.condition), part.storage_location_id ? (pathById.get(part.storage_location_id) || 'Unknown location') : 'Needs put-away'].filter(Boolean).join(' · ')}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="muted">{donorParts.length} harvested record{donorParts.length === 1 ? '' : 's'} · {availableUnits} unit{availableUnits === 1 ? '' : 's'} currently in stock</p>
          </section>
        )
      })}
    </section>
  )
}
