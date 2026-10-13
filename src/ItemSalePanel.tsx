import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type Valuation = {
  id: string
  low_value: number | null
  expected_value: number | null
  high_value: number | null
  target_value: number | null
  minimum_value: number | null
  currency: string
  confidence: string
  basis: string
  valued_at: string
}

type Cost = {
  id: string
  category: string
  amount: number
  currency: string
  notes: string
  incurred_at: string
}

type Sale = {
  id: string
  status: string
  channel: string
  listing_title: string
  listing_text: string
  asking_price: number | null
  sale_price: number | null
  currency: string
  listed_at: string | null
  sold_at: string | null
  marketplace_fees: number
  shipping_to_buyer: number
  buyer_note: string
}

const costCategories = ['part', 'consumable', 'external_service', 'repair', 'preparation', 'postage', 'other']
const saleStatuses = ['draft', 'ready', 'listed', 'sold', 'cancelled']
const confidenceLevels = ['unknown', 'possible', 'probable', 'strong', 'confirmed']

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(Number(value))
}

function numberOrNull(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function datePart(value: string | null | undefined) {
  return value ? value.slice(0, 10) : ''
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function ItemSalePanel({ workspaceId, itemId, itemTitle, itemStatus, onChanged }: {
  workspaceId: string
  itemId: string
  itemTitle: string
  itemStatus: string
  onChanged?: () => void | Promise<void>
}) {
  const [valuation, setValuation] = useState<Valuation | null>(null)
  const [costs, setCosts] = useState<Cost[]>([])
  const [sale, setSale] = useState<Sale | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingValuation, setSavingValuation] = useState(false)
  const [savingCost, setSavingCost] = useState(false)
  const [savingSale, setSavingSale] = useState(false)
  const [message, setMessage] = useState('')

  const [low, setLow] = useState('')
  const [expected, setExpected] = useState('')
  const [high, setHigh] = useState('')
  const [minimum, setMinimum] = useState('')
  const [target, setTarget] = useState('')
  const [confidence, setConfidence] = useState('unknown')
  const [basis, setBasis] = useState('')

  const [costCategory, setCostCategory] = useState('part')
  const [costAmount, setCostAmount] = useState('')
  const [costDate, setCostDate] = useState(today())
  const [costNotes, setCostNotes] = useState('')

  const [saleStatus, setSaleStatus] = useState('draft')
  const [channel, setChannel] = useState('')
  const [listingTitle, setListingTitle] = useState(itemTitle)
  const [listingText, setListingText] = useState('')
  const [askingPrice, setAskingPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [fees, setFees] = useState('')
  const [buyerShipping, setBuyerShipping] = useState('')
  const [listedDate, setListedDate] = useState('')
  const [soldDate, setSoldDate] = useState('')
  const [buyerNote, setBuyerNote] = useState('')

  async function load() {
    if (!workspaceId || !itemId) return
    setLoading(true)
    const [valuationResult, costsResult, saleResult] = await Promise.all([
      supabase.from('valuations').select('id,low_value,expected_value,high_value,target_value,minimum_value,currency,confidence,basis,valued_at').eq('workspace_id', workspaceId).eq('item_id', itemId).order('valued_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cost_entries').select('id,category,amount,currency,notes,incurred_at').eq('workspace_id', workspaceId).eq('item_id', itemId).order('incurred_at', { ascending: false }),
      supabase.from('sales').select('id,status,channel,listing_title,listing_text,asking_price,sale_price,currency,listed_at,sold_at,marketplace_fees,shipping_to_buyer,buyer_note').eq('workspace_id', workspaceId).eq('item_id', itemId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setLoading(false)
    const error = valuationResult.error ?? costsResult.error ?? saleResult.error
    if (error) {
      setMessage(`Sale data could not be loaded: ${error.message}`)
      return
    }

    const nextValuation = valuationResult.data as Valuation | null
    const nextSale = saleResult.data as Sale | null
    setValuation(nextValuation)
    setCosts((costsResult.data ?? []) as Cost[])
    setSale(nextSale)

    setLow(nextValuation?.low_value == null ? '' : String(nextValuation.low_value))
    setExpected(nextValuation?.expected_value == null ? '' : String(nextValuation.expected_value))
    setHigh(nextValuation?.high_value == null ? '' : String(nextValuation.high_value))
    setMinimum(nextValuation?.minimum_value == null ? '' : String(nextValuation.minimum_value))
    setTarget(nextValuation?.target_value == null ? '' : String(nextValuation.target_value))
    setConfidence(nextValuation?.confidence || 'unknown')
    setBasis(nextValuation?.basis || '')

    setSaleStatus(nextSale?.status || (itemStatus === 'ready_for_sale' ? 'ready' : itemStatus === 'listed' ? 'listed' : itemStatus === 'sold' ? 'sold' : 'draft'))
    setChannel(nextSale?.channel || '')
    setListingTitle(nextSale?.listing_title || itemTitle)
    setListingText(nextSale?.listing_text || '')
    setAskingPrice(nextSale?.asking_price == null ? '' : String(nextSale.asking_price))
    setSalePrice(nextSale?.sale_price == null ? '' : String(nextSale.sale_price))
    setFees(nextSale?.marketplace_fees ? String(nextSale.marketplace_fees) : '')
    setBuyerShipping(nextSale?.shipping_to_buyer ? String(nextSale.shipping_to_buyer) : '')
    setListedDate(datePart(nextSale?.listed_at))
    setSoldDate(datePart(nextSale?.sold_at))
    setBuyerNote(nextSale?.buyer_note || '')
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, itemId])

  const invested = useMemo(() => costs.reduce((sum, row) => row.currency === 'AUD' ? sum + Number(row.amount || 0) : sum, 0), [costs])
  const expectedValue = valuation?.currency === 'AUD' ? valuation.expected_value : null
  const targetValue = valuation?.currency === 'AUD' ? valuation.target_value : null
  const expectedProfit = expectedValue == null ? null : Number(expectedValue) - invested
  const targetProfit = targetValue == null ? null : Number(targetValue) - invested
  const soldNet = sale?.currency === 'AUD' && sale.sale_price != null
    ? Number(sale.sale_price) - Number(sale.marketplace_fees || 0) - Number(sale.shipping_to_buyer || 0)
    : null
  const actualProfit = soldNet == null ? null : soldNet - invested
  const roi = actualProfit == null || invested <= 0 ? null : (actualProfit / invested) * 100

  async function saveValuation(event: FormEvent) {
    event.preventDefault()
    if (savingValuation) return
    setSavingValuation(true)
    const result = await supabase.from('valuations').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      low_value: numberOrNull(low),
      expected_value: numberOrNull(expected),
      high_value: numberOrNull(high),
      minimum_value: numberOrNull(minimum),
      target_value: numberOrNull(target),
      currency: 'AUD',
      confidence,
      basis: basis.trim(),
      valued_at: new Date().toISOString(),
    })
    setSavingValuation(false)
    if (result.error) { setMessage(`Valuation could not be saved: ${result.error.message}`); return }
    setMessage('Valuation saved. The previous valuation remains in history.')
    await load()
    await onChanged?.()
  }

  async function addCost(event: FormEvent) {
    event.preventDefault()
    const amount = numberOrNull(costAmount)
    if (savingCost || amount == null || amount < 0) return
    setSavingCost(true)
    const result = await supabase.from('cost_entries').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      category: costCategory,
      amount,
      currency: 'AUD',
      incurred_at: costDate || today(),
      notes: costNotes.trim(),
    })
    setSavingCost(false)
    if (result.error) { setMessage(`Cost could not be added: ${result.error.message}`); return }
    setCostAmount('')
    setCostNotes('')
    setMessage('Cost added to this Item.')
    await load()
    await onChanged?.()
  }

  async function saveSale(event: FormEvent) {
    event.preventDefault()
    if (savingSale) return
    setSavingSale(true)

    const effectiveListedDate = listedDate || (saleStatus === 'listed' || saleStatus === 'sold' ? today() : '')
    const effectiveSoldDate = soldDate || (saleStatus === 'sold' ? today() : '')
    const payload = {
      workspace_id: workspaceId,
      item_id: itemId,
      status: saleStatus,
      channel: channel.trim(),
      listing_title: listingTitle.trim(),
      listing_text: listingText.trim(),
      asking_price: numberOrNull(askingPrice),
      sale_price: numberOrNull(salePrice),
      currency: 'AUD',
      listed_at: effectiveListedDate ? `${effectiveListedDate}T00:00:00` : null,
      sold_at: effectiveSoldDate ? `${effectiveSoldDate}T00:00:00` : null,
      marketplace_fees: numberOrNull(fees) ?? 0,
      shipping_to_buyer: numberOrNull(buyerShipping) ?? 0,
      buyer_note: buyerNote.trim(),
      updated_at: new Date().toISOString(),
    }
    const result = sale
      ? await supabase.from('sales').update(payload).eq('workspace_id', workspaceId).eq('id', sale.id)
      : await supabase.from('sales').insert(payload)

    if (result.error) {
      setSavingSale(false)
      setMessage(`Sale record could not be saved: ${result.error.message}`)
      return
    }

    let nextItemStatus: string | null = null
    if (saleStatus === 'ready') nextItemStatus = 'ready_for_sale'
    if (saleStatus === 'listed') nextItemStatus = 'listed'
    if (saleStatus === 'sold') nextItemStatus = 'sold'
    if (saleStatus === 'cancelled' && itemStatus === 'listed') nextItemStatus = 'ready_for_sale'
    if (nextItemStatus) {
      const itemResult = await supabase.from('items').update({ status: nextItemStatus, updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('id', itemId)
      if (itemResult.error) {
        setSavingSale(false)
        setMessage(`Sale saved, but Item status could not be updated: ${itemResult.error.message}`)
        await load()
        return
      }
    }

    setSavingSale(false)
    setMessage(saleStatus === 'sold' ? 'Sale completed and Item marked sold.' : 'Sale record saved.')
    await load()
    await onChanged?.()
  }

  if (loading) return <div className="loading-card">Loading Item economics…</div>

  return (
    <div className="item-sale-panel">
      {message && <p className="item-sale-message">{message}</p>}

      <section className="item-sale-metrics" aria-label="Item economics">
        <div><span>Total invested</span><strong>{money(invested)}</strong><small>All recorded AUD Item costs</small></div>
        <div><span>Target profit</span><strong>{money(targetProfit)}</strong><small>{targetValue == null ? 'Set a target below' : `${money(targetValue)} target value`}</small></div>
        <div><span>Expected profit</span><strong>{money(expectedProfit)}</strong><small>{expectedValue == null ? 'Set an expected value below' : `${money(expectedValue)} expected value`}</small></div>
        <div><span>Actual profit</span><strong>{money(actualProfit)}</strong><small>{actualProfit == null ? 'Recorded when sold' : `${roi == null ? '—' : `${roi.toFixed(1)}% ROI`} · ${money(soldNet)} net`}</small></div>
      </section>

      <div className="item-sale-grid">
        <form className="section-card item-sale-card" onSubmit={saveValuation}>
          <div className="item-sale-heading"><div><p className="eyebrow">VALUATION</p><h2>Sales target</h2></div>{valuation && <small>Latest {new Date(valuation.valued_at).toLocaleDateString('en-AU')}</small>}</div>
          <div className="item-sale-form-grid">
            <label>Market low (AUD)<input inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} /></label>
            <label>Expected (AUD)<input inputMode="decimal" value={expected} onChange={(e) => setExpected(e.target.value)} /></label>
            <label>Market high (AUD)<input inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} /></label>
            <label>Minimum (AUD)<input inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} /></label>
            <label>Target (AUD)<input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
            <label>Confidence<select value={confidence} onChange={(e) => setConfidence(e.target.value)}>{confidenceLevels.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label className="span-2">Basis / comparable notes<textarea rows={3} value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="Why this valuation is reasonable…" /></label>
          </div>
          <div className="item-sale-actions"><span>Saving creates a new valuation snapshot.</span><button type="submit" disabled={savingValuation}>{savingValuation ? 'Saving…' : 'Save valuation'}</button></div>
        </form>

        <form className="section-card item-sale-card" onSubmit={addCost}>
          <div className="item-sale-heading"><div><p className="eyebrow">COSTS</p><h2>Add Item cost</h2></div><strong>{money(invested)}</strong></div>
          <div className="item-sale-form-grid">
            <label>Category<select value={costCategory} onChange={(e) => setCostCategory(e.target.value)}>{costCategories.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label>Amount (AUD)<input inputMode="decimal" required value={costAmount} onChange={(e) => setCostAmount(e.target.value)} /></label>
            <label>Date<input type="date" value={costDate} onChange={(e) => setCostDate(e.target.value)} /></label>
            <label className="span-2">Note<input value={costNotes} onChange={(e) => setCostNotes(e.target.value)} placeholder="Crystal, strap, postage, external service…" /></label>
          </div>
          <div className="item-sale-actions"><span>Invoice-derived purchase costs stay traceable and are not edited here.</span><button type="submit" disabled={savingCost || numberOrNull(costAmount) == null}>{savingCost ? 'Adding…' : 'Add cost'}</button></div>
          <div className="item-sale-cost-list">
            {costs.map((row) => <div key={row.id}><span><strong>{titleCase(row.category)}</strong><small>{row.notes || new Date(`${row.incurred_at}T00:00:00`).toLocaleDateString('en-AU')}</small></span><b>{row.currency === 'AUD' ? money(row.amount) : `${row.currency} ${row.amount}`}</b></div>)}
            {costs.length === 0 && <p className="muted">No costs recorded.</p>}
          </div>
        </form>
      </div>

      <form className="section-card item-sale-card" onSubmit={saveSale}>
        <div className="item-sale-heading"><div><p className="eyebrow">LISTING & SALE</p><h2>{sale ? 'Commercial record' : 'Prepare this Item for sale'}</h2></div><span className={`status-pill status-${saleStatus}`}>{titleCase(saleStatus)}</span></div>
        <div className="item-sale-form-grid sale-wide">
          <label>Status<select value={saleStatus} onChange={(e) => setSaleStatus(e.target.value)}>{saleStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
          <label>Marketplace / channel<input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="eBay, website, Facebook…" /></label>
          <label className="span-2">Listing title<input value={listingTitle} onChange={(e) => setListingTitle(e.target.value)} /></label>
          <label>Asking price (AUD)<input inputMode="decimal" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} /></label>
          <label>Sale price (AUD)<input inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} /></label>
          <label>Marketplace fees (AUD)<input inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} /></label>
          <label>Shipping to buyer (AUD)<input inputMode="decimal" value={buyerShipping} onChange={(e) => setBuyerShipping(e.target.value)} /></label>
          <label>Listed date<input type="date" value={listedDate} onChange={(e) => setListedDate(e.target.value)} /></label>
          <label>Sold date<input type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} /></label>
          <label className="span-2">Listing text<textarea rows={5} value={listingText} onChange={(e) => setListingText(e.target.value)} placeholder="Working listing copy can live here until the listing generator takes over." /></label>
          <label className="span-2">Buyer / sale note<textarea rows={2} value={buyerNote} onChange={(e) => setBuyerNote(e.target.value)} /></label>
        </div>
        <div className="item-sale-actions"><span>{saleStatus === 'sold' ? 'Saving as Sold updates the Item status and realised Business profit.' : 'Listing and sale fees are kept here so they are not double-counted as Item costs.'}</span><button type="submit" disabled={savingSale}>{savingSale ? 'Saving…' : saleStatus === 'sold' ? 'Complete sale' : 'Save sale record'}</button></div>
      </form>
    </div>
  )
}
