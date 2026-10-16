import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import BusinessDeeperAnalytics from './BusinessDeeperAnalytics'
import './business-finance-v4.css'

type FinanceSummary = {
  active_items: number
  stock_capital_aud: number
  stock_target_value_aud: number
  stock_potential_profit_aud: number
  stock_bench_hours: number
  aged_capital_aud: number
  sold_items: number
  realised_profit_before_labour_aud: number
  sold_bench_hours: number
  realised_profit_per_bench_hour_aud: number | null
  missing_conversion_count: number
}

type FinanceRow = {
  item_id: string
  item_number: number
  title: string
  status: string
  age_days: number
  direct_cost_aud: number
  used_parts_cost_aud: number
  capital_invested_aud: number
  bench_hours: number
  target_value: number | null
  valuation_currency: string | null
  net_proceeds_aud: number | null
  realised_profit_before_labour_aud: number | null
  realised_profit_per_bench_hour_aud: number | null
  potential_profit_before_labour_aud: number | null
  potential_profit_per_bench_hour_aud: number | null
  capital_return_pct: number | null
  unconverted_direct_cost_count: number
  unconverted_part_cost_count: number
}

const emptySummary: FinanceSummary = {
  active_items: 0,
  stock_capital_aud: 0,
  stock_target_value_aud: 0,
  stock_potential_profit_aud: 0,
  stock_bench_hours: 0,
  aged_capital_aud: 0,
  sold_items: 0,
  realised_profit_before_labour_aud: 0,
  sold_bench_hours: 0,
  realised_profit_per_bench_hour_aud: null,
  missing_conversion_count: 0,
}

function isRoute() {
  return window.location.hash.replace(/\/$/, '') === '#/business/finance'
}

function num(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSummary(row: Record<string, unknown> | null | undefined): FinanceSummary {
  if (!row) return emptySummary
  return {
    active_items: num(row.active_items),
    stock_capital_aud: num(row.stock_capital_aud),
    stock_target_value_aud: num(row.stock_target_value_aud),
    stock_potential_profit_aud: num(row.stock_potential_profit_aud),
    stock_bench_hours: num(row.stock_bench_hours),
    aged_capital_aud: num(row.aged_capital_aud),
    sold_items: num(row.sold_items),
    realised_profit_before_labour_aud: num(row.realised_profit_before_labour_aud),
    sold_bench_hours: num(row.sold_bench_hours),
    realised_profit_per_bench_hour_aud: row.realised_profit_per_bench_hour_aud == null ? null : num(row.realised_profit_per_bench_hour_aud),
    missing_conversion_count: num(row.missing_conversion_count),
  }
}

function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(Number(value))
}

function hours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(Number(value) >= 10 ? 1 : 2)}h`
}

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(0)}%`
}

function openItem(itemId: string) {
  window.location.hash = `#/items/${encodeURIComponent(itemId)}`
}

export default function BusinessFinanceRoute() {
  const [active, setActive] = useState(isRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [summary, setSummary] = useState<FinanceSummary>(emptySummary)
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => setActive(isRoute())
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

  useEffect(() => {
    if (!active || !workspaceId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [summaryResult, rowsResult] = await Promise.all([
        supabase.rpc('business_finance_summary', { p_workspace_id: workspaceId }),
        supabase.from('business_item_finance')
          .select('item_id,item_number,title,status,age_days,direct_cost_aud,used_parts_cost_aud,capital_invested_aud,bench_hours,target_value,valuation_currency,net_proceeds_aud,realised_profit_before_labour_aud,realised_profit_per_bench_hour_aud,potential_profit_before_labour_aud,potential_profit_per_bench_hour_aud,capital_return_pct,unconverted_direct_cost_count,unconverted_part_cost_count')
          .eq('workspace_id', workspaceId)
          .order('capital_invested_aud', { ascending: false })
          .limit(100),
      ])
      if (cancelled) return
      setLoading(false)
      const error = summaryResult.error ?? rowsResult.error
      if (error) {
        setMessage(`Finance intelligence could not load: ${error.message}`)
        return
      }
      setSummary(normalizeSummary((summaryResult.data?.[0] ?? null) as Record<string, unknown> | null))
      setRows((rowsResult.data ?? []) as FinanceRow[])
      setMessage('')
    })()
    return () => { cancelled = true }
  }, [active, workspaceId])

  const activeRows = useMemo(() => rows.filter((row) => row.status !== 'sold' && row.net_proceeds_aud == null), [rows])
  const bestReturn = useMemo(() => activeRows.filter((row) => row.potential_profit_before_labour_aud != null).sort((a, b) => num(b.capital_return_pct) - num(a.capital_return_pct)).slice(0, 5), [activeRows])
  const benchHeavy = useMemo(() => [...rows].filter((row) => num(row.bench_hours) > 0).sort((a, b) => num(b.bench_hours) - num(a.bench_hours)).slice(0, 5), [rows])
  const capitalHeavy = useMemo(() => [...activeRows].sort((a, b) => num(b.capital_invested_aud) - num(a.capital_invested_aud)).slice(0, 5), [activeRows])

  if (!active) return null

  return <main className="finance-v4-page">
    <header className="finance-v4-heading">
      <div>
        <p className="eyebrow">BUSINESS INTELLIGENCE · PHASE 4</p>
        <h1>Finance intelligence</h1>
        <p>One deterministic view of capital, parts cost, bench time, valuation and realised sale performance. Business overhead stays separate from Item economics.</p>
      </div>
      <div className="finance-v4-heading-actions">
        <button type="button" className="secondary" onClick={() => { window.location.hash = '#/business' }}>Business records</button>
        <button type="button" className="secondary" onClick={() => { window.location.hash = '#/workbench' }}>Workbench</button>
      </div>
    </header>

    {message && <p className="business-v2-message">{message}</p>}
    {loading && <div className="loading-card">Calculating finance intelligence…</div>}

    {!loading && <>
      <section className="finance-v4-metrics" aria-label="Finance summary">
        <div><span>Capital in active stock</span><strong>{money(summary.stock_capital_aud)}</strong><small>{summary.active_items} active Items</small></div>
        <div><span>Target stock value</span><strong>{money(summary.stock_target_value_aud)}</strong><small>{money(summary.stock_potential_profit_aud)} projected margin before labour</small></div>
        <div><span>Bench time in stock</span><strong>{hours(summary.stock_bench_hours)}</strong><small>Paused time excluded</small></div>
        <div><span>Capital 90+ days</span><strong>{money(summary.aged_capital_aud)}</strong><small>Cash tied up in older stock</small></div>
        <div><span>Realised profit</span><strong>{money(summary.realised_profit_before_labour_aud)}</strong><small>{summary.sold_items} sold Items</small></div>
        <div><span>Realised profit / bench hour</span><strong>{money(summary.realised_profit_per_bench_hour_aud)}</strong><small>{hours(summary.sold_bench_hours)} recorded on sold stock</small></div>
      </section>

      {summary.missing_conversion_count > 0 && <div className="finance-v4-warning"><strong>{summary.missing_conversion_count} cost line{summary.missing_conversion_count === 1 ? '' : 's'} not included in AUD totals</strong><span>Those records are in another currency without a canonical AUD conversion. Calibre will not guess an exchange rate.</span></div>}

      <section className="finance-v4-principle">
        <div><span>DIRECT ITEM COST</span><strong>Recorded Item costs + consumed stock parts</strong></div>
        <div><span>LABOUR</span><strong>Measured as bench time, not an invented wage</strong></div>
        <div><span>OVERHEAD</span><strong>Tools, subscriptions and business expenses stay in the Ledger</strong></div>
      </section>

      <div className="finance-v4-grid">
        <section className="section-card finance-v4-card">
          <div className="finance-v4-card-heading"><div><p className="eyebrow">CAPITAL EFFICIENCY</p><h2>Best projected return</h2></div><span>Before labour</span></div>
          <div className="finance-v4-list">
            {bestReturn.map((row) => <button type="button" key={row.item_id} onClick={() => openItem(row.item_id)}>
              <span><strong>#{row.item_number} · {row.title}</strong><small>{money(row.capital_invested_aud)} invested · {hours(row.bench_hours)} bench</small></span>
              <span><strong>{pct(row.capital_return_pct)}</strong><small>{money(row.potential_profit_before_labour_aud)} margin</small></span>
            </button>)}
            {!bestReturn.length && <p className="muted">Add target valuations to active stock to rank capital return.</p>}
          </div>
        </section>

        <section className="section-card finance-v4-card">
          <div className="finance-v4-card-heading"><div><p className="eyebrow">TIME ECONOMICS</p><h2>Most bench-intensive</h2></div><span>Real Work only</span></div>
          <div className="finance-v4-list">
            {benchHeavy.map((row) => <button type="button" key={row.item_id} onClick={() => openItem(row.item_id)}>
              <span><strong>#{row.item_number} · {row.title}</strong><small>{money(row.capital_invested_aud)} capital · {row.status.replaceAll('_', ' ')}</small></span>
              <span><strong>{hours(row.bench_hours)}</strong><small>{row.potential_profit_per_bench_hour_aud != null ? `${money(row.potential_profit_per_bench_hour_aud)}/h projected` : row.realised_profit_per_bench_hour_aud != null ? `${money(row.realised_profit_per_bench_hour_aud)}/h realised` : 'Needs valuation/sale result'}</small></span>
            </button>)}
            {!benchHeavy.length && <p className="muted">Bench sessions will appear here as real workshop time is recorded.</p>}
          </div>
        </section>

        <section className="section-card finance-v4-card finance-v4-card-wide">
          <div className="finance-v4-card-heading"><div><p className="eyebrow">CAPITAL EXPOSURE</p><h2>Where cash is tied up</h2></div><span>Active stock</span></div>
          <div className="finance-v4-table">
            <div className="finance-v4-table-head"><span>Item</span><span>Direct</span><span>Parts used</span><span>Total capital</span><span>Bench</span><span>Age</span></div>
            {capitalHeavy.map((row) => <button type="button" key={row.item_id} onClick={() => openItem(row.item_id)}>
              <span><strong>#{row.item_number} · {row.title}</strong><small>{row.status.replaceAll('_', ' ')}</small></span>
              <span>{money(row.direct_cost_aud)}</span>
              <span>{money(row.used_parts_cost_aud)}</span>
              <span><strong>{money(row.capital_invested_aud)}</strong></span>
              <span>{hours(row.bench_hours)}</span>
              <span>{row.age_days}d</span>
            </button>)}
          </div>
        </section>
      </div>

      <BusinessDeeperAnalytics workspaceId={workspaceId} />

      <p className="finance-v4-footnote">Profit figures are before labour. Bench time is shown beside the money so you can judge whether a repair was actually worth doing without mixing a hypothetical wage into historical accounts.</p>
    </>}
  </main>
}
