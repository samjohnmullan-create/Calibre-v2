import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './business-deeper-analytics.css'

type AnalyticsSummary = {
  completed_work_count: number
  avg_turnaround_days: number
  median_turnaround_days: number
  avg_bench_hours_per_completed_work: number
  stale_unlisted_capital_aud: number
  stale_unlisted_items: number
  valued_active_items: number
  active_items_with_bench_time: number
}

type FinanceRow = {
  item_id: string
  item_number: number
  title: string
  status: string
  sale_status: string | null
  age_days: number
  capital_invested_aud: number
  bench_hours: number
  target_value: number | null
  valuation_currency: string | null
  realised_profit_before_labour_aud: number | null
  realised_profit_per_bench_hour_aud: number | null
  potential_profit_before_labour_aud: number | null
  potential_profit_per_bench_hour_aud: number | null
  capital_return_pct: number | null
}

const emptySummary: AnalyticsSummary = {
  completed_work_count: 0,
  avg_turnaround_days: 0,
  median_turnaround_days: 0,
  avg_bench_hours_per_completed_work: 0,
  stale_unlisted_capital_aud: 0,
  stale_unlisted_items: 0,
  valued_active_items: 0,
  active_items_with_bench_time: 0,
}

function num(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
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

function days(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(Number(value) >= 10 ? 0 : 1)}d`
}

function openItem(itemId: string) {
  window.location.hash = `#/items/${encodeURIComponent(itemId)}`
}

export default function BusinessDeeperAnalytics({ workspaceId }: { workspaceId: string }) {
  const [summary, setSummary] = useState<AnalyticsSummary>(emptySummary)
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [summaryResult, rowsResult] = await Promise.all([
        supabase.rpc('business_deeper_analytics', { p_workspace_id: workspaceId }),
        supabase.from('business_item_finance')
          .select('item_id,item_number,title,status,sale_status,age_days,capital_invested_aud,bench_hours,target_value,valuation_currency,realised_profit_before_labour_aud,realised_profit_per_bench_hour_aud,potential_profit_before_labour_aud,potential_profit_per_bench_hour_aud,capital_return_pct')
          .eq('workspace_id', workspaceId)
          .limit(250),
      ])
      if (cancelled) return
      setLoading(false)
      const error = summaryResult.error ?? rowsResult.error
      if (error) {
        setMessage(`Deeper analytics could not load: ${error.message}`)
        return
      }
      const raw = (summaryResult.data?.[0] ?? null) as Record<string, unknown> | null
      setSummary(raw ? {
        completed_work_count: num(raw.completed_work_count),
        avg_turnaround_days: num(raw.avg_turnaround_days),
        median_turnaround_days: num(raw.median_turnaround_days),
        avg_bench_hours_per_completed_work: num(raw.avg_bench_hours_per_completed_work),
        stale_unlisted_capital_aud: num(raw.stale_unlisted_capital_aud),
        stale_unlisted_items: num(raw.stale_unlisted_items),
        valued_active_items: num(raw.valued_active_items),
        active_items_with_bench_time: num(raw.active_items_with_bench_time),
      } : emptySummary)
      setRows((rowsResult.data ?? []) as FinanceRow[])
      setMessage('')
    })()
    return () => { cancelled = true }
  }, [workspaceId])

  const sold = useMemo(() => rows.filter((row) => row.status === 'sold' || row.sale_status === 'sold'), [rows])
  const active = useMemo(() => rows.filter((row) => row.status !== 'sold' && row.sale_status !== 'sold'), [rows])
  const mostProfitable = useMemo(() => [...sold].filter((row) => row.realised_profit_before_labour_aud != null).sort((a, b) => num(b.realised_profit_before_labour_aud) - num(a.realised_profit_before_labour_aud))[0] ?? null, [sold])
  const bestHourly = useMemo(() => [...sold].filter((row) => row.realised_profit_per_bench_hour_aud != null).sort((a, b) => num(b.realised_profit_per_bench_hour_aud) - num(a.realised_profit_per_bench_hour_aud))[0] ?? null, [sold])
  const worstHourly = useMemo(() => [...sold].filter((row) => row.realised_profit_per_bench_hour_aud != null).sort((a, b) => num(a.realised_profit_per_bench_hour_aud) - num(b.realised_profit_per_bench_hour_aud))[0] ?? null, [sold])
  const bestCapitalReturn = useMemo(() => [...active].filter((row) => row.capital_return_pct != null).sort((a, b) => num(b.capital_return_pct) - num(a.capital_return_pct))[0] ?? null, [active])
  const bestProjectedHourly = useMemo(() => [...active].filter((row) => row.potential_profit_per_bench_hour_aud != null).sort((a, b) => num(b.potential_profit_per_bench_hour_aud) - num(a.potential_profit_per_bench_hour_aud))[0] ?? null, [active])
  const stale = useMemo(() => [...active].filter((row) => row.age_days >= 90 && row.sale_status !== 'listed').sort((a, b) => num(b.capital_invested_aud) - num(a.capital_invested_aud)).slice(0, 5), [active])

  if (loading) return <div className="loading-card">Calculating deeper business analytics…</div>

  return <section className="biz-analytics-v4">
    <div className="biz-analytics-v4-heading">
      <div><p className="eyebrow">DEEPER ANALYTICS</p><h2>What is actually creating value?</h2><p>Profit, capital efficiency, workshop time and turnaround — separated so a high-margin watch cannot hide poor time efficiency.</p></div>
    </div>

    {message && <p className="business-v2-message">{message}</p>}

    <div className="biz-analytics-v4-metrics">
      <div><span>Completed Real Work</span><strong>{summary.completed_work_count}</strong><small>{summary.completed_work_count ? `${days(summary.avg_turnaround_days)} average turnaround` : 'Not enough completed history yet'}</small></div>
      <div><span>Median turnaround</span><strong>{summary.completed_work_count ? days(summary.median_turnaround_days) : '—'}</strong><small>Opened → completed</small></div>
      <div><span>Avg bench / completed job</span><strong>{summary.completed_work_count ? hours(summary.avg_bench_hours_per_completed_work) : '—'}</strong><small>Paused time excluded</small></div>
      <div><span>Stale unlisted capital</span><strong>{money(summary.stale_unlisted_capital_aud)}</strong><small>{summary.stale_unlisted_items} Item{summary.stale_unlisted_items === 1 ? '' : 's'} aged 90+ days</small></div>
    </div>

    <div className="biz-analytics-v4-grid">
      <article className="section-card biz-analytics-v4-winner">
        <p className="eyebrow">MOST PROFITABLE</p>
        {mostProfitable ? <button type="button" onClick={() => openItem(mostProfitable.item_id)}><strong>#{mostProfitable.item_number} · {mostProfitable.title}</strong><span>{money(mostProfitable.realised_profit_before_labour_aud)} realised before labour</span><small>{hours(mostProfitable.bench_hours)} bench · {money(mostProfitable.realised_profit_per_bench_hour_aud)}/h</small></button> : <div className="biz-analytics-v4-empty"><strong>No completed sales yet.</strong><span>This ranking appears only after a real sale result exists.</span></div>}
      </article>

      <article className="section-card biz-analytics-v4-winner">
        <p className="eyebrow">BEST RETURN ON CAPITAL</p>
        {bestCapitalReturn ? <button type="button" onClick={() => openItem(bestCapitalReturn.item_id)}><strong>#{bestCapitalReturn.item_number} · {bestCapitalReturn.title}</strong><span>{pct(bestCapitalReturn.capital_return_pct)} projected return</span><small>{money(bestCapitalReturn.capital_invested_aud)} capital · {money(bestCapitalReturn.potential_profit_before_labour_aud)} projected margin</small></button> : <div className="biz-analytics-v4-empty"><strong>No ranked valuation yet.</strong><span>Add an AUD target valuation to active stock.</span></div>}
      </article>

      <article className="section-card biz-analytics-v4-winner">
        <p className="eyebrow">BEST PROJECTED / BENCH HOUR</p>
        {bestProjectedHourly ? <button type="button" onClick={() => openItem(bestProjectedHourly.item_id)}><strong>#{bestProjectedHourly.item_number} · {bestProjectedHourly.title}</strong><span>{money(bestProjectedHourly.potential_profit_per_bench_hour_aud)}/h projected</span><small>{hours(bestProjectedHourly.bench_hours)} bench · {money(bestProjectedHourly.potential_profit_before_labour_aud)} projected margin</small></button> : <div className="biz-analytics-v4-empty"><strong>Not enough combined data yet.</strong><span>This needs both bench time and a target valuation.</span></div>}
      </article>
    </div>

    <div className="biz-analytics-v4-grid biz-analytics-v4-grid-two">
      <article className="section-card biz-analytics-v4-card">
        <div className="biz-analytics-v4-card-heading"><div><p className="eyebrow">REAL WORK EFFICIENCY</p><h3>Profit per bench hour</h3></div></div>
        {bestHourly || worstHourly ? <div className="biz-analytics-v4-compare">
          <div><span>Best</span>{bestHourly && <button type="button" onClick={() => openItem(bestHourly.item_id)}><strong>#{bestHourly.item_number} · {bestHourly.title}</strong><small>{money(bestHourly.realised_profit_per_bench_hour_aud)}/h</small></button>}</div>
          <div><span>Lowest</span>{worstHourly && <button type="button" onClick={() => openItem(worstHourly.item_id)}><strong>#{worstHourly.item_number} · {worstHourly.title}</strong><small>{money(worstHourly.realised_profit_per_bench_hour_aud)}/h</small></button>}</div>
        </div> : <div className="biz-analytics-v4-empty"><strong>No realised hourly ranking yet.</strong><span>It will appear after sold Items have recorded bench time.</span></div>}
      </article>

      <article className="section-card biz-analytics-v4-card">
        <div className="biz-analytics-v4-card-heading"><div><p className="eyebrow">DATA COVERAGE</p><h3>How trustworthy are the rankings?</h3></div></div>
        <dl className="biz-analytics-v4-facts">
          <div><dt>Active Items with valuation</dt><dd>{summary.valued_active_items}</dd></div>
          <div><dt>Active Items with bench time</dt><dd>{summary.active_items_with_bench_time}</dd></div>
          <div><dt>Completed Real Work</dt><dd>{summary.completed_work_count}</dd></div>
          <div><dt>Sold Items ranked hourly</dt><dd>{sold.filter((row) => row.realised_profit_per_bench_hour_aud != null).length}</dd></div>
        </dl>
      </article>
    </div>

    <article className="section-card biz-analytics-v4-card">
      <div className="biz-analytics-v4-card-heading"><div><p className="eyebrow">STALE CAPITAL</p><h3>90+ days and not listed</h3></div><span>{summary.stale_unlisted_items} flagged</span></div>
      <div className="biz-analytics-v4-list">
        {stale.map((row) => <button type="button" key={row.item_id} onClick={() => openItem(row.item_id)}><span><strong>#{row.item_number} · {row.title}</strong><small>{row.age_days} days · {hours(row.bench_hours)} bench</small></span><span><strong>{money(row.capital_invested_aud)}</strong><small>capital tied up</small></span></button>)}
        {!stale.length && <div className="biz-analytics-v4-empty"><strong>No stale unlisted capital.</strong><span>Nothing currently meets the 90+ day, not-listed definition.</span></div>}
      </div>
    </article>

    <p className="biz-analytics-v4-note">“Stale capital” is intentionally narrow: active Real stock aged 90+ days that is not listed. It is a review flag, not a recommendation to sell or write off the Item.</p>
  </section>
}
