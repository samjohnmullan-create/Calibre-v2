import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import BusinessLedgerPanel from './BusinessLedgerPanel'

type BusinessView = 'overview' | 'stock' | 'listings' | 'sales' | 'ledger' | 'costs'

type BusinessSummary = {
  stock_count: number
  stock_invested_aud: number
  target_value_aud: number
  expected_value_aud: number
  potential_gross_aud: number
  valued_stock_count: number
  ready_count: number
  listed_count: number
  needs_valuation_count: number
  aged_stock_count: number
  sold_count: number
  sold_revenue_aud: number
  realised_profit_aud: number
  active_offer_count: number
}

type EconomicsRow = {
  workspace_id: string
  item_id: string
  item_number: number
  title: string
  type: string
  purpose: string
  status: string
  acquired_at: string | null
  created_at: string
  invested_aud: number
  valuation_id: string | null
  expected_value: number | null
  target_value: number | null
  valuation_currency: string | null
  sale_id: string | null
  sale_status: string | null
  channel: string | null
  listing_title: string | null
  asking_price: number | null
  sale_price: number | null
  sale_currency: string | null
  listed_at: string | null
  sold_at: string | null
  marketplace_fees: number | null
  shipping_to_buyer: number | null
  net_proceeds_aud: number | null
  realised_profit_aud: number | null
  potential_profit_aud: number | null
  age_days: number
}

type ItemLookup = { id: string; item_number: number; title: string }

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

type OfferRow = { id: string; item_id: string; sale_id: string | null }

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

type CostSummaryRow = { category: string; currency: string; total_amount: number; entry_count: number }

const STOCK_PAGE_SIZE = 40
const LISTING_PAGE_SIZE = 30
const SALES_PAGE_SIZE = 30
const COST_PAGE_SIZE = 40

const emptySummary: BusinessSummary = {
  stock_count: 0,
  stock_invested_aud: 0,
  target_value_aud: 0,
  expected_value_aud: 0,
  potential_gross_aud: 0,
  valued_stock_count: 0,
  ready_count: 0,
  listed_count: 0,
  needs_valuation_count: 0,
  aged_stock_count: 0,
  sold_count: 0,
  sold_revenue_aud: 0,
  realised_profit_aud: 0,
  active_offer_count: 0,
}

function isBusinessRoute() {
  return window.location.hash.replace(/\/$/, '') === '#/business'
}

function titleCase(value: string | null | undefined) {
  return (value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value))
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSummary(row: Record<string, unknown> | null | undefined): BusinessSummary {
  if (!row) return emptySummary
  return {
    stock_count: asNumber(row.stock_count),
    stock_invested_aud: asNumber(row.stock_invested_aud),
    target_value_aud: asNumber(row.target_value_aud),
    expected_value_aud: asNumber(row.expected_value_aud),
    potential_gross_aud: asNumber(row.potential_gross_aud),
    valued_stock_count: asNumber(row.valued_stock_count),
    ready_count: asNumber(row.ready_count),
    listed_count: asNumber(row.listed_count),
    needs_valuation_count: asNumber(row.needs_valuation_count),
    aged_stock_count: asNumber(row.aged_stock_count),
    sold_count: asNumber(row.sold_count),
    sold_revenue_aud: asNumber(row.sold_revenue_aud),
    realised_profit_aud: asNumber(row.realised_profit_aud),
    active_offer_count: asNumber(row.active_offer_count),
  }
}

function Pager({ page, count, pageSize, onPage }: { page: number; count: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (count <= pageSize) return null
  return (
    <div className="business-v2-pager">
      <button type="button" className="secondary small" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Previous</button>
      <span>Page {page} of {pages} · {count} records</span>
      <button type="button" className="secondary small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  )
}

export default function BusinessRoute() {
  const [active, setActive] = useState(isBusinessRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [view, setView] = useState<BusinessView>('overview')
  const [summary, setSummary] = useState<BusinessSummary>(emptySummary)
  const [overviewRows, setOverviewRows] = useState<EconomicsRow[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [stockRows, setStockRows] = useState<EconomicsRow[]>([])
  const [stockCount, setStockCount] = useState(0)
  const [stockPage, setStockPage] = useState(1)

  const [listingRows, setListingRows] = useState<SaleRow[]>([])
  const [listingCount, setListingCount] = useState(0)
  const [listingPage, setListingPage] = useState(1)
  const [listingItems, setListingItems] = useState<Map<string, ItemLookup>>(new Map())
  const [listingOffers, setListingOffers] = useState<Map<string, number>>(new Map())

  const [soldRows, setSoldRows] = useState<EconomicsRow[]>([])
  const [soldCount, setSoldCount] = useState(0)
  const [salesPage, setSalesPage] = useState(1)

  const [costRows, setCostRows] = useState<CostRow[]>([])
  const [costCount, setCostCount] = useState(0)
  const [costPage, setCostPage] = useState(1)
  const [costItems, setCostItems] = useState<Map<string, ItemLookup>>(new Map())
  const [costSummary, setCostSummary] = useState<CostSummaryRow[]>([])

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

  async function loadOverview() {
    if (!workspaceId || !active) return
    setOverviewLoading(true)
    const [summaryResult, potentialResult] = await Promise.all([
      supabase.rpc('business_summary', { p_workspace_id: workspaceId }),
      supabase.from('business_item_economics')
        .select('workspace_id,item_id,item_number,title,type,purpose,status,acquired_at,created_at,invested_aud,valuation_id,expected_value,target_value,valuation_currency,sale_id,sale_status,channel,listing_title,asking_price,sale_price,sale_currency,listed_at,sold_at,marketplace_fees,shipping_to_buyer,net_proceeds_aud,realised_profit_aud,potential_profit_aud,age_days')
        .eq('workspace_id', workspaceId)
        .neq('status', 'sold')
        .or('sale_status.is.null,sale_status.neq.sold')
        .order('potential_profit_aud', { ascending: false, nullsFirst: false })
        .limit(6),
    ])
    setOverviewLoading(false)
    const error = summaryResult.error ?? potentialResult.error
    if (error) {
      setMessage(`Business summary could not be loaded: ${error.message}`)
      return
    }
    setSummary(normalizeSummary((summaryResult.data?.[0] ?? null) as Record<string, unknown> | null))
    setOverviewRows((potentialResult.data ?? []) as EconomicsRow[])
    setMessage('')
  }

  async function loadStock() {
    if (!workspaceId) return
    setDetailLoading(true)
    const from = (stockPage - 1) * STOCK_PAGE_SIZE
    const result = await supabase.from('business_item_economics')
      .select('workspace_id,item_id,item_number,title,type,purpose,status,acquired_at,created_at,invested_aud,valuation_id,expected_value,target_value,valuation_currency,sale_id,sale_status,channel,listing_title,asking_price,sale_price,sale_currency,listed_at,sold_at,marketplace_fees,shipping_to_buyer,net_proceeds_aud,realised_profit_aud,potential_profit_aud,age_days', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .neq('status', 'sold')
      .or('sale_status.is.null,sale_status.neq.sold')
      .order('age_days', { ascending: false })
      .order('item_number', { ascending: false })
      .range(from, from + STOCK_PAGE_SIZE - 1)
    setDetailLoading(false)
    if (result.error) {
      setMessage(`Stock economics could not be loaded: ${result.error.message}`)
      return
    }
    setStockRows((result.data ?? []) as EconomicsRow[])
    setStockCount(result.count ?? 0)
    setMessage('')
  }

  async function loadListings() {
    if (!workspaceId) return
    setDetailLoading(true)
    const from = (listingPage - 1) * LISTING_PAGE_SIZE
    const result = await supabase.from('sales')
      .select('id,item_id,status,channel,listing_title,asking_price,sale_price,currency,listed_at,sold_at,marketplace_fees,shipping_to_buyer', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .neq('status', 'sold')
      .order('created_at', { ascending: false })
      .range(from, from + LISTING_PAGE_SIZE - 1)

    if (result.error) {
      setDetailLoading(false)
      setMessage(`Listings could not be loaded: ${result.error.message}`)
      return
    }

    const rows = (result.data ?? []) as SaleRow[]
    const itemIds = [...new Set(rows.map((row) => row.item_id))]
    const saleIds = rows.map((row) => row.id)
    const [itemsResult, offersResult] = await Promise.all([
      itemIds.length
        ? supabase.from('items').select('id,item_number,title').eq('workspace_id', workspaceId).in('id', itemIds)
        : Promise.resolve({ data: [], error: null }),
      saleIds.length
        ? supabase.from('offers').select('id,item_id,sale_id').eq('workspace_id', workspaceId).in('sale_id', saleIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    setDetailLoading(false)
    const relatedError = itemsResult.error ?? offersResult.error
    if (relatedError) {
      setMessage(`Listing details could not be loaded: ${relatedError.message}`)
      return
    }

    const itemMap = new Map<string, ItemLookup>()
    ;((itemsResult.data ?? []) as ItemLookup[]).forEach((item) => itemMap.set(item.id, item))
    const offerMap = new Map<string, number>()
    ;((offersResult.data ?? []) as OfferRow[]).forEach((offer) => {
      if (!offer.sale_id) return
      offerMap.set(offer.sale_id, (offerMap.get(offer.sale_id) ?? 0) + 1)
    })
    setListingRows(rows)
    setListingCount(result.count ?? 0)
    setListingItems(itemMap)
    setListingOffers(offerMap)
    setMessage('')
  }

  async function loadSales() {
    if (!workspaceId) return
    setDetailLoading(true)
    const from = (salesPage - 1) * SALES_PAGE_SIZE
    const result = await supabase.from('business_item_economics')
      .select('workspace_id,item_id,item_number,title,type,purpose,status,acquired_at,created_at,invested_aud,valuation_id,expected_value,target_value,valuation_currency,sale_id,sale_status,channel,listing_title,asking_price,sale_price,sale_currency,listed_at,sold_at,marketplace_fees,shipping_to_buyer,net_proceeds_aud,realised_profit_aud,potential_profit_aud,age_days', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .or('status.eq.sold,sale_status.eq.sold')
      .order('sold_at', { ascending: false, nullsFirst: false })
      .order('item_number', { ascending: false })
      .range(from, from + SALES_PAGE_SIZE - 1)
    setDetailLoading(false)
    if (result.error) {
      setMessage(`Sales could not be loaded: ${result.error.message}`)
      return
    }
    setSoldRows((result.data ?? []) as EconomicsRow[])
    setSoldCount(result.count ?? 0)
    setMessage('')
  }

  async function loadCosts() {
    if (!workspaceId) return
    setDetailLoading(true)
    const from = (costPage - 1) * COST_PAGE_SIZE
    const [costResult, summaryResult] = await Promise.all([
      supabase.from('cost_entries')
        .select('id,item_id,work_id,category,amount,currency,incurred_at,notes', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('incurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + COST_PAGE_SIZE - 1),
      supabase.rpc('business_cost_summary', { p_workspace_id: workspaceId }),
    ])

    if (costResult.error || summaryResult.error) {
      setDetailLoading(false)
      setMessage(`Item costs could not be loaded: ${(costResult.error ?? summaryResult.error)?.message}`)
      return
    }

    const rows = (costResult.data ?? []) as CostRow[]
    const itemIds = [...new Set(rows.map((row) => row.item_id))]
    const itemsResult = itemIds.length
      ? await supabase.from('items').select('id,item_number,title').eq('workspace_id', workspaceId).in('id', itemIds)
      : { data: [], error: null }
    setDetailLoading(false)
    if (itemsResult.error) {
      setMessage(`Item cost labels could not be loaded: ${itemsResult.error.message}`)
      return
    }

    const itemMap = new Map<string, ItemLookup>()
    ;((itemsResult.data ?? []) as ItemLookup[]).forEach((item) => itemMap.set(item.id, item))
    setCostRows(rows)
    setCostCount(costResult.count ?? 0)
    setCostItems(itemMap)
    setCostSummary((summaryResult.data ?? []) as CostSummaryRow[])
    setMessage('')
  }

  useEffect(() => { if (active && workspaceId) void loadOverview() }, [active, workspaceId])
  useEffect(() => { if (active && workspaceId && view === 'stock') void loadStock() }, [active, workspaceId, view, stockPage])
  useEffect(() => { if (active && workspaceId && view === 'listings') void loadListings() }, [active, workspaceId, view, listingPage])
  useEffect(() => { if (active && workspaceId && view === 'sales') void loadSales() }, [active, workspaceId, view, salesPage])
  useEffect(() => { if (active && workspaceId && view === 'costs') void loadCosts() }, [active, workspaceId, view, costPage])

  const potentialRows = useMemo(() => overviewRows.filter((row) => row.potential_profit_aud != null), [overviewRows])

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
          <p className="muted">Stock value, direct Item economics, listings, sales, realised profit and business overhead — kept separate so the numbers stay trustworthy.</p>
        </div>
        <button type="button" className="secondary" onClick={() => { window.location.hash = '#/intake' }}>Open Intake</button>
      </header>

      <nav className="business-v2-tabs" aria-label="Business views">
        {([
          ['overview', 'Overview'],
          ['stock', 'Stock'],
          ['listings', 'Listings'],
          ['sales', 'Sales'],
          ['ledger', 'Ledger'],
          ['costs', 'Item Costs'],
        ] as const).map(([key, label]) => <button key={key} type="button" className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}
      </nav>

      {message && <p className="business-v2-message">{message}</p>}
      {(overviewLoading && view === 'overview') && <div className="loading-card">Loading business summary…</div>}
      {(detailLoading && view !== 'overview' && view !== 'ledger') && <div className="loading-card">Loading business records…</div>}

      {!overviewLoading && view === 'overview' && (
        <div className="business-v2-stack">
          <section className="business-v2-metrics" aria-label="Business summary">
            <div><span>Stock invested</span><strong>{money(summary.stock_invested_aud)}</strong><small>Recorded AUD Item costs</small></div>
            <div><span>Target value</span><strong>{money(summary.target_value_aud)}</strong><small>{summary.valued_stock_count} valued Item{summary.valued_stock_count === 1 ? '' : 's'}</small></div>
            <div><span>Potential gross</span><strong>{money(summary.potential_gross_aud)}</strong><small>Target less all recorded stock costs</small></div>
            <div><span>Realised profit</span><strong>{money(summary.realised_profit_aud)}</strong><small>{summary.sold_count} sold Item{summary.sold_count === 1 ? '' : 's'}</small></div>
          </section>

          <section className="business-v2-attention">
            <button type="button" onClick={() => setView('stock')}><span>Ready to sell</span><strong>{summary.ready_count}</strong><small>Items ready for listing</small></button>
            <button type="button" onClick={() => setView('stock')}><span>Needs valuation</span><strong>{summary.needs_valuation_count}</strong><small>Stock without a valuation</small></button>
            <button type="button" onClick={() => setView('stock')}><span>90+ day stock</span><strong>{summary.aged_stock_count}</strong><small>Worth reviewing</small></button>
            <button type="button" onClick={() => setView('listings')}><span>Listed / offers</span><strong>{summary.listed_count} / {summary.active_offer_count}</strong><small>Live sales activity</small></button>
          </section>

          <div className="business-v2-grid">
            <section className="section-card business-v2-panel">
              <div className="business-v2-panel-heading"><div><p className="eyebrow">STOCK POSITION</p><h2>Highest potential</h2></div><button type="button" className="text-button" onClick={() => setView('stock')}>All stock →</button></div>
              <div className="business-v2-list">
                {potentialRows.map((row) => (
                  <button type="button" className="business-v2-row" key={row.item_id} onClick={() => openItem(row.item_id)}>
                    <span className="business-v2-item-number">#{row.item_number}</span>
                    <span className="business-v2-row-main"><strong>{row.title}</strong><small>{titleCase(row.status)} · {row.age_days} days</small></span>
                    <span className="business-v2-row-money"><strong>{money(row.target_value)}</strong><small>{money(row.potential_profit_aud)} gross</small></span>
                  </button>
                ))}
                {potentialRows.length === 0 && <p className="muted">No valued active stock yet.</p>}
              </div>
            </section>

            <section className="section-card business-v2-panel">
              <div className="business-v2-panel-heading"><div><p className="eyebrow">SALES</p><h2>Commercial position</h2></div><button type="button" className="text-button" onClick={() => setView('sales')}>Sales →</button></div>
              <dl className="business-v2-facts">
                <div><dt>Expected stock value</dt><dd>{money(summary.expected_value_aud)}</dd></div>
                <div><dt>Currently listed</dt><dd>{summary.listed_count}</dd></div>
                <div><dt>Sold revenue</dt><dd>{money(summary.sold_revenue_aud)}</dd></div>
                <div><dt>Open offers</dt><dd>{summary.active_offer_count}</dd></div>
              </dl>
              <p className="business-v2-note">Business totals now calculate in Postgres instead of downloading every historical Item, cost, valuation, sale and offer to the phone.</p>
              <button type="button" className="text-button" onClick={() => setView('ledger')}>Open Business Ledger →</button>
            </section>
          </div>
        </div>
      )}

      {!detailLoading && view === 'stock' && (
        <section className="section-card business-v2-table-card">
          <div className="business-v2-panel-heading"><div><p className="eyebrow">STOCK</p><h2>Item economics</h2></div><span>{stockCount} active</span></div>
          <div className="business-v2-table business-v2-stock-table">
            <div className="business-v2-table-head"><span>Item</span><span>Status</span><span>Invested</span><span>Target</span><span>Potential</span><span>Age</span></div>
            {stockRows.map((row) => (
              <button type="button" className="business-v2-table-row" key={row.item_id} onClick={() => openItem(row.item_id)}>
                <span><strong>#{row.item_number} · {row.title}</strong><small>{titleCase(row.type)} · {titleCase(row.purpose)}</small></span>
                <span><span className={`status-pill status-${row.status}`}>{titleCase(row.status)}</span></span>
                <span>{money(row.invested_aud)}</span>
                <span>{row.valuation_currency === 'AUD' ? money(row.target_value) : '—'}</span>
                <span className={row.potential_profit_aud != null && Number(row.potential_profit_aud) < 0 ? 'negative' : ''}>{money(row.potential_profit_aud)}</span>
                <span>{row.age_days}d</span>
              </button>
            ))}
          </div>
          {stockRows.length === 0 && <div className="business-v2-empty"><strong>No active stock.</strong><span>New Items will appear here as they enter inventory.</span></div>}
          <Pager page={stockPage} count={stockCount} pageSize={STOCK_PAGE_SIZE} onPage={setStockPage} />
        </section>
      )}

      {!detailLoading && view === 'listings' && (
        <section className="section-card business-v2-table-card">
          <div className="business-v2-panel-heading"><div><p className="eyebrow">LISTINGS</p><h2>Current sales activity</h2></div><span>{listingCount} records</span></div>
          <div className="business-v2-card-list">
            {listingRows.map((sale) => {
              const item = listingItems.get(sale.item_id)
              const offerCount = listingOffers.get(sale.id) ?? 0
              return (
                <button type="button" className="business-v2-sale-card" key={sale.id} onClick={() => openItem(sale.item_id)}>
                  <div><span>{item ? `Item #${item.item_number}` : 'Item'}</span><strong>{sale.listing_title || item?.title || 'Untitled listing'}</strong><small>{sale.channel || 'Channel not set'} · {titleCase(sale.status)}</small></div>
                  <div><strong>{money(sale.asking_price, sale.currency)}</strong><small>{offerCount} offer{offerCount === 1 ? '' : 's'}</small></div>
                </button>
              )
            })}
            {listingRows.length === 0 && <div className="business-v2-empty"><strong>No listing records yet.</strong><span>Listing and sale records will appear here without turning Business into another Item editor.</span></div>}
          </div>
          <Pager page={listingPage} count={listingCount} pageSize={LISTING_PAGE_SIZE} onPage={setListingPage} />
        </section>
      )}

      {!detailLoading && view === 'sales' && (
        <section className="section-card business-v2-table-card">
          <div className="business-v2-panel-heading"><div><p className="eyebrow">SALES</p><h2>Realised results</h2></div><span>{soldCount} sold</span></div>
          <div className="business-v2-table business-v2-sales-table">
            <div className="business-v2-table-head"><span>Item</span><span>Sold for</span><span>Net proceeds</span><span>Recorded cost</span><span>Profit</span></div>
            {soldRows.map((row) => (
              <button type="button" className="business-v2-table-row" key={row.item_id} onClick={() => openItem(row.item_id)}>
                <span><strong>#{row.item_number} · {row.title}</strong><small>{row.channel || 'Channel not recorded'}</small></span>
                <span>{money(row.sale_price, row.sale_currency || 'AUD')}</span>
                <span>{money(row.net_proceeds_aud)}</span>
                <span>{money(row.invested_aud)}</span>
                <span className={row.realised_profit_aud != null && Number(row.realised_profit_aud) < 0 ? 'negative' : ''}>{money(row.realised_profit_aud)}</span>
              </button>
            ))}
          </div>
          {soldRows.length === 0 && <div className="business-v2-empty"><strong>No completed sales yet.</strong><span>Realised profit will stay separate from projected stock profit.</span></div>}
          <Pager page={salesPage} count={soldCount} pageSize={SALES_PAGE_SIZE} onPage={setSalesPage} />
        </section>
      )}

      {view === 'ledger' && <BusinessLedgerPanel workspaceId={workspaceId} />}

      {!detailLoading && view === 'costs' && (
        <section className="section-card business-v2-table-card">
          <div className="business-v2-panel-heading"><div><p className="eyebrow">DIRECT ITEM COSTS</p><h2>Where the money is going</h2></div><span>{costCount} entries</span></div>
          <div className="business-v2-cost-summary">
            {costSummary.map((row) => <div key={`${row.category}|${row.currency}`}><span>{titleCase(row.category)}</span><strong>{money(row.total_amount, row.currency)}</strong></div>)}
          </div>
          <div className="business-v2-card-list">
            {costRows.map((cost) => {
              const item = costItems.get(cost.item_id)
              return (
                <button type="button" className="business-v2-cost-row" key={cost.id} onClick={() => openItem(cost.item_id)}>
                  <span><strong>{titleCase(cost.category)}</strong><small>{item ? `#${item.item_number} · ${item.title}` : 'Item unavailable'}{cost.notes ? ` · ${cost.notes}` : ''}</small></span>
                  <span><strong>{money(cost.amount, cost.currency)}</strong><small>{new Date(cost.incurred_at).toLocaleDateString('en-AU')}</small></span>
                </button>
              )
            })}
            {costRows.length === 0 && <div className="business-v2-empty"><strong>No direct costs recorded yet.</strong><span>Purchase, parts, straps, crystals, external service, packaging and postage will roll up here.</span></div>}
          </div>
          <Pager page={costPage} count={costCount} pageSize={COST_PAGE_SIZE} onPage={setCostPage} />
        </section>
      )}
    </main>
  )
}
