import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

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

const provenanceOptions = [
  ['unknown', 'Unknown'],
  ['purchased', 'Purchased'],
  ['new_old_stock', 'New old stock'],
  ['salvaged', 'Salvaged'],
  ['donor', 'From donor'],
]

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

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
  const [message, setMessage] = useState('')

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
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active) return
      if (error || !data) {
        setLoading(false)
        setMessage(`Parts workspace unavailable: ${error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(data.id)
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const openPartForm = () => {
      setShowForm(true)
      setMessage('')
    }
    window.addEventListener('calibre:add-part', openPartForm)
    return () => window.removeEventListener('calibre:add-part', openPartForm)
  }, [])

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    const [partsResult, locationResult, donorResult, applicationResult, fitResult] = await Promise.all([
      supabase.from('parts').select('id,part_type,manufacturer,reference,description,condition,quantity,unit_cost,currency,storage_location_id,donor_item_id,notes,provenance_type,provenance_note,replacement_cost,knowledge_part_ref_id').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabase.from('storage_locations').select('id,parent_id,name,code,location_type,sort_order').eq('workspace_id', workspaceId).order('sort_order', { ascending: true }).order('name', { ascending: true }),
      supabase.from('items').select('id,item_number,title,status').eq('workspace_id', workspaceId).eq('purpose', 'donor').is('archived_at', null).order('item_number', { ascending: false }),
      supabase.from('part_applications').select('part_id,movement_maker,calibre,evidence_class,verification_status,confidence').eq('workspace_id', workspaceId),
      supabase.from('part_fit_verifications').select('part_id,result').eq('workspace_id', workspaceId),
    ])
    setLoading(false)

    const error = partsResult.error ?? locationResult.error ?? donorResult.error ?? applicationResult.error ?? fitResult.error
    if (error) {
      setMessage(`Parts inventory failed to load: ${error.message}`)
      return
    }

    setParts((partsResult.data ?? []) as Part[])
    setLocations((locationResult.data ?? []) as StorageLocation[])
    setDonors((donorResult.data ?? []) as Donor[])
    setApplications((applicationResult.data ?? []) as Application[])
    setFits((fitResult.data ?? []) as FitVerification[])
  }

  useEffect(() => { if (workspaceId) void load() }, [workspaceId])

  function resetForm() {
    setPartType('')
    setManufacturer('')
    setReference('')
    setDescription('')
    setCondition('used')
    setQuantity('1')
    setUnitCost('')
    setReplacementCost('')
    setProvenanceType('unknown')
    setProvenanceNote('')
    setDonorItemId('')
    setStorageLocationId('')
    setNotes('')
  }

  async function addPart(event: FormEvent) {
    event.preventDefault()
    if (!workspaceId || !partType.trim() || !description.trim()) return
    setSaving(true)
    setMessage('Saving part…')

    const qty = Math.max(0, Number(quantity) || 0)
    const { error } = await supabase.from('parts').insert({
      workspace_id: workspaceId,
      part_type: partType.trim(),
      manufacturer: manufacturer.trim(),
      reference: reference.trim(),
      description: description.trim(),
      condition,
      quantity: qty,
      unit_cost: unitCost.trim() ? Number(unitCost) : null,
      currency: 'AUD',
      storage_location_id: storageLocationId || null,
      donor_item_id: donorItemId || null,
      notes: notes.trim(),
      provenance_type: donorItemId ? 'donor' : provenanceType,
      provenance_note: provenanceNote.trim(),
      replacement_cost: replacementCost.trim() ? Number(replacementCost) : null,
    })

    setSaving(false)
    if (error) {
      setMessage(`Could not save part: ${error.message}`)
      return
    }

    resetForm()
    setShowForm(false)
    setMessage('Part saved.')
    await load()
  }

  return (
    <section className="parts-workspace-card">
      <div className="parts-heading">
        <div>
          <p className="eyebrow">PARTS & DONORS</p>
          <h2>Workshop inventory</h2>
          <p className="muted">Owned parts and donor stock stay separate from reference compatibility. Bench-confirmed fits are recorded as evidence, not assumptions.</p>
        </div>
        <button type="button" onClick={() => setShowForm((value) => !value)} disabled={!workspaceId}>{showForm ? 'Close' : 'Add part'}</button>
      </div>

      <div className="parts-stats">
        <div><span>Parts records</span><strong>{parts.length}</strong></div>
        <div><span>Donor Items</span><strong>{donors.length}</strong></div>
        <div><span>Applications</span><strong>{applications.length}</strong></div>
        <div><span>Bench confirmations</span><strong>{fits.filter((fit) => fit.result === 'confirmed').length}</strong></div>
      </div>

      {showForm && (
        <form className="part-entry-form" onSubmit={addPart}>
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
          <label>Storage location<select value={storageLocationId} onChange={(event) => setStorageLocationId(event.target.value)}><option value="">Not assigned</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.code ? `${location.code} · ` : ''}{location.name}</option>)}</select></label>
          <label className="part-form-wide">Provenance note<input value={provenanceNote} onChange={(event) => setProvenanceNote(event.target.value)} placeholder="Auction lot, supplier, donor detail…" /></label>
          <label className="part-form-wide">Notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="part-form-actions"><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save part'}</button><button type="button" className="secondary" disabled={saving} onClick={() => { resetForm(); setShowForm(false) }}>Cancel</button></div>
        </form>
      )}

      {message && <p className="parts-message">{message}</p>}

      <div className="donor-strip">
        <div><strong>Donor Items</strong><span>Donor remains an Item purpose — not a second inventory system.</span></div>
        {donors.length === 0 ? <p>No donor Items recorded yet.</p> : <div className="donor-list">{donors.map((donor) => <span key={donor.id}>#{donor.item_number} · {donor.title}</span>)}</div>}
      </div>

      <div className="parts-list">
        {loading && <p className="muted">Loading parts…</p>}
        {!loading && parts.length === 0 && <div className="parts-empty"><strong>No parts recorded yet.</strong><span>Add loose stock or parts removed from a donor.</span></div>}
        {parts.map((part) => {
          const donor = part.donor_item_id ? donorById.get(part.donor_item_id) : null
          const location = part.storage_location_id ? locationById.get(part.storage_location_id) : null
          const partApplications = applications.filter((application) => application.part_id === part.id)
          const partFits = fits.filter((fit) => fit.part_id === part.id)
          const confirmedFits = partFits.filter((fit) => fit.result === 'confirmed').length
          return (
            <article className="part-card" key={part.id}>
              <div className="part-card-top">
                <div><span>{titleCase(part.part_type)}</span><h3>{part.description}</h3><p>{[part.manufacturer, part.reference].filter(Boolean).join(' · ') || 'No maker/reference recorded'}</p></div>
                <strong>×{Number(part.quantity)}</strong>
              </div>
              <div className="part-meta-grid">
                <div><span>Condition</span><strong>{titleCase(part.condition)}</strong></div>
                <div><span>Source</span><strong>{donor ? `Donor #${donor.item_number}` : titleCase(part.provenance_type)}</strong></div>
                <div><span>Location</span><strong>{location ? (location.code || location.name) : 'Unassigned'}</strong></div>
                <div><span>Cost / replace</span><strong>{money(part.unit_cost, part.currency)} / {money(part.replacement_cost, part.currency)}</strong></div>
              </div>
              <div className="part-evidence-row">
                <span>{partApplications.length} application{partApplications.length === 1 ? '' : 's'}</span>
                <span>{confirmedFits} confirmed fit{confirmedFits === 1 ? '' : 's'}</span>
                {part.knowledge_part_ref_id && <span>Knowledge linked</span>}
              </div>
              {(part.provenance_note || part.notes) && <p className="part-notes">{part.provenance_note || part.notes}</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}
