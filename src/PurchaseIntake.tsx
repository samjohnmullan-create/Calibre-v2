import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type Purchase = {
  id: string
  vendor_name: string
  channel: string
  external_order_id: string
  description: string
  category: string
  amount: number | null
  currency: string
  amount_aud: number | null
  status: string
  ordered_at: string | null
  tracking_number: string
  eta: string | null
  received_at: string | null
  discrepancy_note: string
  notes: string
  created_at: string
}

type PurchaseLot = {
  id: string
  purchase_id: string
  lot_number: string
  title: string
  description: string
  category: string
  quantity_expected: number
  quantity_received: number
  amount: number | null
  currency: string
  amount_aud: number | null
  shared_cost_override_aud: number | null
  notes: string
}

type PurchaseLink = {
  id: string
  purchase_lot_id: string
  item_id: string
  allocated_purchase_cost_aud: number | null
  allocated_shared_cost_aud: number | null
  items: { item_number: number; title: string } | null
}

type StockLink = {
  id: string
  purchase_lot_id: string
  resource_type: 'part' | 'tool' | 'consumable'
  part_id: string | null
  tool_id: string | null
  consumable_id: string | null
  quantity_received: number
  allocated_purchase_cost_aud: number | null
  allocated_shared_cost_aud: number | null
}

type StorageLocation = {
  id: string
  name: string
  code: string | null
  location_type: string
}

const statusLabels: Record<string, string> = {
  suggested: 'Suggested', ordered: 'Ordered', shipped: 'In transit', delivered: 'Delivered', received: 'Received',
  discrepancy: 'Discrepancy', cancelled: 'Cancelled', returned: 'Returned',
}

const itemTypes = ['watch', 'clock', 'jewellery', 'accessory', 'other']
const purposes = ['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other']
const lotCategories = ['item', 'part', 'tool', 'consumable', 'other']

function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function today() { return new Date().toISOString().slice(0, 10) }

function locationLabel(location: StorageLocation) {
  return `${location.code ? `${location.code} · ` : ''}${location.name}`
}

export default function PurchaseIntake({ workspaceId }: { workspaceId: string }) {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lots, setLots] = useState<PurchaseLot[]>([])
  const [links, setLinks] = useState<PurchaseLink[]>([])
  const [stockLinks, setStockLinks] = useState<StockLink[]>([])
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showNew, setShowNew] = useState(false)

  const selected = purchases.find((purchase) => purchase.id === selectedId) ?? null
  const selectedLinks = useMemo(() => links.filter((link) => lots.some((lot) => lot.id === link.purchase_lot_id)), [links, lots])

  async function loadPurchases(selectId?: string) {
    setLoading(true)
    const { data, error } = await supabase
      .from('purchases')
      .select('id,vendor_name,channel,external_order_id,description,category,amount,currency,amount_aud,status,ordered_at,tracking_number,eta,received_at,discrepancy_note,notes,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100)
    setLoading(false)
    if (error) { setMessage(`Purchases failed to load: ${error.message}`); return }
    const rows = (data ?? []) as Purchase[]
    setPurchases(rows)
    const target = selectId || (rows.some((row) => row.id === selectedId) ? selectedId : rows[0]?.id || '')
    setSelectedId(target)
  }

  async function loadStorageLocations() {
    const { data, error } = await supabase
      .from('storage_locations')
      .select('id,name,code,location_type')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(250)
    if (error) { setMessage(`Storage locations failed to load: ${error.message}`); return }
    setStorageLocations((data ?? []) as StorageLocation[])
  }

  async function loadPurchaseDetail(purchaseId: string) {
    if (!purchaseId) { setLots([]); setLinks([]); setStockLinks([]); return }
    const [lotResult, linkResult, stockResult] = await Promise.all([
      supabase.from('purchase_lots')
        .select('id,purchase_id,lot_number,title,description,category,quantity_expected,quantity_received,amount,currency,amount_aud,shared_cost_override_aud,notes')
        .eq('workspace_id', workspaceId).eq('purchase_id', purchaseId).order('created_at', { ascending: true }),
      supabase.from('purchase_item_links')
        .select('id,purchase_lot_id,item_id,allocated_purchase_cost_aud,allocated_shared_cost_aud,items(item_number,title)')
        .eq('workspace_id', workspaceId).eq('purchase_id', purchaseId).order('created_at', { ascending: true }),
      supabase.from('purchase_stock_links')
        .select('id,purchase_lot_id,resource_type,part_id,tool_id,consumable_id,quantity_received,allocated_purchase_cost_aud,allocated_shared_cost_aud')
        .eq('workspace_id', workspaceId).eq('purchase_id', purchaseId).order('created_at', { ascending: true }),
    ])
    if (lotResult.error) { setMessage(`Purchase lots failed to load: ${lotResult.error.message}`); return }
    if (linkResult.error) { setMessage(`Purchase links failed to load: ${linkResult.error.message}`); return }
    if (stockResult.error) { setMessage(`Workshop stock links failed to load: ${stockResult.error.message}`); return }
    setLots((lotResult.data ?? []) as PurchaseLot[])
    setLinks((linkResult.data ?? []) as unknown as PurchaseLink[])
    setStockLinks((stockResult.data ?? []) as StockLink[])
  }

  useEffect(() => {
    if (!workspaceId) return
    void loadPurchases()
    void loadStorageLocations()
  }, [workspaceId])
  useEffect(() => { if (selectedId) void loadPurchaseDetail(selectedId) }, [selectedId])

  async function createPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const description = String(form.get('description') || '').trim()
    if (!description) { setMessage('Give the purchase a short description.'); return }
    const rawAmount = String(form.get('amount') || '').trim()
    const rawAud = String(form.get('amount_aud') || '').trim()
    setSaving(true)
    const { data, error } = await supabase.from('purchases').insert({
      workspace_id: workspaceId,
      vendor_name: String(form.get('vendor_name') || '').trim(),
      channel: String(form.get('channel') || '').trim(),
      external_order_id: String(form.get('external_order_id') || '').trim(),
      description,
      category: 'item',
      amount: rawAmount ? Number(rawAmount) : null,
      currency: String(form.get('currency') || 'AUD').trim().toUpperCase() || 'AUD',
      amount_aud: rawAud ? Number(rawAud) : null,
      status: String(form.get('status') || 'ordered'),
      ordered_at: String(form.get('ordered_at') || '') || null,
      tracking_number: String(form.get('tracking_number') || '').trim(),
      eta: String(form.get('eta') || '') || null,
      notes: String(form.get('notes') || '').trim(),
    }).select('id').single()
    setSaving(false)
    if (error) { setMessage(`Purchase could not be created: ${error.message}`); return }
    event.currentTarget.reset()
    setShowNew(false)
    setMessage('Purchase created. Add one or more lots/bundle components, then receive them into physical stock.')
    await loadPurchases(data.id)
  }

  async function addLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '').trim()
    if (!title) { setMessage('Lot title is required.'); return }
    const rawAmount = String(form.get('amount') || '').trim()
    const rawAud = String(form.get('amount_aud') || '').trim()
    const rawShared = String(form.get('shared_cost_override_aud') || '').trim()
    setSaving(true)
    const { error } = await supabase.from('purchase_lots').insert({
      workspace_id: workspaceId,
      purchase_id: selected.id,
      lot_number: String(form.get('lot_number') || '').trim(),
      title,
      description: String(form.get('description') || '').trim(),
      category: String(form.get('category') || 'item'),
      quantity_expected: Math.max(1, Number(form.get('quantity_expected')) || 1),
      amount: rawAmount ? Number(rawAmount) : null,
      currency: String(form.get('currency') || selected.currency || 'AUD').trim().toUpperCase() || 'AUD',
      amount_aud: rawAud ? Number(rawAud) : null,
      shared_cost_override_aud: rawShared ? Number(rawShared) : null,
      notes: String(form.get('notes') || '').trim(),
    })
    setSaving(false)
    if (error) { setMessage(`Lot could not be added: ${error.message}`); return }
    event.currentTarget.reset()
    setMessage('Lot added. A bundle can be split by adding more lots under the same purchase.')
    await loadPurchaseDetail(selected.id)
  }

  async function updateStatus(status: string, discrepancyNote = '') {
    if (!selected) return
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (status === 'received' || status === 'discrepancy') patch.received_at = new Date().toISOString()
    if (status === 'discrepancy') patch.discrepancy_note = discrepancyNote.trim()
    const { error } = await supabase.from('purchases').update(patch).eq('workspace_id', workspaceId).eq('id', selected.id)
    if (error) { setMessage(`Purchase status could not be updated: ${error.message}`); return }
    setMessage(status === 'discrepancy' ? 'Purchase marked with a receiving discrepancy.' : `Purchase moved to ${statusLabels[status] || status}.`)
    await loadPurchases(selected.id)
  }

  async function createPhysicalItem(lot: PurchaseLot, form: HTMLFormElement) {
    const data = new FormData(form)
    const title = String(data.get('item_title') || lot.title).trim()
    const type = String(data.get('item_type') || 'watch')
    const purpose = String(data.get('item_purpose') || 'resale')
    setSaving(true)
    const { data: created, error } = await supabase.rpc('materialize_purchase_lot_item', {
      p_workspace_id: workspaceId,
      p_purchase_lot_id: lot.id,
      p_title: title,
      p_type: type,
      p_purpose: purpose,
      p_notes: String(data.get('item_notes') || '').trim(),
    })
    setSaving(false)
    if (error) { setMessage(`Physical Item could not be created: ${error.message}`); return }
    const item = Array.isArray(created) ? created[0] : created
    setMessage(`Physical Item created from ${lot.lot_number ? `lot ${lot.lot_number}` : lot.title}. Purchase cost allocation followed it into Item economics.`)
    await loadPurchaseDetail(lot.purchase_id)
    await loadPurchases(lot.purchase_id)
    if (item?.id) window.location.hash = `#/items/${encodeURIComponent(item.id)}`
  }

  async function receiveWorkshopStock(lot: PurchaseLot, form: HTMLFormElement) {
    const data = new FormData(form)
    const quantity = Number(data.get('stock_quantity')) || 0
    if (quantity <= 0) { setMessage('Received quantity must be greater than zero.'); return }
    setSaving(true)
    const { data: result, error } = await supabase.rpc('materialize_purchase_lot_stock', {
      p_workspace_id: workspaceId,
      p_purchase_lot_id: lot.id,
      p_quantity: quantity,
      p_name: String(data.get('stock_name') || lot.title).trim(),
      p_storage_location_id: String(data.get('storage_location_id') || '') || null,
      p_category: String(data.get('stock_category') || '').trim(),
      p_manufacturer: String(data.get('manufacturer') || '').trim(),
      p_reference: String(data.get('reference') || '').trim(),
      p_condition: String(data.get('condition') || '').trim(),
      p_unit: String(data.get('unit') || '').trim(),
      p_notes: String(data.get('stock_notes') || '').trim(),
    })
    setSaving(false)
    if (error) { setMessage(`${lot.category} could not be received: ${error.message}`); return }
    const received = result as { resource_type?: string; total_allocated_aud?: number } | null
    const costText = received?.total_allocated_aud ? ` · ${money(received.total_allocated_aud)} allocated` : ''
    setMessage(`${lot.category[0].toUpperCase()}${lot.category.slice(1)} received into workshop inventory${costText}.`)
    form.reset()
    await loadPurchaseDetail(lot.purchase_id)
    await loadPurchases(lot.purchase_id)
  }

  return (
    <section className="purchase-intake">
      <div className="purchase-intake-toolbar">
        <div>
          <p className="eyebrow">PURCHASES</p>
          <h2>Purchase & receiving</h2>
          <p className="muted">One purchase can contain many lots. Receive watches, parts, tools and consumables without breaking the cost trail.</p>
        </div>
        <button type="button" className="primary" onClick={() => setShowNew((value) => !value)}>{showNew ? 'Close' : 'New purchase'}</button>
      </div>

      {message && <p className="intake-message">{message}</p>}

      {showNew && (
        <form className="purchase-form panel" onSubmit={createPurchase}>
          <div className="purchase-form-grid">
            <label>Vendor / auction house<input name="vendor_name" placeholder="e.g. Hannam's Auctions" /></label>
            <label>Channel<input name="channel" placeholder="Auction, eBay, private sale…" /></label>
            <label>Order / invoice ref<input name="external_order_id" /></label>
            <label>Ordered date<input name="ordered_at" type="date" defaultValue={today()} /></label>
            <label>Purchase description<input name="description" required placeholder="Watch bundle, single watch, parts lot…" /></label>
            <label>Status<select name="status" defaultValue="ordered"><option value="ordered">Ordered</option><option value="shipped">In transit</option><option value="delivered">Delivered</option><option value="received">Received</option></select></label>
            <label>Amount<input name="amount" type="number" step="0.01" min="0" /></label>
            <label>Currency<input name="currency" defaultValue="AUD" maxLength={3} /></label>
            <label>AUD equivalent<input name="amount_aud" type="number" step="0.01" min="0" /></label>
            <label>Tracking<input name="tracking_number" /></label>
            <label>ETA<input name="eta" type="date" /></label>
          </div>
          <label>Notes<textarea name="notes" rows={2} /></label>
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Create purchase'}</button>
        </form>
      )}

      <div className="purchase-layout">
        <aside className="purchase-list panel">
          <div className="purchase-list-heading"><strong>Purchases</strong><span>{loading ? 'Loading…' : purchases.length}</span></div>
          {purchases.length === 0 && !loading && <p className="muted">No purchases yet.</p>}
          {purchases.map((purchase) => (
            <button key={purchase.id} type="button" className={purchase.id === selectedId ? 'purchase-row active' : 'purchase-row'} onClick={() => setSelectedId(purchase.id)}>
              <span><strong>{purchase.vendor_name || purchase.description}</strong><small>{purchase.external_order_id || purchase.description}</small></span>
              <span><small>{statusLabels[purchase.status] || purchase.status}</small><strong>{money(purchase.amount_aud ?? purchase.amount, purchase.amount_aud != null ? 'AUD' : purchase.currency)}</strong></span>
            </button>
          ))}
        </aside>

        <div className="purchase-detail">
          {!selected && <div className="panel"><p className="muted">Select a purchase or create one.</p></div>}
          {selected && (
            <>
              <section className="panel purchase-summary">
                <div className="purchase-summary-head">
                  <div><p className="eyebrow">{statusLabels[selected.status] || selected.status}</p><h3>{selected.vendor_name || selected.description}</h3><p className="muted">{selected.external_order_id || 'No order/reference'} · {selected.channel || 'Channel not recorded'}</p></div>
                  <strong>{money(selected.amount_aud ?? selected.amount, selected.amount_aud != null ? 'AUD' : selected.currency)}</strong>
                </div>
                <div className="purchase-status-actions">
                  <button type="button" onClick={() => void updateStatus('ordered')}>Ordered</button>
                  <button type="button" onClick={() => void updateStatus('shipped')}>In transit</button>
                  <button type="button" onClick={() => void updateStatus('delivered')}>Delivered</button>
                  <button type="button" onClick={() => void updateStatus('received')}>Received</button>
                  <button type="button" onClick={() => { const note = window.prompt('What was wrong with the delivery?', selected.discrepancy_note || '') ?? ''; if (note.trim()) void updateStatus('discrepancy', note) }}>Discrepancy</button>
                </div>
                {selected.tracking_number && <p><strong>Tracking:</strong> {selected.tracking_number}</p>}
                {selected.discrepancy_note && <p className="purchase-discrepancy"><strong>Discrepancy:</strong> {selected.discrepancy_note}</p>}
              </section>

              <section className="panel">
                <div className="purchase-section-head"><div><h3>Lots / bundle split</h3><p className="muted">Use one lot for a single item, or split a bundle into as many components as needed.</p></div></div>
                <form className="purchase-form compact" onSubmit={addLot}>
                  <div className="purchase-form-grid">
                    <label>Lot no.<input name="lot_number" /></label>
                    <label>Title<input name="title" required /></label>
                    <label>Category<select name="category" defaultValue="item">{lotCategories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label>Expected qty<input name="quantity_expected" type="number" min="1" defaultValue="1" /></label>
                    <label>Lot amount<input name="amount" type="number" min="0" step="0.01" /></label>
                    <label>Currency<input name="currency" defaultValue={selected.currency || 'AUD'} maxLength={3} /></label>
                    <label>AUD lot value<input name="amount_aud" type="number" min="0" step="0.01" /></label>
                    <label>Shared cost override AUD<input name="shared_cost_override_aud" type="number" min="0" step="0.01" /></label>
                  </div>
                  <label>Description<textarea name="description" rows={2} /></label>
                  <label>Notes<textarea name="notes" rows={2} /></label>
                  <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add lot'}</button>
                </form>
              </section>

              <section className="purchase-lots">
                {lots.length === 0 && <div className="panel"><p className="muted">No lots yet. Add the single item or split this purchase into bundle components.</p></div>}
                {lots.map((lot) => {
                  const lotLinks = selectedLinks.filter((link) => link.purchase_lot_id === lot.id)
                  const lotStockLinks = stockLinks.filter((link) => link.purchase_lot_id === lot.id)
                  const linkedQuantity = lot.category === 'item'
                    ? lotLinks.length
                    : lotStockLinks.reduce((sum, link) => sum + Number(link.quantity_received || 0), 0)
                  const remaining = Math.max(0, lot.quantity_expected - linkedQuantity)
                  return (
                    <article key={lot.id} className="panel purchase-lot-card">
                      <div className="purchase-lot-head">
                        <div><p className="eyebrow">{lot.lot_number ? `LOT ${lot.lot_number}` : lot.category.toUpperCase()}</p><h3>{lot.title}</h3><p className="muted">Expected {lot.quantity_expected} · received {linkedQuantity} · remaining {remaining}</p></div>
                        <div><strong>{money(lot.amount_aud ?? lot.amount, lot.amount_aud != null ? 'AUD' : lot.currency)}</strong>{lot.shared_cost_override_aud != null && <small>+ {money(lot.shared_cost_override_aud)} shared</small>}</div>
                      </div>
                      {lot.description && <p>{lot.description}</p>}
                      {lotLinks.length > 0 && <div className="purchase-linked-items">{lotLinks.map((link) => <button key={link.id} type="button" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(link.item_id)}` }}>#{link.items?.item_number ?? '—'} {link.items?.title ?? 'Open Item'}</button>)}</div>}
                      {lotStockLinks.length > 0 && <div className="purchase-linked-items">{lotStockLinks.map((link) => <span key={link.id} className="purchase-stock-chip">{link.resource_type} · qty {link.quantity_received}{link.allocated_purchase_cost_aud != null ? ` · ${money((link.allocated_purchase_cost_aud || 0) + (link.allocated_shared_cost_aud || 0))}` : ''}</span>)}</div>}

                      {lot.category === 'item' && remaining > 0 && (
                        <form className="purchase-materialize" onSubmit={(event) => { event.preventDefault(); void createPhysicalItem(lot, event.currentTarget) }}>
                          <label>Item title<input name="item_title" defaultValue={lot.title} /></label>
                          <label>Type<select name="item_type" defaultValue="watch">{itemTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                          <label>Purpose<select name="item_purpose" defaultValue="resale">{purposes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                          <label>Receiving note<input name="item_notes" placeholder="Condition on arrival, quick observation…" /></label>
                          <button type="submit" className="primary" disabled={saving}>Create physical Item ({remaining} remaining)</button>
                        </form>
                      )}

                      {['part', 'tool', 'consumable'].includes(lot.category) && remaining > 0 && (
                        <form className="purchase-stock-receive" onSubmit={(event) => { event.preventDefault(); void receiveWorkshopStock(lot, event.currentTarget) }}>
                          <div className="purchase-stock-grid">
                            <label>Name<input name="stock_name" defaultValue={lot.title} /></label>
                            <label>Receive qty<input name="stock_quantity" type="number" min="0.01" step="0.01" defaultValue={remaining} /></label>
                            <label>Storage<select name="storage_location_id" defaultValue=""><option value="">Unassigned</option>{storageLocations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
                            <label>{lot.category === 'part' ? 'Part type' : 'Category'}<input name="stock_category" placeholder={lot.category === 'part' ? 'e.g. balance staff' : 'e.g. hand tools'} /></label>
                            <label>Manufacturer<input name="manufacturer" /></label>
                            <label>{lot.category === 'tool' ? 'Model' : 'Reference'}<input name="reference" /></label>
                            {lot.category === 'part' && <label>Condition<input name="condition" placeholder="new, used, NOS…" /></label>}
                            {lot.category === 'consumable' && <label>Unit<input name="unit" placeholder="mL, pieces, sticks…" /></label>}
                          </div>
                          <label>Receiving / put-away note<input name="stock_notes" placeholder="Condition, packaging, drawer note…" /></label>
                          <button type="submit" className="primary" disabled={saving}>{saving ? 'Receiving…' : `Receive into ${lot.category === 'part' ? 'Parts' : lot.category === 'tool' ? 'Tools' : 'Consumables'}`}</button>
                        </form>
                      )}

                      {lot.category === 'other' && <p className="muted">This lot is intentionally left unclassified. Change it to Item, Part, Tool or Consumable before receiving it into managed stock.</p>}
                      {remaining === 0 && <p className="purchase-complete-note">Lot fully received.</p>}
                    </article>
                  )
                })}
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
