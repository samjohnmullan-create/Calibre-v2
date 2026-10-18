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

type DonorPassport = {
  item_id: string
  knowledge_movement_id: string | null
  movement_maker: string
  calibre: string
  calibre_family: string
  movement_type: string
  movement_diameter_mm: number | null
  setting_system: string
  jewels: number | null
  beat_rate: number | null
  escapement: string
  technical_notes: string
}

type StorageLocation = {
  id: string
  parent_id: string | null
  name: string
  code: string | null
}

type RebuildPair = {
  left: DonorItem
  right: DonorItem
  score: number
  level: 'strong' | 'possible' | 'lead'
  label: string
  reasons: string[]
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function display(value: string | number | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
}

function norm(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  const left = norm(a)
  const right = norm(b)
  return Boolean(left && right && left === right)
}

function scorePair(left: DonorPassport | undefined, right: DonorPassport | undefined) {
  if (!left || !right) return { score: 0, reasons: [] as string[] }
  let score = 0
  const reasons: string[] = []

  if (left.knowledge_movement_id && left.knowledge_movement_id === right.knowledge_movement_id) {
    score += 100
    reasons.push('Same identified Knowledge movement')
  } else if (sameText(left.calibre, right.calibre)) {
    score += sameText(left.movement_maker, right.movement_maker) ? 88 : 72
    reasons.push(sameText(left.movement_maker, right.movement_maker) ? 'Same maker and exact Passport calibre' : 'Exact Passport calibre')
  } else if (sameText(left.calibre_family, right.calibre_family)) {
    score += sameText(left.movement_maker, right.movement_maker) ? 56 : 44
    reasons.push('Same calibre family')
  }

  if (sameText(left.movement_maker, right.movement_maker)) {
    score += 8
    reasons.push('Same movement maker')
  }
  if (sameText(left.movement_type, right.movement_type)) score += 3
  if (sameText(left.setting_system, right.setting_system)) {
    score += 4
    reasons.push('Same setting system')
  }
  if (left.beat_rate && right.beat_rate && left.beat_rate === right.beat_rate) {
    score += 4
    reasons.push(`Same beat rate (${left.beat_rate} BPH)`)
  }
  if (left.movement_diameter_mm != null && right.movement_diameter_mm != null) {
    const delta = Math.abs(left.movement_diameter_mm - right.movement_diameter_mm)
    if (delta <= 0.05) {
      score += 8
      reasons.push('Movement diameter effectively identical')
    } else if (delta <= 0.15) {
      score += 4
      reasons.push('Movement diameter within 0.15 mm')
    }
  }

  return { score: Math.min(score, 100), reasons }
}

export default function DonorInventory({ workspaceId }: { workspaceId: string }) {
  const [donors, setDonors] = useState<DonorItem[]>([])
  const [parts, setParts] = useState<DonorPart[]>([])
  const [passports, setPassports] = useState<DonorPassport[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [donorResult, partResult, passportResult, locationResult] = await Promise.all([
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
        supabase.from('passports')
          .select('item_id,knowledge_movement_id,movement_maker,calibre,calibre_family,movement_type,movement_diameter_mm,setting_system,jewels,beat_rate,escapement,technical_notes')
          .eq('workspace_id', workspaceId),
        supabase.from('storage_locations')
          .select('id,parent_id,name,code')
          .eq('workspace_id', workspaceId),
      ])
      if (cancelled) return
      setLoading(false)
      const error = donorResult.error ?? partResult.error ?? passportResult.error ?? locationResult.error
      if (error) {
        setMessage(`Donor inventory failed to load: ${error.message}`)
        return
      }
      setDonors((donorResult.data ?? []) as DonorItem[])
      setParts((partResult.data ?? []) as DonorPart[])
      setPassports((passportResult.data ?? []) as DonorPassport[])
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

  const passportByItemId = useMemo(() => new Map(passports.map((passport) => [passport.item_id, passport])), [passports])

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

  const rebuildPairs = useMemo<RebuildPair[]>(() => {
    const rows: RebuildPair[] = []
    for (let i = 0; i < donors.length; i += 1) {
      for (let j = i + 1; j < donors.length; j += 1) {
        const left = donors[i]
        const right = donors[j]
        const scored = scorePair(passportByItemId.get(left.id), passportByItemId.get(right.id))
        if (scored.score < 50) continue
        const level: RebuildPair['level'] = scored.score >= 85 ? 'strong' : scored.score >= 65 ? 'possible' : 'lead'
        rows.push({
          left,
          right,
          score: scored.score,
          level,
          label: level === 'strong' ? 'Strong rebuild pair' : level === 'possible' ? 'Possible rebuild pair' : 'Same-family lead',
          reasons: scored.reasons,
        })
      }
    }
    return rows.sort((a, b) => b.score - a.score).slice(0, 12)
  }, [donors, passportByItemId])

  const visibleDonors = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return donors
    return donors.filter((donor) => {
      const donorParts = partsByDonor.get(donor.id) ?? []
      const passport = passportByItemId.get(donor.id)
      const searchable = [
        donor.item_number,
        donor.title,
        donor.type,
        donor.status,
        passport?.movement_maker,
        passport?.calibre,
        passport?.calibre_family,
        passport?.movement_type,
        passport?.movement_diameter_mm,
        passport?.setting_system,
        passport?.jewels,
        passport?.beat_rate,
        passport?.escapement,
        passport?.technical_notes,
        ...donorParts.flatMap((part) => [part.part_type, part.manufacturer, part.reference, part.description, part.condition]),
      ].filter((value) => value !== null && value !== undefined).join(' ').toLowerCase()
      return searchable.includes(term)
    })
  }, [donors, partsByDonor, passportByItemId, query])

  const totalUnits = useMemo(() => parts.reduce((sum, part) => sum + Math.max(0, Number(part.quantity) || 0), 0), [parts])
  const donorsWithHarvestedParts = useMemo(() => new Set(parts.filter((part) => part.donor_item_id).map((part) => part.donor_item_id)).size, [parts])
  const completeDonors = Math.max(0, donors.length - donorsWithHarvestedParts)
  const identifiedDonors = useMemo(() => donors.filter((donor) => {
    const passport = passportByItemId.get(donor.id)
    return Boolean(passport?.calibre || passport?.calibre_family || passport?.movement_maker)
  }).length, [donors, passportByItemId])

  function openPartsInventory() {
    window.dispatchEvent(new CustomEvent('calibre:inventory-view', { detail: 'parts' }))
  }

  return (
    <section className="parts-workspace-card">
      <div className="parts-heading">
        <div>
          <p className="eyebrow">DONOR WATCHES</p>
          <h2>Complete donors first</h2>
          <p className="muted">A donor stays a complete watch until you physically remove something. Its Passport provides calibre and movement data for compatibility searches; only removed components become Parts records.</p>
        </div>
        <button type="button" className="secondary" onClick={openPartsInventory}>Open loose parts</button>
      </div>

      <div className="parts-stats">
        <div><span>Donor watches</span><strong>{donors.length}</strong></div>
        <div><span>Still complete</span><strong>{completeDonors}</strong></div>
        <div><span>Movement identified</span><strong>{identifiedDonors}</strong></div>
        <div><span>Rebuild leads</span><strong>{rebuildPairs.length}</strong></div>
      </div>

      {!loading && rebuildPairs.length > 0 && (
        <section className="inventory-list-panel">
          <div className="inventory-v2-list-heading">
            <div>
              <p className="eyebrow">REBUILD INTELLIGENCE</p>
              <h2>Potential donor combinations</h2>
              <p className="muted">Calibre has found donor watches that may be worth combining into one better watch. These are evidence-ranked leads, not automatic proof that every component interchanges.</p>
            </div>
            <span>{rebuildPairs.length} lead{rebuildPairs.length === 1 ? '' : 's'}</span>
          </div>
          <div className="inventory-list">
            {rebuildPairs.map((pair) => (
              <div className="inventory-row" key={`${pair.left.id}-${pair.right.id}`}>
                <span className="inventory-row-number">{pair.score}</span>
                <span className="inventory-row-main">
                  <strong>{pair.label}: #{pair.left.item_number} {pair.left.title} + #{pair.right.item_number} {pair.right.title}</strong>
                  <small>{pair.reasons.join(' · ')}</small>
                  <small>Verify component condition, dimensions and interchangeability before harvesting either donor.</small>
                </span>
                <span className="inventory-row-actions">
                  <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(pair.left.id)}` }}>Open #{pair.left.item_number}</button>
                  <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(pair.right.id)}` }}>Open #{pair.right.item_number}</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="parts-controls">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search donor, maker, calibre, family, diameter, part…"
          aria-label="Search donor inventory"
        />
      </div>

      {message && <p className="inventory-message">{message}</p>}
      {loading && <p className="inventory-empty">Loading donor watches…</p>}
      {!loading && visibleDonors.length === 0 && (
        <div className="inventory-empty">
          <strong>{donors.length ? 'No donor watches match this search.' : 'No donor watches yet.'}</strong>
          <span>Move a watch to Donor from Inventory. It can remain complete until you actually need a component.</span>
        </div>
      )}

      {!loading && visibleDonors.map((donor) => {
        const donorParts = partsByDonor.get(donor.id) ?? []
        const passport = passportByItemId.get(donor.id)
        const isComplete = donorParts.length === 0
        const availableUnits = donorParts.reduce((sum, part) => sum + Math.max(0, Number(part.quantity) || 0), 0)
        return (
          <section key={donor.id} className="inventory-list-panel">
            <div className="inventory-v2-list-heading">
              <div>
                <p className="eyebrow">DONOR ITEM #{donor.item_number}</p>
                <h2>{donor.title}</h2>
                <p className="muted">{titleCase(donor.type)} · {isComplete ? 'Complete donor' : 'Partially harvested'} · {donor.storage_location_id ? (pathById.get(donor.storage_location_id) || 'Unknown location') : 'Needs put-away'}</p>
              </div>
              <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(donor.id)}` }}>Open donor</button>
            </div>

            <div className="item-v2-detail-grid">
              <div><dt>Movement maker</dt><dd>{display(passport?.movement_maker)}</dd></div>
              <div><dt>Calibre</dt><dd>{display(passport?.calibre)}</dd></div>
              <div><dt>Calibre family</dt><dd>{display(passport?.calibre_family)}</dd></div>
              <div><dt>Movement type</dt><dd>{display(passport?.movement_type)}</dd></div>
              <div><dt>Diameter</dt><dd>{display(passport?.movement_diameter_mm, passport?.movement_diameter_mm ? ' mm' : '')}</dd></div>
              <div><dt>Setting system</dt><dd>{display(passport?.setting_system)}</dd></div>
              <div><dt>Jewels</dt><dd>{display(passport?.jewels)}</dd></div>
              <div><dt>Beat rate</dt><dd>{display(passport?.beat_rate, passport?.beat_rate ? ' BPH' : '')}</dd></div>
            </div>

            {!passport?.calibre && !passport?.calibre_family && !passport?.movement_maker && (
              <p className="inventory-message">Movement identity is not recorded yet. Open the donor and complete its Passport to improve future compatibility matching.</p>
            )}

            {isComplete ? (
              <div className="inventory-empty">
                <strong>Complete donor watch</strong>
                <span>No parts have been removed. Keep it intact until a repair needs something from it.</span>
              </div>
            ) : (
              <>
                <div className="inventory-v2-list-heading">
                  <div><p className="eyebrow">REMOVED COMPONENTS</p><h3>Harvested from this donor</h3></div>
                  <span>{availableUnits} unit{availableUnits === 1 ? '' : 's'}</span>
                </div>
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
              </>
            )}
          </section>
        )
      })}
    </section>
  )
}