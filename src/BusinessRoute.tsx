import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type BusinessView = 'overview' | 'stock' | 'listings' | 'sales' | 'costs'

type ItemRow = {
  id: string
  item_number: number
  title: string
  type: string
  purpose: string
  status: string
  acquired_at: string | null
  created_at: string
}

type ValuationRow = {
  id: string
  item_id: string
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

type CostRow = {
  id: string
  item_id: string
  work_id: string | null
  category: string
  amount: number
  currency: string
  incurred_at: string
  notes: string
}

type SaleRow = {
  id: string
  item_id: string
  status: string
  channel: string
  listing_title: string
  asking_price: number | null
  sale_price: number | null
  currency: string
  listed_at: string | null
  sold_at: string | null
  marketplace_fees: number
  shipping_to_buyer: number
}

type OfferRow = {
  id: string
  item_id: string
  sale_id: string | null
  amount: number
  currency: string
  buyer: string
  source: string
  status: string
  offered_at: string
}

function isBusinessRoute() {
  return window.location.hash.replace(/\/$/, '') === '#/business'
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value))
}

function daysOld(value: string | null) {
  if (!value) return 0
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
}

export default function BusinessRoute() {
  const [active, setActive] = useState(isBusinessRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [view, setView] = useState<BusinessView>('overview')
  const [items, setItems] = useState<ItemRow[]>([])
  const [valuations, setValuations] = useState<ValuationRow[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [sales, setSales] = useState<SaleRow[]>([])
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => setActive(isBusinessRoute())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setMessage(`Business workspace unavailable: ${result.error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(result.data.id)
    })()
    return () => { cancelled = true }
  }, [active])

  async function load() {
    if (!workspaceId || !active) return
    setLoading(true)
    const [itemResult, valuationResult, costResult, saleResult, offerResult] = await Promise.all([
      supabase.from('items').select('id,item_number,title,type,purpose,status,acquired_at,created_at').eq('workspace_id', workspaceId).is('archived_at', null).order('item_number', { ascending: false }),
      supabase.from('valuations').select('id,item_id,low_value,expected_value,high_value,target_value,minimum_value,currency,confidence,basis,valued_at').eq('workspace_id', workspaceId).order('valued_at', { ascending: false }),
      supabase.from('cost_entries').select('id,item_id,work_id,category,amount,currency,incurred_at,notes').eq('workspace_id', workspaceId).order('incurred_at', { ascending: false }),
      supabase.from('sales').select('id,item_id,status,channel,listing_title,asking_price,sale_price,currency,listed_at,sold_at,marketplace_fees,shipping_to_buyer').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabase.from('offers').select('id,item_id,sale_id,amount,currency,buyer,source,status,offered_at').eq('workspace_id', workspaceId).order('offered_at', { ascending: false }),
    ])
    setLoading(false)

    const error = itemResult.error ?? valuationResult.error ?? costResult.error ?? saleResult.error ?? offerResult.error
    if (error) {
      setMessage(`Business data could not be loaded: ${error.message}`)
      return
    }

    setItems((itemResult.data ?? []) as ItemRow[])
    setValuations((valuationResult.data ?? []) as ValuationRow[])
    setCosts((costResult.data ?? []) as CostRow[])
    setSales((saleResult.data ?? []) as SaleRow[])
    setOffers((offerResult.data ?? []) as OfferRow[])
    setMessage('')
  }

  useEffect(() => { if (active && workspaceId) void load() }, [active, workspaceId])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const latestValuation = useMemo(() => {
    const map = new Map<string, ValuationRow>()
    for (const row of valuations) if (!map.has(row.item_id)) map.set(row.item_id, row)
    return map
  }, [valuations])

  const latestSale = useMemo(() => {
    const map = new Map<string, SaleRow>()
    for (const row of sales) if (!map.has(row.item_id)) map.set(row.item_id, row)
    return map
  }, [sales])

  const costsByItem = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of costs) {
      if (row.currency !== 'AUD') continue
      map.set(row.item_id, (map.get(row.item_id) ?? 0) + Number(row.amount || 0))
    }
    return map
  }, [costs])

  const stockRows = useMemo(() => items.filter((item) => item.status !== 'sold').map((item) => {
    const valuation = latestValuation.get(item.id) ?? null
    const cost = costsByItem.get(item.id) ?? 0
    const target = valuation?.currency === 'AUD' ? valuation.target_value : null
    const expected = valuation?.currency === 'AUD' ? valuation.expected_value : null
    return {
      item,
      valuation,
      cost,
      target,
      expected,
      potential: target == null ? null : Number(target) - cost,
      age: daysOld(item.acquired_at || item.created_at),
    }
  }), [items, latestValuation, costsByItem])

  const soldRows = useMemo(() => items.filter((item) => item.status === 'sold' || latestSale.get(item.id)?.status === 'sold').map((item) => {
    const sale = latestSale.get(item.id) ?? null
    const cost = costsByItem.get(item.id) ?? 0
    const salePrice = sale?.currency === 'AUD' ? sale.sale_price : null
    const fees = sale?.currency === 'AUD' ? Number(sale.marketplace_fees || 0) + Number(sale.shipping_to_buyer || 0) : 0
    const net = salePrice == null ? null : Number(salePrice) - fees
    return { item, sale, cost, net, profit: net == null ? null : net - cost }
  }), [items, latestSale, costsByItem])

  const invested = stockRows.reduce((sum, row) => sum + row.cost, 0)
  const targetValue = stockRows.reduce((sum, row) => sum + (row.target == null ? 0 : Number(row.target)), 0)
  const expectedValue = stockRows.reduce((sum, row) => sum + (row.expected == null ? 0 : Number(row.expected)), 0)
  const potentialGross = targetValue - invested
  const readyCount = items.filter((item) => item.status === 'ready_for_sale').length
  const listedCount = items.filter((item) => item.status === 'listed' || latestSale.get(item.id)?.status === 'listed').length
  const needsValuation = stockRows.filter((row) => !row.valuation).length
  const agedStock = stockRows.filter((row) => row.age >= 90).length
  const soldRevenue = soldRows.reduce((sum, row) => sum + (row.sale?.currency === 'AUD' && row.sale.sale_price != null ? Number(row.sale.sale_price) : 0), 0)
  const realisedProfit = soldRows.reduce((sum, row) => sum + (row.profit ?? 0), 0)
  const activeOffers = offers.filter((offer) => ['received', 'countered', 'pending'].includes(offer.status)).length

  function openItem(itemId: string) {
    window.location.hash = `#/items/${encodeURIComponent(itemId)}`
  }

  if (!active) return null

  return (
    <main className="business-v2-page">
      <header className="business-v2-heading">
        <div>
          <p className="eyebrow">BUSINESS</p>
          <h1>Business</h1>
          <p className="muted">Stock value, direct Item economics, listings, sales and realised profit — without mixing workshop records into the finance view.</p>
        </div>
        <button type="button" className="secondary" onClick={() => { window.location.hash = '#/intake' }}>Open Intake</button>
      </header>

      <nav className="business-v2-tabs" aria-label="Business views">
        {([
          ['overview', 'Overview'],
          ['stock', 'Stock'],
          ['listings', 'Listings'],
          ['sales', 'Sales'],
          ['costs', 'Costs'],
        ] as const).map(([key, label]) => <button key={key} type="button" className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}
      </nav>

      {message && <p className="business-v2-message">{message}</p>}
      {loading && <div className="loading-card">Loading business data…</div>}

      {!loading && view === 'overview' && (
        <div className="business-v2-stack">
          <section className="business-v2-metrics" aria-label="Business summary">
            <div><span>Stock invested</span><strong>{money(invested)}</strong><small>Recorded AUD Item costs</small></div>
            <div><span>Target value</span><strong>{money(targetValue)}</strong><small>{stockRows.filter((row) => row.target != null).length} valued Items</small></div>
            <div><span>Potential gross</span><strong>{money(potentialGross)}</strong><small>Target less recorded costs</small></div>
            <div><span>Realised profit</span><strong>{money(realisedProfit)}</strong><small>{soldRows.length} sold Item{soldRows.length === 1 ? '' : 's'}</small></div>
          </section>

          <section className="business-v2-attention">
            <button type="button" onClick={() => setView('stock')}><span>Ready to sell</span><strong>{readyCount}</strong><small>Items ready for listing</small></button>
            <button type="button" onClick={() => setView('stock')}><span>Needs valuation</span><strong>{needsValuation}</strong><small>Stock without a valuation</small></button>
            <button type="button" onClick={() => setView('stock')}><span>90+ day stock</span><strong>{agedStock}</strong><small>Worth reviewing</small></button>
            <button type="button" onClick={() => setView('listings')}><span>Listed / offers</span><strong>{listedCount} / {activeOffers}</strong><small>Live sales activity</small></button>
          </section>

          <div className="business-v2-grid">
            <section className="section-card business-v2-panel">
              <div className="business-v2-panel-heading"><div><p className="eyebrow">STOCK POSITION</p><h2>Highest potential</h2></div><button type="button" className="text-button" onClick={() => setView('stock')}>All stock →</button></div>
              <div className="business-v2-list">
                {[...stockRows].sort((a, b) => (b.potential ?? -Infinity) - (a.potential ?? -Infinity)).slice(0, 6).map((row) => (
                  <button type="button" className="business-v2-row" key={row.item.id} onClick={() => openItem(row.item.id)}>
                    <span className="business-v2-item-number">#{row.item.item_number}</span>
                    <span className="business-v2-row-main"><strong>{row.item.title}</strong><small>{titleCase(row.item.status)} · {row.age} days</small></span>
                    <span className="business-v2-row-money"><strong>{money(row.target)}</strong><small>{row.potential == null ? 'No target' : `${money(row.potential)} gross`}</small></span>
                  </button>
                ))}
                {stockRows.length === 0 && <p className="muted">No active stock yet.</p>}
              </div>
            </section>

            <section className="section-card business-v2-panel">
              <div className="business-v2-panel-heading"><div><p className="eyebrow">SALES</p><h2>Commercial position</h2></div><button type="button" className="text-button" onClick={() => setView('sales')}>Sales →</button></div>
              <dl className="business-v2-facts">
                <div><dt>Expected stock value</dt><dd>{money(expectedValue)}</dd></div>
                <div><dt>Currently listed</dt><dd>{listedCount}</dd></div>
                <div><dt>Sold revenue</dt><dd>{money(soldRevenue)}</dd></div>
                <div><dt>Open offers</dt><dd>{activeOffers}</dd></div>
              </dl>
              <p className="business-v2-note">Item economics and whole-business cash flow are intentionally separate. A true ledger can sit beside this without double-counting stock or parts.</p>
            </section>
          </div>
        </div>
      )}

      {!loading && view === 'stock' && (
        <section className="section-card business-v2-table-card">
          <div className="business-v2-panel-heading"><div><p className="eyebrow">STOCK</p><h2>Item economics</h2></div><span>{stockRows.length} active</span></div>
          <div className="business-v2-table business-v2-stock-table">
            <div className="business-v2-table-head"><span>Item</span><span>Status</span><span>Invested</span><span>Target</span><span>Potential</span><span>Age</span></div>
            {[...stockRows].sort((a, b) => b.age - a.age).map((row) => (
              <button type="button" className="business-v2-table-row" key={row.item.id} onClick={() => openItem(row.item.id)}>
                <span><strong>#{row.item.item_number} · {row.item.title}</strong><small>{titleCase(row.item.type)} · {titleCase(row.item.purpose)}</small></span>
                <span><span className={`status-pill status-${row.item.status}`}>{titleCase(row.item.status)}</span></span>
                <span>{money(row.cost)}</span>
                <span>{money(row.target)}</span>
                <span className={row.potential != null && row.potential < 0 ? 'negative' : ''}>{money(row.potential)}</span>
                <span>{row.age}d</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!loading && view === 'listings' && (
        <section className="section-card business-v2-table-card">
          <div className="business-v2-panel-heading"><div><p className="eyebrow">LISTINGS</p><h2>Current sales activity</h2></div><span>{sales.filter((sale) => sale.status !== 'sold').length} records</span></div>
          <div className="business-v2-card-list">
            {sales.filter((sale) => sale.status !== 'sold').map((sale) => {
              const item = itemById.get(sale.item_id)
              const saleOffers = offers.filter((offer) => offer.sale_id === sale.id || offer.item_id === sale.item_id)
              return (
                <button type="button" className="business-v2-sale-card" key={sale.id} onClick={() => openItem(sale.item_id)}>
                  <div><span>{item ? `Item #${item.item_number}` : 'Item'}</span><strong>{sale.listing_title || item?.title || 'Untitled listing'}</strong><small>{sale.channel || 'Channel not set'} · {titleCase(sale.status)}</small></div>
                  <div><strong>{money(sale.asking_price, sale.currency)}</strong><small>{saleOffers.length} offer{saleOffers.length === 1 ? '' : 's'}</small></div>
                </button>
              )
            })}
            {sales.filter((sale) => sale.status !== 'sold').length === 0 && <div className="business-v2-empty"><strong>No listing records yet.</strong><span>Listing and sale records will appear here without turning Business into another Item editor.</span></div>}
          </div>
        </section>
      )}

      {!loading && view === 'sales' && (
        <section className="section-card business-v2-table-card">
          <div className="business-v2-panel-heading"><div><p className="eyebrow">SALES</p><h2>Realised results</h2></div><span>{soldRows.length} sold</span></div>
          <div className="business-v2-table business-v2-sales-table">
            <div className="business-v2-table-head"><span>Item</span><span>Sold for</span><span>Net proceeds</span><span>Recorded cost</span><span>Profit</span></div>
            {soldRows.map((row) => (
              <button type="button" className="business-v2-table-row" key={row.item.id} onClick={() => openItem(row.item.id)}>
                <span><strong>#{row.item.item_number} · {row.item.title}</strong><small>{row.sale?.channel || 'Channel not recorded'}</small></span>
                <span>{money(row.sale?.sale_price, row.sale?.currency || 'AUD')}</span>
                <span>{money(row.net)}</span>
                <span>{money(row.cost)}</span>
                <span className={row.profit != null && row.profit < 0 ? 'negative' : ''}>{money(row.profit)}</span>
              </button>
            ))}
          </div>
          {soldRows.length === 0 && <div className="business-v2-empty"><strong>No completed sales yet.</strong><span>Realised profit will stay separate from projected stock profit.</span></div>}
        </section>
      )}

      {!loading && view === 'costs' && (
        <section className="section-card business-v2-table-card">
          <div className="business-v2-panel-heading"><div><p className="eyebrow">DIRECT ITEM COSTS</p><h2>Where the money is going</h2></div><span>{costs.length} entries</span></div>
          <div className="business-v2-cost-summary">
            {Array.from(costs.reduce((map, cost) => {
              const key = `${cost.category}|${cost.currency}`
              map.set(key, (map.get(key) ?? 0) + Number(cost.amount || 0))
              return map
            }, new Map<string, number>())).sort((a, b) => b[1] - a[1]).map(([key, total]) => {
              const [category, currency] = key.split('|')
              return <div key={key}><span>{titleCase(category)}</span><strong>{money(total, currency)}</strong></div>
            })}
          </div>
          <div className="business-v2-card-list">
            {costs.map((cost) => {
              const item = itemById.get(cost.item_id)
              return (
                <button type="button" className="business-v2-cost-row" key={cost.id} onClick={() => openItem(cost.item_id)}>
                  <span><strong>{titleCase(cost.category)}</strong><small>{item ? `#${item.item_number} · ${item.title}` : 'Item unavailable'}{cost.notes ? ` · ${cost.notes}` : ''}</small></span>
                  <span><strong>{money(cost.amount, cost.currency)}</strong><small>{new Date(cost.incurred_at).toLocaleDateString('en-AU')}</small></span>
                </button>
              )
            })}
            {costs.length === 0 && <div className="business-v2-empty"><strong>No direct costs recorded yet.</strong><span>Purchase, parts, straps, crystals, external service, packaging and postage will roll up here.</span></div>}
          </div>
        </section>
      )}
    </main>
  )
}
