import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import ItemMedia from './ItemMedia'
import PassportPanel from './PassportPanel'
import WorkJobCard from './WorkJobCard'

type Item = { id: string; item_number: number; type: string; purpose: string; status: string; title: string; notes: string; acquired_at: string | null; created_at: string }
type Identity = { maker: string; model: string; reference: string; serial: string; era: string; country: string; materials: string; dimensions_text: string; dial_markings: string; case_markings: string; movement_markings: string; notes: string }
type Work = { id: string; work_number: number; title: string; type: string; status: string; next_action: string; diagnosis: string; opened_at: string; completed_at: string | null }
type Valuation = { low_value: number | null; expected_value: number | null; high_value: number | null; target_value: number | null; minimum_value: number | null; currency: string; confidence: string; basis: string }
type Cost = { category: string; amount: number; currency: string; notes: string; incurred_at: string }
type Tab = 'overview' | 'details' | 'work' | 'research' | 'sale' | 'history'

const tabs: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'details', label: 'Details' },
  { key: 'work', label: 'Work' },
  { key: 'research', label: 'Research' },
  { key: 'sale', label: 'Sale' },
  { key: 'history', label: 'History' },
]
const statuses = ['acquired', 'researching', 'preparing', 'ready_for_sale', 'listed', 'sold', 'archived']
const purposes = ['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other']

function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}
function routeItemId() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return parts[0] === 'items' && parts[1] ? decodeURIComponent(parts[1]) : ''
}

export default function ItemWorkspaceRoute() {
  const [itemId, setItemId] = useState(routeItemId)
  const [workspaceId, setWorkspaceId] = useState('')
  const [item, setItem] = useState<Item | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [work, setWork] = useState<Work[]>([])
  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [costs, setCosts] = useState<Cost[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const sync = () => { setItemId(routeItemId()); setTab('overview') }
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('item-workspace-v2-active', Boolean(itemId))
    return () => document.body.classList.remove('item-workspace-v2-active')
  }, [itemId])

  useEffect(() => {
    if (!itemId) return
    let active = true
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active) return
      if (result.error || !result.data) { setMessage(result.error?.message ?? 'Workspace unavailable.'); return }
      setWorkspaceId(result.data.id)
    })()
    return () => { active = false }
  }, [itemId])

  async function load() {
    if (!itemId || !workspaceId) return
    setLoading(true)
    const [itemResult, identityResult, workResult, valuationResult, costsResult] = await Promise.all([
      supabase.from('items').select('id,item_number,type,purpose,status,title,notes,acquired_at,created_at').eq('workspace_id', workspaceId).eq('id', itemId).maybeSingle(),
      supabase.from('item_identity').select('maker,model,reference,serial,era,country,materials,dimensions_text,dial_markings,case_markings,movement_markings,notes').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('work_records').select('id,work_number,title,type,status,next_action,diagnosis,opened_at,completed_at').eq('workspace_id', workspaceId).eq('item_id', itemId).order('work_number', { ascending: false }),
      supabase.from('valuations').select('low_value,expected_value,high_value,target_value,minimum_value,currency,confidence,basis').eq('workspace_id', workspaceId).eq('item_id', itemId).order('valued_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cost_entries').select('category,amount,currency,notes,incurred_at').eq('workspace_id', workspaceId).eq('item_id', itemId).order('incurred_at', { ascending: false }),
    ])
    setLoading(false)
    const error = itemResult.error ?? identityResult.error ?? workResult.error ?? valuationResult.error ?? costsResult.error
    if (error) { setMessage(error.message); return }
    setItem(itemResult.data as Item | null)
    setIdentity(identityResult.data as Identity | null)
    setWork((workResult.data ?? []) as Work[])
    setValuation(valuationResult.data as Valuation | null)
    setCosts((costsResult.data ?? []) as Cost[])
    setMessage('')
  }

  useEffect(() => { if (workspaceId && itemId) void load() }, [workspaceId, itemId])

  const activeWork = useMemo(() => work.find((record) => !['complete', 'cancelled'].includes(record.status)) ?? null, [work])
  const totalCost = useMemo(() => costs.reduce((sum, cost) => sum + Number(cost.amount || 0), 0), [costs])
  const currency = valuation?.currency || costs[0]?.currency || 'AUD'
  const target = valuation?.target_value ?? null
  const potential = target == null ? null : target - totalCost

  if (!itemId) return null
  if (loading && !item) return <main className="item-v2-page"><div className="loading-card">Loading Item…</div></main>
  if (!item) return <main className="item-v2-page"><div className="section-card"><h2>Item unavailable</h2><p>{message || 'This Item could not be loaded.'}</p><button onClick={() => { window.location.hash = '#/items' }}>Back to Inventory</button></div></main>

  return (
    <main className="item-v2-page">
      <header className="item-v2-header">
        <button className="item-v2-back" type="button" onClick={() => { window.location.hash = '#/items' }}>← Inventory</button>
        <div className="item-v2-title-row">
          <div>
            <div className="item-v2-kicker"><span>Item #{item.item_number}</span><span className={`status-pill status-${item.status}`}>{titleCase(item.status)}</span></div>
            <h1>{item.title}</h1>
            <p>{[identity?.maker || titleCase(item.type), identity?.model, identity?.era].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="item-v2-actions">
            <button type="button" className="secondary" onClick={() => setEditing(true)}>Edit details</button>
            <button type="button" onClick={() => setTab('work')}>{activeWork ? 'Open Work' : 'Start Work'}</button>
          </div>
        </div>
      </header>

      <nav className="item-v2-tabs" aria-label="Item sections">
        {tabs.map((entry) => <button key={entry.key} type="button" className={tab === entry.key ? 'active' : ''} onClick={() => setTab(entry.key)}>{entry.label}</button>)}
      </nav>

      {message && <p className="item-v2-message">{message}</p>}

      {tab === 'overview' && (
        <div className="item-v2-overview">
          <section className="item-v2-hero-card">
            <div><p className="eyebrow">CURRENT POSITION</p><h2>{activeWork ? titleCase(activeWork.status) : titleCase(item.status)}</h2><p>{activeWork?.next_action || (item.status === 'ready_for_sale' ? 'Ready for sale.' : 'No active workshop action.')}</p></div>
            <button type="button" className="secondary" onClick={() => setTab(activeWork ? 'work' : 'details')}>{activeWork ? 'Open Job Card' : 'Review details'}</button>
          </section>

          <div className="item-v2-summary-grid">
            <section className="section-card"><p className="eyebrow">IDENTITY</p><h3>{identity?.maker || 'Maker unresolved'}</h3><dl className="item-v2-facts"><div><dt>Model</dt><dd>{identity?.model || '—'}</dd></div><div><dt>Reference</dt><dd>{identity?.reference || '—'}</dd></div><div><dt>Serial</dt><dd>{identity?.serial || '—'}</dd></div><div><dt>Era</dt><dd>{identity?.era || '—'}</dd></div></dl><button type="button" className="text-button" onClick={() => setTab('details')}>Open details →</button></section>
            <section className="section-card"><p className="eyebrow">WORK</p><h3>{activeWork ? `Work #${activeWork.work_number}` : 'No active Work'}</h3><p>{activeWork?.title || 'Start a Work record only when this Item enters the workshop.'}</p>{activeWork && <dl className="item-v2-facts"><div><dt>Status</dt><dd>{titleCase(activeWork.status)}</dd></div><div><dt>Next</dt><dd>{activeWork.next_action || '—'}</dd></div></dl>}<button type="button" className="text-button" onClick={() => setTab('work')}>{activeWork ? 'Open Job Card →' : 'Start Work →'}</button></section>
            <section className="section-card"><p className="eyebrow">SALE POSITION</p><h3>{money(target, currency)} target</h3><dl className="item-v2-facts"><div><dt>Recorded cost</dt><dd>{money(totalCost, currency)}</dd></div><div><dt>Potential gross</dt><dd>{money(potential, currency)}</dd></div><div><dt>Purpose</dt><dd>{titleCase(item.purpose)}</dd></div></dl><button type="button" className="text-button" onClick={() => setTab('sale')}>Open sale record →</button></section>
            <section className="section-card"><p className="eyebrow">RESEARCH</p><h3>{identity?.movement_markings ? 'Evidence recorded' : 'Research available'}</h3><p>{identity?.movement_markings || identity?.notes || 'Capture markings, movement identity and supporting evidence here.'}</p><button type="button" className="text-button" onClick={() => setTab('research')}>Open research →</button></section>
          </div>
          <ItemMedia workspaceId={workspaceId} itemId={item.id} />
        </div>
      )}

      {tab === 'details' && (
        <div className="item-v2-stack">
          <section className="section-card">
            <div className="item-v2-section-heading"><div><p className="eyebrow">OBJECT</p><h2>Identity & observations</h2></div><button type="button" className="secondary small" onClick={() => setEditing(true)}>Edit</button></div>
            <dl className="item-v2-detail-grid">
              <div><dt>Maker</dt><dd>{identity?.maker || '—'}</dd></div><div><dt>Model</dt><dd>{identity?.model || '—'}</dd></div><div><dt>Reference</dt><dd>{identity?.reference || '—'}</dd></div><div><dt>Serial</dt><dd>{identity?.serial || '—'}</dd></div><div><dt>Era</dt><dd>{identity?.era || '—'}</dd></div><div><dt>Country</dt><dd>{identity?.country || '—'}</dd></div><div><dt>Materials</dt><dd>{identity?.materials || '—'}</dd></div><div><dt>Dimensions</dt><dd>{identity?.dimensions_text || '—'}</dd></div>
            </dl>
            <div className="item-v2-observations"><div><strong>Dial</strong><p>{identity?.dial_markings || 'No dial markings recorded.'}</p></div><div><strong>Case</strong><p>{identity?.case_markings || 'No case markings recorded.'}</p></div><div><strong>Movement</strong><p>{identity?.movement_markings || 'No movement markings recorded.'}</p></div></div>
          </section>
          <PassportPanel workspaceId={workspaceId} itemId={item.id} />
          <ItemMedia workspaceId={workspaceId} itemId={item.id} />
        </div>
      )}

      {tab === 'work' && <WorkJobCard workspaceId={workspaceId} itemId={item.id} />}

      {tab === 'research' && (
        <div className="item-v2-stack">
          <section className="section-card"><p className="eyebrow">ITEM RESEARCH</p><h2>Evidence attached to this Item</h2><div className="item-v2-observations"><div><strong>Movement markings</strong><p>{identity?.movement_markings || 'Nothing recorded yet.'}</p></div><div><strong>Identity notes</strong><p>{identity?.notes || 'No identity / research notes yet.'}</p></div><div><strong>Item notes</strong><p>{item.notes || 'No Item notes yet.'}</p></div></div></section>
          <section className="section-card item-v2-callout"><div><p className="eyebrow">CALIBRE LIBRARY</p><h3>Reusable movement and compatibility knowledge lives in Library.</h3><p className="muted">Item-specific conclusions stay here; reusable technical knowledge stays in the Library.</p></div><button type="button" onClick={() => { window.location.hash = '#/calibre' }}>Open Library</button></section>
        </div>
      )}

      {tab === 'sale' && (
        <div className="item-v2-stack">
          <div className="item-v2-metrics"><div><span>Recorded cost</span><strong>{money(totalCost, currency)}</strong></div><div><span>Target</span><strong>{money(target, currency)}</strong></div><div><span>Minimum</span><strong>{money(valuation?.minimum_value, currency)}</strong></div><div><span>Potential gross</span><strong>{money(potential, currency)}</strong></div></div>
          <section className="section-card"><p className="eyebrow">VALUATION</p><h2>Current sales position</h2><dl className="item-v2-detail-grid"><div><dt>Market low</dt><dd>{money(valuation?.low_value, currency)}</dd></div><div><dt>Expected</dt><dd>{money(valuation?.expected_value, currency)}</dd></div><div><dt>Market high</dt><dd>{money(valuation?.high_value, currency)}</dd></div><div><dt>Confidence</dt><dd>{titleCase(valuation?.confidence || 'unknown')}</dd></div></dl>{valuation?.basis && <p>{valuation.basis}</p>}</section>
          <section className="section-card"><p className="eyebrow">COSTS</p><h2>{costs.length ? `${costs.length} recorded cost entr${costs.length === 1 ? 'y' : 'ies'}` : 'No costs recorded yet'}</h2>{costs.length > 0 && <div className="item-v2-cost-list">{costs.map((cost, index) => <div key={`${cost.incurred_at}-${index}`}><strong>{titleCase(cost.category)}</strong><span>{cost.notes || '—'}</span><b>{money(cost.amount, cost.currency)}</b></div>)}</div>}</section>
        </div>
      )}

      {tab === 'history' && (
        <div className="item-v2-stack">
          <section className="section-card"><p className="eyebrow">PERMANENT HISTORY</p><h2>Item timeline</h2><div className="item-v2-timeline"><div><time>{new Date(item.created_at).toLocaleDateString('en-AU')}</time><strong>Item created</strong><span>Item #{item.item_number} entered Calibre.</span></div>{item.acquired_at && <div><time>{new Date(item.acquired_at).toLocaleDateString('en-AU')}</time><strong>Acquired</strong><span>Acquisition date recorded.</span></div>}{work.map((record) => <div key={record.id}><time>{new Date(record.opened_at).toLocaleDateString('en-AU')}</time><strong>Work #{record.work_number} · {record.title}</strong><span>{titleCase(record.status)}{record.completed_at ? ` · completed ${new Date(record.completed_at).toLocaleDateString('en-AU')}` : ''}</span></div>)}</div></section>
        </div>
      )}

      {editing && <EditItemDialog item={item} identity={identity} workspaceId={workspaceId} saving={saving} setSaving={setSaving} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await load() }} setMessage={setMessage} />}
    </main>
  )
}

function EditItemDialog({ item, identity, workspaceId, saving, setSaving, onClose, onSaved, setMessage }: { item: Item; identity: Identity | null; workspaceId: string; saving: boolean; setSaving: (value: boolean) => void; onClose: () => void; onSaved: () => Promise<void>; setMessage: (value: string) => void }) {
  const [title, setTitle] = useState(item.title)
  const [status, setStatus] = useState(item.status)
  const [purpose, setPurpose] = useState(item.purpose)
  const [notes, setNotes] = useState(item.notes || '')
  const [maker, setMaker] = useState(identity?.maker || '')
  const [model, setModel] = useState(identity?.model || '')
  const [reference, setReference] = useState(identity?.reference || '')
  const [serial, setSerial] = useState(identity?.serial || '')
  const [era, setEra] = useState(identity?.era || '')
  const [country, setCountry] = useState(identity?.country || '')
  const [materials, setMaterials] = useState(identity?.materials || '')
  const [dimensions, setDimensions] = useState(identity?.dimensions_text || '')
  const [dial, setDial] = useState(identity?.dial_markings || '')
  const [caseMarkings, setCaseMarkings] = useState(identity?.case_markings || '')
  const [movementMarkings, setMovementMarkings] = useState(identity?.movement_markings || '')
  const [identityNotes, setIdentityNotes] = useState(identity?.notes || '')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    const itemResult = await supabase.from('items').update({ title: title.trim(), status, purpose, notes: notes.trim(), updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('id', item.id)
    if (itemResult.error) { setSaving(false); setMessage(itemResult.error.message); return }
    const identityPayload = { workspace_id: workspaceId, item_id: item.id, maker: maker.trim(), model: model.trim(), reference: reference.trim(), serial: serial.trim(), era: era.trim(), country: country.trim(), materials: materials.trim(), dimensions_text: dimensions.trim(), dial_markings: dial.trim(), case_markings: caseMarkings.trim(), movement_markings: movementMarkings.trim(), notes: identityNotes.trim(), updated_at: new Date().toISOString() }
    const identityResult = identity
      ? await supabase.from('item_identity').update(identityPayload).eq('workspace_id', workspaceId).eq('item_id', item.id)
      : await supabase.from('item_identity').insert(identityPayload)
    setSaving(false)
    if (identityResult.error) { setMessage(`Item saved, but identity failed: ${identityResult.error.message}`); return }
    await onSaved()
  }

  return <div className="item-v2-edit-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><form className="item-v2-edit" onSubmit={save}><div className="item-v2-section-heading"><div><p className="eyebrow">EDIT ITEM</p><h2>Item #{item.item_number}</h2></div><button type="button" className="secondary small" onClick={onClose} disabled={saving}>Close</button></div><div className="item-v2-edit-grid"><label className="span-2">Title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label><label>Purpose<select value={purpose} onChange={(event) => setPurpose(event.target.value)}>{purposes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label><label>Maker<input value={maker} onChange={(e) => setMaker(e.target.value)} /></label><label>Model<input value={model} onChange={(e) => setModel(e.target.value)} /></label><label>Reference<input value={reference} onChange={(e) => setReference(e.target.value)} /></label><label>Serial<input value={serial} onChange={(e) => setSerial(e.target.value)} /></label><label>Era<input value={era} onChange={(e) => setEra(e.target.value)} /></label><label>Country<input value={country} onChange={(e) => setCountry(e.target.value)} /></label><label>Materials<input value={materials} onChange={(e) => setMaterials(e.target.value)} /></label><label>Dimensions<input value={dimensions} onChange={(e) => setDimensions(e.target.value)} /></label><label className="span-2">Item notes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label><label className="span-2">Dial markings<textarea rows={2} value={dial} onChange={(e) => setDial(e.target.value)} /></label><label className="span-2">Case markings<textarea rows={2} value={caseMarkings} onChange={(e) => setCaseMarkings(e.target.value)} /></label><label className="span-2">Movement markings<textarea rows={2} value={movementMarkings} onChange={(e) => setMovementMarkings(e.target.value)} /></label><label className="span-2">Identity / research notes<textarea rows={3} value={identityNotes} onChange={(e) => setIdentityNotes(e.target.value)} /></label></div><div className="item-v2-edit-actions"><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save Item'}</button></div></form></div>
}
