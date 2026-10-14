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
  invoice_id: string | null
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
  quantity_closed_short: number
  receiving_note: string
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

type ReceivingException = {
  id: string
  purchase_id: string
  purchase_lot_id: string
  exception_type: 'missing' | 'damaged' | 'wrong_item' | 'extra' | 'other'
  quantity: number
  status: 'open' | 'resolved' | 'waived'
  note: string
  resolution_note: string
  closes_shortfall: boolean
  created_at: string
  resolved_at: string | null
}

type StorageLocation = {
  id: string
  parent_id: string | null
  name: string
  code: string | null
  location_type: string
  sort_order: number
}

type InvoiceSummary = {
  id: string
  invoice_number: string
  invoice_date: string | null
  subtotal_aud: number | null
  fees_aud: number | null
  postage_aud: number | null
  total_aud: number | null
  original_filename: string
}

type ReceivedItem = { id: string; item_number: number; title: string; storage_location_id?: string | null }
type PurchaseLoadOptions = { page?: number; query?: string; status?: string }

const statusLabels: Record<string, string> = {
  suggested: 'Suggested', ordered: 'Ordered', shipped: 'In transit', delivered: 'Delivered',
  partially_received: 'Partially received', received: 'Received', discrepancy: 'Discrepancy', cancelled: 'Cancelled', returned: 'Returned',
}

const exceptionLabels: Record<string, string> = {
  missing: 'Missing', damaged: 'Damaged', wrong_item: 'Wrong item', extra: 'Extra item', other: 'Other',
}

const itemTypes = ['watch', 'clock', 'jewellery', 'accessory', 'other']
const purposes = ['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other']
const lotCategories = ['item', 'part', 'tool', 'consumable', 'other']
const purchasePageSize = 30

function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function signedMoney(value: number) {
  if (Math.abs(value) < 0.005) return money(0)
  return `${value > 0 ? '+' : '−'}${money(Math.abs(value))}`
}

function today() { return new Date().toISOString().slice(0, 10) }

export default function PurchaseIntake({ workspaceId }: { workspaceId: string }) {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lots, setLots] = useState<PurchaseLot[]>([])
  const [links, setLinks] = useState<PurchaseLink[]>([])
  const [stockLinks, setStockLinks] = useState<StockLink[]>([])
  const [exceptions, setExceptions] = useState<ReceivingException[]>([])
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([])
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [lastReceivedItem, setLastReceivedItem] = useState<ReceivedItem | null>(null)
  const [purchaseQuery, setPurchaseQuery] = useState('')
  const [debouncedPurchaseQuery, setDebouncedPurchaseQuery] = useState('')
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState('')
  const [purchasePage, setPurchasePage] = useState(0)
  const [purchaseCount, setPurchaseCount] = useState(0)

  const selected = purchases.find((purchase) => purchase.id === selectedId) ?? null
  const selectedLinks = useMemo(() => links.filter((link) => lots.some((lot) => lot.id === link.purchase_lot_id)), [links, lots])
  const purchaseTotalPages = Math.max(1, Math.ceil(purchaseCount / purchasePageSize))
  const purchaseFirstShown = purchaseCount === 0 ? 0 : purchasePage * purchasePageSize + 1
  const purchaseLastShown = Math.min(purchaseCount, (purchasePage + 1) * purchasePageSize)

  const storagePathById = useMemo(() => {
    const byId = new Map(storageLocations.map((location) => [location.id, location]))
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
    for (const location of storageLocations) build(location.id)
    return cache
  }, [storageLocations])

  const sortedStorageLocations = useMemo(
    () => [...storageLocations].sort((a, b) => (storagePathById.get(a.id) || a.name).localeCompare(storagePathById.get(b.id) || b.name)),
    [storageLocations, storagePathById],
  )

  const receivingSummary = useMemo(() => {
    const expected = lots.reduce((sum, lot) => sum + Number(lot.quantity_expected || 0), 0)
    const received = lots.reduce((sum, lot) => sum + Number(lot.quantity_received || 0), 0)
    const closedShort = lots.reduce((sum, lot) => sum + Number(lot.quantity_closed_short || 0), 0)
    const openExceptions = exceptions.filter((entry) => entry.status === 'open').length
    return { expected, received, closedShort, openExceptions, remaining: Math.max(0, expected - received - closedShort) }
  }, [lots, exceptions])

  const reconciliation = useMemo(() => {
    if (!selected?.invoice_id || !invoiceSummary) return null
    const sourceTotal = Number(invoiceSummary.total_aud || 0)
    const componentValues = [invoiceSummary.subtotal_aud, invoiceSummary.fees_aud, invoiceSummary.postage_aud].filter((value) => value != null)
    const capturedComponents = componentValues.reduce((sum, value) => sum + Number(value || 0), 0)
    const purchaseTotal = Number(selected.amount_aud ?? selected.amount ?? 0)
    const lotAllocation = lots.reduce((sum, lot) => sum + Number(lot.amount_aud ?? 0), 0)
    const sourceGap = capturedComponents - sourceTotal
    const purchaseGap = purchaseTotal - sourceTotal
    const lotGap = lotAllocation - sourceTotal
    const threshold = 0.005
    const reconciled = Math.abs(sourceGap) < threshold && Math.abs(purchaseGap) < threshold && Math.abs(lotGap) < threshold
    return { sourceTotal, capturedComponents, purchaseTotal, lotAllocation, sourceGap, purchaseGap, lotGap, reconciled }
  }, [selected, invoiceSummary, lots])

  async function loadPurchases(selectId?: string, options: PurchaseLoadOptions = {}) {
    const page = options.page ?? purchasePage
    const query = options.query ?? debouncedPurchaseQuery
    const status = options.status ?? purchaseStatusFilter
    setLoading(true)
    let request = supabase
      .from('purchases')
      .select('id,vendor_name,channel,external_order_id,description,category,amount,currency,amount_aud,status,ordered_at,tracking_number,eta,received_at,discrepancy_note,notes,created_at,invoice_id', { count: 'exact' })
      .eq('workspace_id', workspaceId)
    if (status) request = request.eq('status', status)
    if (query.trim()) request = request.ilike('search_text', `%${query.trim()}%`)
    const from = page * purchasePageSize
    const { data, error, count } = await request
      .order('created_at', { ascending: false })
      .range(from, from + purchasePageSize - 1)
    setLoading(false)
    if (error) { setMessage(`Purchases failed to load: ${error.message}`); return }
    const total = count ?? 0
    if (page > 0 && from >= total) {
      setPurchasePage(Math.max(0, Math.ceil(total / purchasePageSize) - 1))
      return
    }
    const rows = (data ?? []) as Purchase[]
    setPurchases(rows)
    setPurchaseCount(total)
    const target = selectId && rows.some((row) => row.id === selectId)
      ? selectId
      : rows.some((row) => row.id === selectedId) ? selectedId : rows[0]?.id || ''
    setSelectedId(target)
  }

  async function loadStorageLocations() {
    const { data, error } = await supabase
      .from('storage_locations')
      .select('id,parent_id,name,code,location_type,sort_order')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(500)
    if (error) { setMessage(`Storage locations failed to load: ${error.message}`); return }
    setStorageLocations((data ?? []) as StorageLocation[])
  }

  async function loadInvoiceSummary(invoiceId: string | null) {
    if (!invoiceId) { setInvoiceSummary(null); return }
    const { data, error } = await supabase
      .from('acquisition_invoices')
      .select('id,invoice_number,invoice_date,subtotal_aud,fees_aud,postage_aud,total_aud,original_filename')
      .eq('workspace_id', workspaceId)
      .eq('id', invoiceId)
      .maybeSingle()
    if (error) { setInvoiceSummary(null); setMessage(`Invoice reconciliation failed to load: ${error.message}`); return }
    setInvoiceSummary((data as InvoiceSummary | null) ?? null)
  }

  async function loadPurchaseDetail(purchaseId: string) {
    if (!purchaseId) { setLots([]); setLinks([]); setStockLinks([]); setExceptions([]); return }
    const [lotResult, linkResult, stockResult, exceptionResult] = await Promise.all([
      supabase.from('purchase_lots')
        .select('id,purchase_id,lot_number,title,description,category,quantity_expected,quantity_received,quantity_closed_short,receiving_note,amount,currency,amount_aud,shared_cost_override_aud,notes')
        .eq('workspace_id', workspaceId).eq('purchase_id', purchaseId).order('created_at', { ascending: true }),
      supabase.from('purchase_item_links')
        .select('id,purchase_lot_id,item_id,allocated_purchase_cost_aud,allocated_shared_cost_aud,items(item_number,title)')
        .eq('workspace_id', workspaceId).eq('purchase_id', purchaseId).order('created_at', { ascending: true }),
      supabase.from('purchase_stock_links')
        .select('id,purchase_lot_id,resource_type,part_id,tool_id,consumable_id,quantity_received,allocated_purchase_cost_aud,allocated_shared_cost_aud')
        .eq('workspace_id', workspaceId).eq('purchase_id', purchaseId).order('created_at', { ascending: true }),
      supabase.from('purchase_receiving_exceptions')
        .select('id,purchase_id,purchase_lot_id,exception_type,quantity,status,note,resolution_note,closes_shortfall,created_at,resolved_at')
        .eq('workspace_id', workspaceId).eq('purchase_id', purchaseId).order('created_at', { ascending: false }),
    ])
    if (lotResult.error) { setMessage(`Purchase lots failed to load: ${lotResult.error.message}`); return }
    if (linkResult.error) { setMessage(`Purchase links failed to load: ${linkResult.error.message}`); return }
    if (stockResult.error) { setMessage(`Stock links failed to load: ${stockResult.error.message}`); return }
    if (exceptionResult.error) { setMessage(`Receiving exceptions failed to load: ${exceptionResult.error.message}`); return }
    setLots((lotResult.data ?? []) as PurchaseLot[])
    setLinks((linkResult.data ?? []) as unknown as PurchaseLink[])
    setStockLinks((stockResult.data ?? []) as StockLink[])
    setExceptions((exceptionResult.data ?? []) as ReceivingException[])
  }

  useEffect(() => {
    if (!workspaceId) return
    void loadStorageLocations()
  }, [workspaceId])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPurchaseQuery(purchaseQuery.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [purchaseQuery])

  useEffect(() => { setPurchasePage(0) }, [debouncedPurchaseQuery, purchaseStatusFilter])

  useEffect(() => {
    if (!workspaceId) return
    void loadPurchases()
  }, [workspaceId, purchasePage, debouncedPurchaseQuery, purchaseStatusFilter])

  useEffect(() => {
    if (!selectedId) return
    setLastReceivedItem(null)
    void loadPurchaseDetail(selectedId)
  }, [selectedId])

  useEffect(() => {
    void loadInvoiceSummary(selected?.invoice_id ?? null)
  }, [selected?.invoice_id, workspaceId])

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
    setPurchaseQuery('')
    setPurchaseStatusFilter('')
    setPurchasePage(0)
    setMessage('Purchase created. Add one or more lots/bundle components, then receive them into physical stock.')
    await loadPurchases(data.id, { page: 0, query: '', status: '' })
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

  async function classifyLot(lot: PurchaseLot, category: 'item' | 'part' | 'tool' | 'consumable') {
    setSaving(true)
    const { error } = await supabase.rpc('classify_purchase_lot', {
      p_workspace_id: workspaceId,
      p_purchase_lot_id: lot.id,
      p_category: category,
    })
    setSaving(false)
    if (error) { setMessage(`Lot could not be classified: ${error.message}`); return }
    setMessage(`Lot classified as ${category}. It is ready for receiving.`)
    await loadPurchaseDetail(lot.purchase_id)
    await loadPurchases(lot.purchase_id)
  }

  async function updateStatus(status: string) {
    if (!selected) return
    const { error } = await supabase.from('purchases').update({ status, updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('id', selected.id)
    if (error) { setMessage(`Purchase status could not be updated: ${error.message}`); return }
    setMessage(`Purchase moved to ${statusLabels[status] || status}. Receiving statuses update automatically once stock starts arriving.`)
    await loadPurchases(selected.id)
  }

  async function createPhysicalItem(lot: PurchaseLot, form: HTMLFormElement) {
    const data = new FormData(form)
    const title = String(data.get('item_title') || lot.title).trim()
    const type = String(data.get('item_type') || 'watch')
    const purpose = String(data.get('item_purpose') || 'resale')
    const storageLocationId = String(data.get('storage_location_id') || '')
    setSaving(true)
    const { data: created, error } = await supabase.rpc('materialize_purchase_lot_item_received', {
      p_workspace_id: workspaceId,
      p_purchase_lot_id: lot.id,
      p_title: title,
      p_type: type,
      p_purpose: purpose,
      p_notes: String(data.get('item_notes') || '').trim(),
      p_storage_location_id: storageLocationId || null,
    })
    setSaving(false)
    if (error) { setMessage(`Physical Item could not be received: ${error.message}`); return }
    const item = (Array.isArray(created) ? created[0] : created) as ReceivedItem | null
    if (item?.id) setLastReceivedItem(item)
    const destination = storageLocationId ? storagePathById.get(storageLocationId) || 'selected storage location' : 'Needs put-away'
    setMessage(`Item received from ${lot.lot_number ? `lot ${lot.lot_number}` : lot.title} and kept in this Purchase. Location: ${destination}.`)
    form.reset()
    await loadPurchaseDetail(lot.purchase_id)
    await loadPurchases(lot.purchase_id)
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
    setMessage(`${lot.category[0].toUpperCase()}${lot.category.slice(1)} received into physical inventory${costText}.`)
    form.reset()
    await loadPurchaseDetail(lot.purchase_id)
    await loadPurchases(lot.purchase_id)
  }

  async function recordException(lot: PurchaseLot, form: HTMLFormElement) {
    const data = new FormData(form)
    const note = String(data.get('exception_note') || '').trim()
    const quantity = Math.max(1, Number(data.get('exception_quantity')) || 1)
    if (!note) { setMessage('Add a short note describing the receiving problem.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('record_purchase_receiving_exception', {
      p_workspace_id: workspaceId,
      p_purchase_lot_id: lot.id,
      p_exception_type: String(data.get('exception_type') || 'missing'),
      p_quantity: quantity,
      p_note: note,
    })
    setSaving(false)
    if (error) { setMessage(`Receiving exception could not be recorded: ${error.message}`); return }
    form.reset()
    setMessage('Receiving exception recorded. The Purchase is now held in Discrepancy until the issue is resolved or waived.')
    await loadPurchaseDetail(lot.purchase_id)
    await loadPurchases(lot.purchase_id)
  }

  async function resolveException(entry: ReceivingException, closeShortfall: boolean, waive = false) {
    const promptText = closeShortfall
      ? 'Resolution note — for example refund received, seller cancelled missing item, or short shipment accepted:'
      : waive ? 'Why are you waiving this exception?' : 'How was this receiving issue resolved?'
    const resolution = window.prompt(promptText, entry.resolution_note || '')
    if (resolution == null || !resolution.trim()) return
    setSaving(true)
    const { error } = await supabase.rpc('resolve_purchase_receiving_exception', {
      p_workspace_id: workspaceId,
      p_exception_id: entry.id,
      p_resolution_note: resolution.trim(),
      p_close_shortfall: closeShortfall,
      p_waive: waive,
    })
    setSaving(false)
    if (error) { setMessage(`Receiving exception could not be closed: ${error.message}`); return }
    setMessage(closeShortfall ? 'Exception resolved and the accepted shortfall was closed.' : waive ? 'Exception waived.' : 'Receiving exception resolved.')
    await loadPurchaseDetail(entry.purchase_id)
    await loadPurchases(entry.purchase_id)
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
      {lastReceivedItem && (
        <div className="purchase-received-item-action">
          <span><strong>Item #{lastReceivedItem.item_number} received</strong><small>{lastReceivedItem.title}</small></span>
          <button type="button" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(lastReceivedItem.id)}` }}>Open Item</button>
        </div>
      )}

      {showNew && (
        <form className="purchase-form panel" onSubmit={createPurchase}>
          <div className="purchase-form-grid">
            <label>Vendor / auction house<input name="vendor_name" placeholder="e.g. Hannam's Auctions" /></label>
            <label>Channel<input name="channel" placeholder="Auction, eBay, private sale…" /></label>
            <label>Order / invoice ref<input name="external_order_id" /></label>
            <label>Ordered date<input name="ordered_at" type="date" defaultValue={today()} /></label>
            <label>Purchase description<input name="description" required placeholder="Watch bundle, single watch, parts lot…" /></label>
            <label>Status<select name="status" defaultValue="ordered"><option value="ordered">Ordered</option><option value="shipped">In transit</option><option value="delivered">Delivered</option></select></label>
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
          <div className="purchase-list-heading"><strong>Purchases</strong><span>{loading ? 'Loading…' : `${purchaseFirstShown}–${purchaseLastShown} of ${purchaseCount}`}</span></div>
          <div className="purchase-list-controls">
            <input type="search" value={purchaseQuery} onChange={(event) => setPurchaseQuery(event.target.value)} placeholder="Search vendor, ref, description, tracking…" aria-label="Search purchases" />
            <select value={purchaseStatusFilter} onChange={(event) => setPurchaseStatusFilter(event.target.value)} aria-label="Filter purchases by status">
              <option value="">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {purchases.length === 0 && !loading && <p className="muted">No purchases match this view.</p>}
          {purchases.map((purchase) => (
            <button key={purchase.id} type="button" className={purchase.id === selectedId ? 'purchase-row active' : 'purchase-row'} onClick={() => setSelectedId(purchase.id)}>
              <span><strong>{purchase.vendor_name || purchase.description}</strong><small>{purchase.external_order_id || purchase.description}</small></span>
              <span><small>{statusLabels[purchase.status] || purchase.status}</small><strong>{money(purchase.amount_aud ?? purchase.amount, purchase.amount_aud != null ? 'AUD' : purchase.currency)}</strong></span>
            </button>
          ))}
          {purchaseCount > purchasePageSize && (
            <div className="purchase-list-pagination">
              <button type="button" disabled={loading || purchasePage === 0} onClick={() => setPurchasePage((value) => Math.max(0, value - 1))}>Previous</button>
              <span>Page {purchasePage + 1} of {purchaseTotalPages}</span>
              <button type="button" disabled={loading || purchasePage + 1 >= purchaseTotalPages} onClick={() => setPurchasePage((value) => value + 1)}>Next</button>
            </div>
          )}
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
                <div className="purchase-receiving-summary" aria-label="Receiving progress">
                  <span><strong>{receivingSummary.received}</strong><small>received</small></span>
                  <span><strong>{receivingSummary.remaining}</strong><small>remaining</small></span>
                  <span><strong>{receivingSummary.closedShort}</strong><small>closed short</small></span>
                  <span className={receivingSummary.openExceptions > 0 ? 'has-exception' : ''}><strong>{receivingSummary.openExceptions}</strong><small>open issues</small></span>
                </div>
                <div className="purchase-status-actions">
                  <button type="button" onClick={() => void updateStatus('ordered')}>Ordered</button>
                  <button type="button" onClick={() => void updateStatus('shipped')}>In transit</button>
                  <button type="button" onClick={() => void updateStatus('delivered')}>Delivered</button>
                  <span className="purchase-status-auto">Partial, discrepancy and received states are automatic.</span>
                </div>
                {selected.tracking_number && <p><strong>Tracking:</strong> {selected.tracking_number}</p>}
              </section>

              {reconciliation && (
                <section className={`panel purchase-reconciliation ${reconciliation.reconciled ? 'is-reconciled' : 'has-gap'}`}>
                  <div className="purchase-reconciliation-head">
                    <div>
                      <p className="eyebrow">SOURCE RECONCILIATION</p>
                      <h3>{reconciliation.reconciled ? 'Reconciled' : 'Source discrepancy'}</h3>
                      <p className="muted">Invoice {invoiceSummary?.invoice_number || selected.external_order_id || 'source document'}{invoiceSummary?.invoice_date ? ` · ${invoiceSummary.invoice_date}` : ''}</p>
                    </div>
                    <span className="purchase-reconciliation-state">{reconciliation.reconciled ? 'Balanced' : signedMoney(reconciliation.sourceGap)}</span>
                  </div>
                  <div className="purchase-reconciliation-grid">
                    <div><small>Stated invoice total</small><strong>{money(reconciliation.sourceTotal)}</strong><span>Source truth</span></div>
                    <div><small>Captured components</small><strong>{money(reconciliation.capturedComponents)}</strong><span>{signedMoney(reconciliation.sourceGap)} vs source</span></div>
                    <div><small>Purchase total</small><strong>{money(reconciliation.purchaseTotal)}</strong><span>{signedMoney(reconciliation.purchaseGap)} vs source</span></div>
                    <div><small>Lot allocation</small><strong>{money(reconciliation.lotAllocation)}</strong><span>{signedMoney(reconciliation.lotGap)} vs source</span></div>
                  </div>
                  <div className="purchase-reconciliation-note">
                    <strong>{reconciliation.reconciled ? 'What this means' : 'Why Calibre is showing this'}</strong>
                    <p>{selected.discrepancy_note || (reconciliation.reconciled ? 'The source document, Purchase total and lot allocation agree to the cent.' : 'The source document does not reconcile exactly. Calibre preserves the original values rather than silently changing them.')}</p>
                    <small>Document values are preserved separately from Calibre's Purchase and allocation records.</small>
                  </div>
                </section>
              )}

              {!reconciliation && selected.discrepancy_note && (
                <section className="panel purchase-reconciliation has-gap">
                  <div className="purchase-reconciliation-head"><div><p className="eyebrow">SOURCE / PURCHASE NOTE</p><h3>Discrepancy recorded</h3></div></div>
                  <div className="purchase-reconciliation-note"><p>{selected.discrepancy_note}</p></div>
                </section>
              )}

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
                  const lotExceptions = exceptions.filter((entry) => entry.purchase_lot_id === lot.id)
                  const receivedQuantity = Number(lot.quantity_received || 0)
                  const closedShort = Number(lot.quantity_closed_short || 0)
                  const remaining = Math.max(0, Number(lot.quantity_expected || 0) - receivedQuantity - closedShort)
                  const openExceptions = lotExceptions.filter((entry) => entry.status === 'open')
                  return (
                    <article key={lot.id} className="panel purchase-lot-card">
                      <div className="purchase-lot-head">
                        <div><p className="eyebrow">{lot.lot_number ? `LOT ${lot.lot_number}` : lot.category.toUpperCase()}</p><h3>{lot.title}</h3><p className="muted">Expected {lot.quantity_expected} · received {receivedQuantity}{closedShort > 0 ? ` · closed short ${closedShort}` : ''} · remaining {remaining}</p></div>
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
                          <label>Physical location<select name="storage_location_id" defaultValue=""><option value="">Needs put-away</option>{sortedStorageLocations.map((location) => <option key={location.id} value={location.id}>{storagePathById.get(location.id) || location.name}</option>)}</select></label>
                          <label className="purchase-materialize-note">Receiving note<input name="item_notes" placeholder="Condition on arrival, quick observation…" /></label>
                          <button type="submit" className="primary" disabled={saving}>{saving ? 'Receiving…' : `Receive Item (${remaining} remaining)`}</button>
                        </form>
                      )}

                      {['part', 'tool', 'consumable'].includes(lot.category) && remaining > 0 && (
                        <form className="purchase-stock-receive" onSubmit={(event) => { event.preventDefault(); void receiveWorkshopStock(lot, event.currentTarget) }}>
                          <div className="purchase-stock-grid">
                            <label>Name<input name="stock_name" defaultValue={lot.title} /></label>
                            <label>Receive qty<input name="stock_quantity" type="number" min="0.01" step="0.01" max={remaining} defaultValue={remaining} /></label>
                            <label>Storage<select name="storage_location_id" defaultValue=""><option value="">Needs put-away</option>{sortedStorageLocations.map((location) => <option key={location.id} value={location.id}>{storagePathById.get(location.id) || location.name}</option>)}</select></label>
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

                      {lot.category === 'other' && remaining > 0 && (
                        <div className="purchase-classify-lot">
                          <div><strong>Classify before receiving</strong><span>This invoice line was preserved in the Purchase even though it was not auto-imported to Inventory.</span></div>
                          <div className="purchase-classify-actions">
                            <button type="button" disabled={saving} onClick={() => void classifyLot(lot, 'item')}>Item</button>
                            <button type="button" disabled={saving} onClick={() => void classifyLot(lot, 'part')}>Part</button>
                            <button type="button" disabled={saving} onClick={() => void classifyLot(lot, 'tool')}>Tool</button>
                            <button type="button" disabled={saving} onClick={() => void classifyLot(lot, 'consumable')}>Consumable</button>
                          </div>
                        </div>
                      )}
                      {remaining === 0 && openExceptions.length === 0 && <p className="purchase-complete-note">Lot receiving complete.</p>}

                      <section className="purchase-exceptions">
                        <div className="purchase-exception-head">
                          <div><strong>Receiving exceptions</strong><small>{openExceptions.length > 0 ? `${openExceptions.length} open` : 'No open issues'}</small></div>
                        </div>
                        {lotExceptions.length > 0 && (
                          <div className="purchase-exception-list">
                            {lotExceptions.map((entry) => (
                              <div key={entry.id} className={`purchase-exception-row ${entry.status}`}>
                                <div>
                                  <strong>{exceptionLabels[entry.exception_type] || entry.exception_type} · qty {entry.quantity}</strong>
                                  <span>{entry.note}</span>
                                  {entry.resolution_note && <small>{entry.status}: {entry.resolution_note}{entry.closes_shortfall ? ' · shortfall closed' : ''}</small>}
                                </div>
                                {entry.status === 'open' && (
                                  <div className="purchase-exception-actions">
                                    <button type="button" onClick={() => void resolveException(entry, false)}>Resolved</button>
                                    {['missing', 'wrong_item', 'other'].includes(entry.exception_type) && <button type="button" onClick={() => void resolveException(entry, true)}>Resolve & close shortfall</button>}
                                    <button type="button" onClick={() => void resolveException(entry, false, true)}>Waive</button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <form className="purchase-exception-form" onSubmit={(event) => { event.preventDefault(); void recordException(lot, event.currentTarget) }}>
                          <label>Problem<select name="exception_type" defaultValue="missing"><option value="missing">Missing</option><option value="damaged">Damaged</option><option value="wrong_item">Wrong item</option><option value="extra">Extra item</option><option value="other">Other</option></select></label>
                          <label>Qty<input name="exception_quantity" type="number" min="1" step="1" defaultValue="1" /></label>
                          <label className="exception-note">What happened?<input name="exception_note" placeholder="e.g. lot contained 2 watches, only 1 arrived" /></label>
                          <button type="submit" disabled={saving}>Record issue</button>
                        </form>
                      </section>
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
