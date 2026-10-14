import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import ArchiveConfirmDialog from './ArchiveConfirmDialog'

type Part = {
  id: string
  part_type: string
  manufacturer: string
  reference: string
  description: string
  condition: string
  quantity: number
  unit_cost: number | null
  currency: string
  storage_location_id: string | null
  donor_item_id: string | null
  notes: string
  provenance_type: string
  provenance_note: string
  replacement_cost: number | null
  knowledge_part_ref_id: string | null
}

type StorageLocation = { id: string; parent_id: string | null; name: string; code: string | null; location_type: string; sort_order: number }
type Donor = { id: string; item_number: number; title: string; status: string }
type Application = { part_id: string; movement_maker: string; calibre: string; evidence_class: string; verification_status: string; confidence: number | null }
type FitVerification = { part_id: string; result: 'confirmed' | 'rejected' | 'conditional' }

const PAGE_SIZE = 30
const provenanceOptions = [['unknown', 'Unknown'], ['purchased', 'Purchased'], ['new_old_stock', 'New old stock'], ['salvaged', 'Salvaged'], ['donor', 'From donor']]

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function cleanSearchTerm(value: string) { return value.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80) }

export default function PartsInventory() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [parts, setParts] = useState<Part[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [donors, setDonors] = useState<Donor[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [fits, setFits] = useState<FitVerification[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [movingPartId, setMovingPartId] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [conditionFilter, setConditionFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [totalParts, setTotalParts] = useState(0)
  const [unassignedParts, setUnassignedParts] = useState(0)
  const [totalApplications, setTotalApplications] = useState(0)
  const [totalConfirmedFits, setTotalConfirmedFits] = useState(0)
  const [archiveTarget, setArchiveTarget] = useState<Part | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  const [partType, setPartType] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [condition, setCondition] = useState('used')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [replacementCost, setReplacementCost] = useState('')
  const [provenanceType, setProvenanceType] = useState('unknown')
  const [provenanceNote, setProvenanceNote] = useState('')
  const [donorItemId, setDonorItemId] = useState('')
  const [storageLocationId, setStorageLocationId] = useState('')
  const [notes, setNotes] = useState('')

  const donorById = useMemo(() => new Map(donors.map((donor) => [donor.id, donor])), [donors])
  const pageCount = Math.max(1, Math.ceil(totalParts / PAGE_SIZE))

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

  const sortedLocations = useMemo(() => [...locations].sort((a, b) => (pathById.get(a.id) || a.name).localeCompare(pathById.get(b.id) || b.name)), [locations, pathById])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active) return
      if (error || !data) { setLoading(false); setMessage(`Parts workspace unavailable: ${error?.message ?? 'No workspace found.'}`); return }
      setWorkspaceId(data.id)
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const openPartForm = () => { setShowForm(true); setMessage('') }
    window.addEventListener('calibre:add-part', openPartForm)
    return () => window.removeEventListener('calibre:add-part', openPartForm)
  }, [])

  useEffect(() => { setPage(0) }, [query, conditionFilter, sourceFilter, locationFilter])

  async function loadReferenceData() {
    if (!workspaceId) return
    const [locationResult, donorResult, unassignedResult, applicationCountResult, confirmedFitCountResult] = await Promise.all([
      supabase.from('storage_locations').select('id,parent_id,name,code,location_type,sort_order').eq('workspace_id', workspaceId).order('sort_order').order('name'),
      supabase.from('items').select('id,item_number,title,status').eq('workspace_id', workspaceId).eq('purpose', 'donor').is('archived_at', null).order('item_number', { ascending: false }).limit(200),
      supabase.from('parts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
      supabase.from('part_applications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      supabase.from('part_fit_verifications').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('result', 'confirmed'),
    ])
    const error = locationResult.error ?? donorResult.error ?? unassignedResult.error ?? applicationCountResult.error ?? confirmedFitCountResult.error
    if (error) { setMessage(`Parts reference data failed to load: ${error.message}`); return }
    setLocations((locationResult.data ?? []) as StorageLocation[])
    setDonors((donorResult.data ?? []) as Donor[])
    setUnassignedParts(unassignedResult.count ?? 0)
    setTotalApplications(applicationCountResult.count ?? 0)
    setTotalConfirmedFits(confirmedFitCountResult.count ?? 0)
  }

  async function loadParts() {
    if (!workspaceId) return
    setLoading(true)
    const term = cleanSearchTerm(query)
    let request = supabase.from('parts')
      .select('id,part_type,manufacturer,reference,description,condition,quantity,unit_cost,currency,storage_location_id,donor_item_id,notes,provenance_type,provenance_note,replacement_cost,knowledge_part_ref_id', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
    if (term) request = request.or(`part_type.ilike.%${term}%,manufacturer.ilike.%${term}%,reference.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`)
    if (conditionFilter !== 'all') request = request.eq('condition', conditionFilter)
    if (sourceFilter === 'donor') request = request.not('donor_item_id', 'is', null)
    if (sourceFilter === 'purchased') request = request.eq('provenance_type', 'purchased')
    if (locationFilter === 'unassigned') request = request.is('storage_location_id', null)
    else if (locationFilter !== 'all') request = request.eq('storage_location_id', locationFilter)

    const partsResult = await request.order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (partsResult.error) { setLoading(false); setMessage(`Parts inventory failed to load: ${partsResult.error.message}`); return }

    const nextParts = (partsResult.data ?? []) as Part[]
    const ids = nextParts.map((part) => part.id)
    let pageApplications: Application[] = []
    let pageFits: FitVerification[] = []
    if (ids.length) {
      const [applicationResult, fitResult] = await Promise.all([
        supabase.from('part_applications').select('part_id,movement_maker,calibre,evidence_class,verification_status,confidence').eq('workspace_id', workspaceId).in('part_id', ids),
        supabase.from('part_fit_verifications').select('part_id,result').eq('workspace_id', workspaceId).in('part_id', ids),
      ])
      const error = applicationResult.error ?? fitResult.error
      if (error) { setLoading(false); setMessage(`Part evidence failed to load: ${error.message}`); return }
      pageApplications = (applicationResult.data ?? []) as Application[]
      pageFits = (fitResult.data ?? []) as FitVerification[]
    }
    setParts(nextParts); setApplications(pageApplications); setFits(pageFits); setTotalParts(partsResult.count ?? 0); setLoading(false); setMessage('')
  }

  useEffect(() => { if (workspaceId) void loadReferenceData() }, [workspaceId, refreshToken])
  useEffect(() => { if (workspaceId) void loadParts() }, [workspaceId, page, query, conditionFilter, sourceFilter, locationFilter, refreshToken])

  function resetForm() {
    setPartType(''); setManufacturer(''); setReference(''); setDescription(''); setCondition('used'); setQuantity('1'); setUnitCost(''); setReplacementCost(''); setProvenanceType('unknown'); setProvenanceNote(''); setDonorItemId(''); setStorageLocationId(''); setNotes('')
  }

  async function addPart(event: FormEvent) {
    event.preventDefault()
    if (!workspaceId || !partType.trim() || !description.trim()) return
    setSaving(true); setMessage('Saving part…')
    const qty = Math.max(0, Number(quantity) || 0)
    const { error } = await supabase.from('parts').insert({ workspace_id: workspaceId, part_type: partType.trim(), manufacturer: manufacturer.trim(), reference: reference.trim(), description: description.trim(), condition, quantity: qty, unit_cost: unitCost.trim() ? Number(unitCost) : null, currency: 'AUD', storage_location_id: storageLocationId || null, donor_item_id: donorItemId || null, notes: notes.trim(), provenance_type: donorItemId ? 'donor' : provenanceType, provenance_note: provenanceNote.trim(), replacement_cost: replacementCost.trim() ? Number(replacementCost) : null })
    setSaving(false)
    if (error) { setMessage(`Could not save part: ${error.message}`); return }
    resetForm(); setShowForm(false); setPage(0); setMessage('Part saved.')
    await Promise.all([loadReferenceData(), loadParts()])
  }

  async function movePart(part: Part, destinationId: string) {
    if (!workspaceId || movingPartId) return
    setMovingPartId(part.id)
    const { error } = await supabase.rpc('move_storage_entity', { p_workspace_id: workspaceId, p_entity_type: 'part', p_entity_id: part.id, p_to_location_id: destinationId || null, p_note: 'Moved from Parts inventory' })
    setMovingPartId('')
    if (error) { setMessage(`Part location could not be changed: ${error.message}`); return }
    setMessage(`${part.description} moved to ${destinationId ? (pathById.get(destinationId) || 'selected location') : 'Unassigned'}.`)
    await Promise.all([loadReferenceData(), loadParts()])
  }

  async function archivePart(reason: string) {
    if (!workspaceId || !archiveTarget || archiveBusy) return
    const target = archiveTarget
    setArchiveBusy(true)
    const { error } = await supabase.rpc('archive_inventory_entity', {
      p_workspace_id: workspaceId,
      p_entity_type: 'part',
      p_entity_id: target.id,
      p_reason: reason,
    })
    setArchiveBusy(false)
    if (error) {
      setMessage(`Part could not be archived: ${error.message}`)
      return
    }
    setArchiveTarget(null)
    setMessage(`${target.description} archived. It can be restored from Inventory → Trash.`)
    if (parts.length === 1 && page > 0) setPage((value) => Math.max(0, value - 1))
    else setRefreshToken((value) => value + 1)
  }

  return (
    <section className="parts-workspace-card">
      <div className="parts-heading"><div><p className="eyebrow">PARTS & DONORS</p><h2>Parts inventory</h2><p className="muted">Parts have their own physical location. They do not need to pass through the workshop or belong to an active Work record before being put away.</p></div><button type="button" onClick={() => setShowForm((value) => !value)} disabled={!workspaceId}>{showForm ? 'Close' : 'Add part'}</button></div>

      <div className="parts-stats">
        <div><span>Parts records</span><strong>{totalParts}</strong></div>
        <button type="button" onClick={() => setLocationFilter('unassigned')}><span>Needs put-away</span><strong>{unassignedParts}</strong></button>
        <div><span>Applications</span><strong>{totalApplications}</strong></div>
        <div><span>Bench confirmations</span><strong>{totalConfirmedFits}</strong></div>
      </div>

      <div className="parts-controls four">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search type, maker, reference, description…" aria-label="Search parts inventory" />
        <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)} aria-label="Filter parts by condition"><option value="all">All conditions</option><option value="new">New</option><option value="new_old_stock">New old stock</option><option value="used">Used</option><option value="salvaged">Salvaged</option><option value="for_parts">For parts</option><option value="unknown">Unknown</option></select>
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Filter parts by source"><option value="all">All sources</option><option value="donor">From donor</option><option value="purchased">Purchased</option></select>
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} aria-label="Filter parts by physical location"><option value="all">All locations</option><option value="unassigned">Needs put-away</option>{sortedLocations.map((location) => <option key={location.id} value={location.id}>{pathById.get(location.id) || location.name}</option>)}</select>
      </div>

      {showForm && <form className="part-entry-form" onSubmit={addPart}>
        <label>Part type<input autoFocus value={partType} onChange={(event) => setPartType(event.target.value)} placeholder="e.g. balance staff" required /></label>
        <label>Manufacturer<input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} placeholder="Maker if known" /></label>
        <label>Reference<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Factory / supplier reference" /></label>
        <label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="new">New</option><option value="new_old_stock">New old stock</option><option value="used">Used</option><option value="salvaged">Salvaged</option><option value="for_parts">For parts</option><option value="unknown">Unknown</option></select></label>
        <label className="part-form-wide">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What exactly is it?" required /></label>
        <label>Quantity<input type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label>Unit cost (AUD)<input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>
        <label>Replacement cost (AUD)<input type="number" min="0" step="0.01" value={replacementCost} onChange={(event) => setReplacementCost(event.target.value)} /></label>
        <label>Provenance<select value={provenanceType} onChange={(event) => setProvenanceType(event.target.value)} disabled={Boolean(donorItemId)}>{provenanceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Donor Item<select value={donorItemId} onChange={(event) => setDonorItemId(event.target.value)}><option value="">None</option>{donors.map((donor) => <option key={donor.id} value={donor.id}>#{donor.item_number} · {donor.title}</option>)}</select></label>
        <label>Physical location<select value={storageLocationId} onChange={(event) => setStorageLocationId(event.target.value)}><option value="">Needs put-away</option>{sortedLocations.map((location) => <option key={location.id} value={location.id}>{pathById.get(location.id) || location.name}</option>)}</select></label>
        <label className="part-form-wide">Provenance note<input value={provenanceNote} onChange={(event) => setProvenanceNote(event.target.value)} placeholder="Auction lot, supplier, donor detail…" /></label>
        <label className="part-form-wide">Notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="part-form-actions"><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save part'}</button><button type="button" className="secondary" disabled={saving} onClick={() => { resetForm(); setShowForm(false) }}>Cancel</button></div>
      </form>}

      {message && <p className="parts-message">{message}</p>}

      <div className="donor-strip"><div><strong>Donor Items</strong><span>A donor stays an Item; loose parts removed from it get their own physical locations here.</span></div>{donors.length === 0 ? <p>No donor Items recorded yet.</p> : <div className="donor-list">{donors.slice(0, 24).map((donor) => <span key={donor.id}>#{donor.item_number} · {donor.title}</span>)}</div>}</div>

      <div className="parts-list">
        {loading && <p className="muted">Loading parts…</p>}
        {!loading && parts.length === 0 && <div className="parts-empty"><strong>No matching parts.</strong><span>{query || conditionFilter !== 'all' || sourceFilter !== 'all' || locationFilter !== 'all' ? 'Try clearing a filter.' : 'Add loose stock or parts removed from a donor.'}</span></div>}
        {parts.map((part) => {
          const donor = part.donor_item_id ? donorById.get(part.donor_item_id) : null
          const partApplications = applications.filter((application) => application.part_id === part.id)
          const confirmedFits = fits.filter((fit) => fit.part_id === part.id && fit.result === 'confirmed').length
          const locationPath = part.storage_location_id ? pathById.get(part.storage_location_id) || 'Unknown location' : 'Needs put-away'
          return <article className="part-card" key={part.id}>
            <div className="part-card-top"><div><span>{titleCase(part.part_type)}</span><h3>{part.description}</h3><p>{[part.manufacturer, part.reference].filter(Boolean).join(' · ') || 'No maker/reference recorded'}</p></div><strong>×{Number(part.quantity)}</strong></div>
            <div className="part-meta-grid">
              <div><span>Condition</span><strong>{titleCase(part.condition)}</strong></div>
              <div><span>Source</span><strong>{donor ? `Donor #${donor.item_number}` : titleCase(part.provenance_type)}</strong></div>
              <div className="part-location-cell"><span>Physical location</span><strong>{locationPath}</strong></div>
              <div><span>Cost / replace</span><strong>{money(part.unit_cost, part.currency)} / {money(part.replacement_cost, part.currency)}</strong></div>
            </div>
            <label className="part-quick-move">Move part<select value={part.storage_location_id || ''} disabled={movingPartId === part.id} onChange={(event) => void movePart(part, event.target.value)}><option value="">Needs put-away</option>{sortedLocations.map((location) => <option key={location.id} value={location.id}>{pathById.get(location.id) || location.name}</option>)}</select></label>
            <div className="part-evidence-row"><span>{partApplications.length} application{partApplications.length === 1 ? '' : 's'}</span><span>{confirmedFits} confirmed fit{confirmedFits === 1 ? '' : 's'}</span>{part.knowledge_part_ref_id && <span>Knowledge linked</span>}</div>
            {(part.provenance_note || part.notes) && <p className="part-notes">{part.provenance_note || part.notes}</p>}
            <div className="part-card-actions"><button type="button" className="secondary small" onClick={() => setArchiveTarget(part)}>Remove</button></div>
          </article>
        })}
      </div>

      {totalParts > PAGE_SIZE && <div className="parts-pagination" aria-label="Parts pages"><button type="button" className="secondary small" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>← Previous</button><span>Page {page + 1} of {pageCount} · {totalParts} matching</span><button type="button" className="secondary small" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}

      <ArchiveConfirmDialog
        open={Boolean(archiveTarget)}
        label={archiveTarget?.description || 'Part'}
        busy={archiveBusy}
        onCancel={() => { if (!archiveBusy) setArchiveTarget(null) }}
        onConfirm={archivePart}
      />
    </section>
  )
}
