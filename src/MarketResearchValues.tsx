import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './market-research-values.css'

type MarketSuggestion = {
  currency?: unknown
  low_value?: unknown
  expected_value?: unknown
  high_value?: unknown
  target_value?: unknown
  minimum_value?: unknown
  asking_price?: unknown
  confidence?: unknown
  basis?: unknown
}

type CurrentValuation = {
  low_value: number | null
  expected_value: number | null
  high_value: number | null
  target_value: number | null
  minimum_value: number | null
  currency: string | null
}

type CurrentSale = { id: string; asking_price: number | null; currency: string | null } | null

type Values = {
  low: string
  expected: string
  high: string
  target: string
  minimum: string
  asking: string
  currency: string
}

function inputValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(parsed) : ''
}

function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null) return 'Not set'
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value) } catch { return `${currency} ${value}` }
}

function numberOrNull(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function MarketResearchValues({
  workspaceId,
  itemId,
  requestId,
  suggested,
  onChanged,
}: {
  workspaceId: string
  itemId: string
  requestId: string
  suggested?: MarketSuggestion | null
  onChanged?: () => void | Promise<void>
}) {
  const initial = useMemo<Values>(() => ({
    low: inputValue(suggested?.low_value),
    expected: inputValue(suggested?.expected_value),
    high: inputValue(suggested?.high_value),
    target: inputValue(suggested?.target_value),
    minimum: inputValue(suggested?.minimum_value),
    asking: inputValue(suggested?.asking_price),
    currency: typeof suggested?.currency === 'string' && suggested.currency.trim() ? suggested.currency.trim().toUpperCase() : 'AUD',
  }), [requestId, suggested])

  const [values, setValues] = useState<Values>(initial)
  const [currentValuation, setCurrentValuation] = useState<CurrentValuation | null>(null)
  const [currentSale, setCurrentSale] = useState<CurrentSale>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { setValues(initial) }, [initial])

  async function loadCurrent() {
    const [valuation, sale] = await Promise.all([
      supabase.from('valuations').select('low_value,expected_value,high_value,target_value,minimum_value,currency').eq('workspace_id', workspaceId).eq('item_id', itemId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('sales').select('id,asking_price,currency').eq('workspace_id', workspaceId).eq('item_id', itemId).eq('status', 'draft').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (!valuation.error) setCurrentValuation((valuation.data ?? null) as CurrentValuation | null)
    if (!sale.error) setCurrentSale((sale.data ?? null) as CurrentSale)
  }

  useEffect(() => { void loadCurrent() }, [workspaceId, itemId, requestId])

  function setField(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: field === 'currency' ? value.toUpperCase() : value }))
  }

  async function save() {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const payload = {
        low_value: numberOrNull(values.low),
        expected_value: numberOrNull(values.expected),
        high_value: numberOrNull(values.high),
        target_value: numberOrNull(values.target),
        minimum_value: numberOrNull(values.minimum),
      }
      const askingPrice = numberOrNull(values.asking)
      if (Object.values(payload).every((value) => value == null) && askingPrice == null) throw new Error('Enter at least one market value before saving.')

      const currency = values.currency.trim().toUpperCase() || 'AUD'
      const confidence = typeof suggested?.confidence === 'string' && ['confirmed', 'strong', 'probable', 'possible', 'unknown'].includes(suggested.confidence)
        ? suggested.confidence
        : 'unknown'
      const basisText = typeof suggested?.basis === 'string' && suggested.basis.trim()
        ? suggested.basis.trim()
        : 'Values reviewed and confirmed by the operator from the sourced Market Research evidence.'

      const valuation = await supabase.from('valuations').insert({
        workspace_id: workspaceId,
        item_id: itemId,
        ...payload,
        currency,
        confidence,
        basis: `Calibre Market Research ${requestId} · ${basisText}`,
      })
      if (valuation.error) throw valuation.error

      if (askingPrice != null) {
        if (currentSale?.id) {
          const updated = await supabase.from('sales').update({ asking_price: askingPrice, currency, updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('id', currentSale.id).select('id').maybeSingle()
          if (updated.error) throw updated.error
          if (!updated.data) throw new Error('The Sales asking price was not updated.')
        } else {
          const item = await supabase.from('items').select('title').eq('workspace_id', workspaceId).eq('id', itemId).single()
          if (item.error) throw item.error
          const inserted = await supabase.from('sales').insert({
            workspace_id: workspaceId,
            item_id: itemId,
            status: 'draft',
            listing_title: item.data.title ?? '',
            asking_price: askingPrice,
            currency,
            buyer_note: `Market values confirmed from Calibre Research ${requestId}.`,
          }).select('id').single()
          if (inserted.error) throw inserted.error
        }
      }

      const requestResult = await supabase.from('research_requests').select('requested_scope').eq('workspace_id', workspaceId).eq('id', requestId).maybeSingle()
      if (!requestResult.error && requestResult.data) {
        const scope = (requestResult.data.requested_scope ?? {}) as Record<string, unknown>
        await supabase.from('research_requests').update({
          requested_scope: {
            ...scope,
            market_confirmation: {
              confirmed_at: new Date().toISOString(),
              currency,
              ...payload,
              asking_price: askingPrice,
            },
          },
        }).eq('workspace_id', workspaceId).eq('id', requestId)
      }

      await loadCurrent()
      setMessage(`✓ Saved to database · Valuation${askingPrice != null ? ' + Sales asking price' : ''}.`)
      window.dispatchEvent(new CustomEvent('calibre:item-changed', { detail: { itemId, destination: 'sales' } }))
      void Promise.resolve(onChanged?.()).catch(() => undefined)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Market values could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const currentCurrency = currentValuation?.currency || currentSale?.currency || 'AUD'
  const hasSuggestion = Boolean(suggested && Object.values(suggested).some((value) => value != null && value !== ''))

  return <section className="bench-research-market-values">
    <div className="bench-guided-heading"><div><p className="eyebrow">MARKET VALUES</p><strong>Review and add values to Sales</strong></div><span>{hasSuggestion ? 'Proposed' : 'Your review'}</span></div>
    <p className="bench-guided-help">{hasSuggestion ? 'Research has proposed figures below. Edit anything you disagree with, then confirm the values you want Calibre to store.' : 'Research found market evidence but did not consider it strong enough to recommend a figure. You can still enter the values you judge appropriate from the evidence above.'}</p>

    <div className="market-current-row">
      <span>Current</span>
      <small>Expected {money(currentValuation?.expected_value, currentCurrency)} · Target {money(currentValuation?.target_value, currentCurrency)} · Asking {money(currentSale?.asking_price, currentCurrency)}</small>
    </div>

    <div className="market-values-grid">
      <label><span>Low value</span><input inputMode="decimal" value={values.low} onChange={(event) => setField('low', event.target.value)} placeholder="e.g. 120" /></label>
      <label><span>Expected value</span><input inputMode="decimal" value={values.expected} onChange={(event) => setField('expected', event.target.value)} placeholder="e.g. 220" /></label>
      <label><span>High value</span><input inputMode="decimal" value={values.high} onChange={(event) => setField('high', event.target.value)} placeholder="e.g. 320" /></label>
      <label><span>Target sale price</span><input inputMode="decimal" value={values.target} onChange={(event) => setField('target', event.target.value)} placeholder="e.g. 275" /></label>
      <label><span>Minimum acceptable</span><input inputMode="decimal" value={values.minimum} onChange={(event) => setField('minimum', event.target.value)} placeholder="e.g. 180" /></label>
      <label><span>Asking price</span><input inputMode="decimal" value={values.asking} onChange={(event) => setField('asking', event.target.value)} placeholder="e.g. 295" /></label>
      <label><span>Currency</span><input value={values.currency} onChange={(event) => setField('currency', event.target.value)} maxLength={3} /></label>
    </div>

    <div className="bench-guided-actions"><button type="button" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Confirm & add to Sales'}</button></div>
    {message && <p className="bench-guided-message">{message}</p>}
  </section>
}
