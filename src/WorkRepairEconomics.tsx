import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-repair-economics.css'

type FinanceRow = {
  capital_invested_aud: number
  bench_hours: number
  target_value: number | null
  expected_value: number | null
  valuation_currency: string | null
  potential_profit_before_labour_aud: number | null
  potential_profit_per_bench_hour_aud: number | null
}

type WorkRow = {
  status: string
  blocker: string
  data_mode: 'real' | 'test'
}

type Scenario = {
  asIsValue: string
  remainingParts: string
  remainingHours: string
  labourRate: string
}

const emptyScenario: Scenario = { asIsValue: '', remainingParts: '', remainingHours: '', labourRate: '' }

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(Number(value))
}

function hours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(Number(value) >= 10 ? 1 : 2)}h`
}

function parseOptional(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function storageKey(workId: string) {
  return `calibre:repair-economics:${workId}`
}

export default function WorkRepairEconomics({ workspaceId, itemId, workId }: { workspaceId: string; itemId: string; workId: string }) {
  const [finance, setFinance] = useState<FinanceRow | null>(null)
  const [work, setWork] = useState<WorkRow | null>(null)
  const [openPartNeeds, setOpenPartNeeds] = useState(0)
  const [scenario, setScenario] = useState<Scenario>(emptyScenario)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(workId))
      setScenario(raw ? { ...emptyScenario, ...JSON.parse(raw) } : emptyScenario)
    } catch {
      setScenario(emptyScenario)
    }
  }, [workId])

  useEffect(() => {
    try { window.localStorage.setItem(storageKey(workId), JSON.stringify(scenario)) } catch { /* scenario persistence is optional */ }
  }, [workId, scenario])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [financeResult, workResult, needsResult] = await Promise.all([
        supabase.from('business_item_finance')
          .select('capital_invested_aud,bench_hours,target_value,expected_value,valuation_currency,potential_profit_before_labour_aud,potential_profit_per_bench_hour_aud')
          .eq('workspace_id', workspaceId)
          .eq('item_id', itemId)
          .maybeSingle(),
        supabase.from('work_records')
          .select('status,blocker,data_mode')
          .eq('workspace_id', workspaceId)
          .eq('id', workId)
          .maybeSingle(),
        supabase.from('work_part_needs')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('work_record_id', workId)
          .in('status', ['open', 'reserved']),
      ])
      if (cancelled) return
      setLoading(false)
      const error = financeResult.error ?? workResult.error ?? needsResult.error
      if (error) {
        setMessage(`Repair economics could not load: ${error.message}`)
        return
      }
      setFinance((financeResult.data ?? null) as FinanceRow | null)
      setWork((workResult.data ?? null) as WorkRow | null)
      setOpenPartNeeds(needsResult.count ?? 0)
      setMessage('')
    })()
    return () => { cancelled = true }
  }, [workspaceId, itemId, workId])

  const economics = useMemo(() => {
    const target = finance?.valuation_currency === 'AUD' ? Number(finance.target_value ?? finance.expected_value ?? NaN) : NaN
    const asIs = parseOptional(scenario.asIsValue)
    const remainingParts = parseOptional(scenario.remainingParts)
    const remainingHours = parseOptional(scenario.remainingHours)
    const labourRate = parseOptional(scenario.labourRate)
    const sunk = Number(finance?.capital_invested_aud ?? 0)
    const bench = Number(finance?.bench_hours ?? 0)

    const missing: string[] = []
    if (!Number.isFinite(target)) missing.push('AUD target valuation')
    if (asIs == null) missing.push('as-is value')
    if (remainingParts == null) missing.push('remaining parts budget')
    if (remainingHours == null) missing.push('remaining bench hours')

    if (missing.length) {
      return { target: Number.isFinite(target) ? target : null, asIs, remainingParts, remainingHours, labourRate, sunk, bench, missing, recommendation: 'Need more data', recommendationClass: 'neutral', incrementalGain: null, futureLabourValue: null, wholeItemProfit: null, finishValueAfterFutureCost: null }
    }

    const futureLabourValue = labourRate == null ? 0 : remainingHours! * labourRate
    const incrementalGain = target - asIs! - remainingParts! - futureLabourValue
    const finishValueAfterFutureCost = target - remainingParts! - futureLabourValue
    const wholeItemProfit = target - sunk - remainingParts! - futureLabourValue

    let recommendation = 'Continue repair'
    let recommendationClass = 'positive'
    if (incrementalGain <= 0 && asIs! > 0) {
      recommendation = 'Sell as-is'
      recommendationClass = 'warning'
    } else if (incrementalGain <= 0) {
      recommendation = openPartNeeds > 0 ? 'Stop / donor candidate' : 'Stop and reassess'
      recommendationClass = 'warning'
    } else if (incrementalGain < Math.max(25, target * 0.1)) {
      recommendation = 'Marginal — reassess'
      recommendationClass = 'caution'
    }

    return { target, asIs, remainingParts, remainingHours, labourRate, sunk, bench, missing, recommendation, recommendationClass, incrementalGain, futureLabourValue, wholeItemProfit, finishValueAfterFutureCost }
  }, [finance, scenario, openPartNeeds])

  if (loading) return <section className="repair-econ-card section-card"><div className="loading-card">Calculating repair economics…</div></section>
  if (!work || work.data_mode !== 'real') return null

  const disabled = work.status === 'complete' || work.status === 'cancelled'

  return (
    <section className="repair-econ-card section-card" aria-label="Repair economics">
      <div className="repair-econ-heading">
        <div><p className="eyebrow">REPAIR ECONOMICS</p><h3>Is it still worth finishing?</h3><p className="muted">A live decision scenario. Sunk cost is shown for the whole-item result but is not used to justify spending more.</p></div>
        <span className={`repair-econ-recommendation ${economics.recommendationClass}`}>{economics.recommendation}</span>
      </div>

      {message && <p className="work-job-message">{message}</p>}

      <div className="repair-econ-known">
        <div><span>Capital already sunk</span><strong>{money(finance?.capital_invested_aud)}</strong></div>
        <div><span>Bench time already spent</span><strong>{hours(finance?.bench_hours)}</strong></div>
        <div><span>Target value</span><strong>{finance?.valuation_currency === 'AUD' ? money(finance.target_value ?? finance.expected_value) : 'Needs AUD valuation'}</strong></div>
        <div><span>Open part needs</span><strong>{openPartNeeds}</strong></div>
      </div>

      <div className="repair-econ-scenario">
        <label>As-is sale value <span>AUD</span><input disabled={disabled} inputMode="decimal" type="number" min="0" step="1" value={scenario.asIsValue} onChange={(event) => setScenario((current) => ({ ...current, asIsValue: event.target.value }))} placeholder="e.g. 80" /></label>
        <label>Remaining parts budget <span>AUD</span><input disabled={disabled} inputMode="decimal" type="number" min="0" step="1" value={scenario.remainingParts} onChange={(event) => setScenario((current) => ({ ...current, remainingParts: event.target.value }))} placeholder={openPartNeeds ? 'Estimate required' : '0'} /></label>
        <label>Remaining bench time <span>hours</span><input disabled={disabled} inputMode="decimal" type="number" min="0" step="0.25" value={scenario.remainingHours} onChange={(event) => setScenario((current) => ({ ...current, remainingHours: event.target.value }))} placeholder="e.g. 2" /></label>
        <label>Value your time <span>AUD/hour · optional</span><input disabled={disabled} inputMode="decimal" type="number" min="0" step="1" value={scenario.labourRate} onChange={(event) => setScenario((current) => ({ ...current, labourRate: event.target.value }))} placeholder="Leave blank for cash-only" /></label>
      </div>

      {economics.missing.length > 0 ? (
        <div className="repair-econ-missing"><strong>Complete the scenario to get a recommendation</strong><span>Missing: {economics.missing.join(', ')}.</span></div>
      ) : (
        <div className="repair-econ-results">
          <div className="repair-econ-decision">
            <span>Value created by finishing from this point</span>
            <strong className={(economics.incrementalGain ?? 0) < 0 ? 'negative' : ''}>{money(economics.incrementalGain)}</strong>
            <small>Target − as-is value − future parts{economics.labourRate != null ? ' − value of remaining bench time' : ''}</small>
          </div>
          <div><span>Expected whole-item result</span><strong className={(economics.wholeItemProfit ?? 0) < 0 ? 'negative' : ''}>{money(economics.wholeItemProfit)}</strong><small>Includes capital already sunk</small></div>
          <div><span>Future labour value</span><strong>{economics.labourRate == null ? 'Not priced' : money(economics.futureLabourValue)}</strong><small>{economics.labourRate == null ? 'Recommendation is cash-only' : `${hours(economics.remainingHours)} × ${money(economics.labourRate)}/h`}</small></div>
        </div>
      )}

      <div className="repair-econ-note">
        <strong>Decision rule</strong>
        <span>Continue when the extra value created by repairing is greater than the remaining cost from today. If it is not, selling as-is — or stopping/donor use when there is no meaningful as-is market — is economically stronger.</span>
      </div>
    </section>
  )
}
