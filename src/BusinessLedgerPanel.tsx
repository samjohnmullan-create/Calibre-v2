import { FormEvent, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type LedgerEntry = {
  id: string
  workspace_id: string
  entry_type: 'expense' | 'income'
  treatment: 'operating' | 'capital' | 'other'
  category: string
  description: string
  amount: number
  currency: string
  amount_aud: number | null
  occurred_at: string
  vendor: string
  reference: string
  notes: string
  purchase_id: string | null
  external_key: string
  reversal_of_entry_id: string | null
  reversal_reason: string
  created_at: string
  updated_at: string
}

type LedgerSummary = {
  operating_expenses_aud: number
  capital_expenses_aud: number
  other_expenses_aud: number
  income_aud: number
  net_cash_impact_aud: number
  missing_aud_count: number
  entry_count: number
}

type Draft = {
  entry_type: 'expense' | 'income'
  treatment: 'operating' | 'capital' | 'other'
  category: string
  description: string
  amount: string
  currency: string
  amount_aud: string
  occurred_at: string
  vendor: string
  reference: string
  notes: string
}

const expenseCategories = [
  'tools_equipment',
  'consumables',
  'subscriptions',
  'packaging',
  'postage',
  'software',
  'marketing',
  'marketplace',
  'banking',
  'travel',
  'professional_services',
  'utilities',
  'insurance',
  'training',
  'rent_storage',
  'other',
]

const incomeCategories = ['refund_rebate', 'shipping_recovery', 'service_income', 'other_income']
const currencies = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CHF', 'JPY']
const PAGE_SIZE = 40

const emptySummary: LedgerSummary = {
  operating_expenses_aud: 0,
  capital_expenses_aud: 0,
  other_expenses_aud: 0,
  income_aud: 0,
  net_cash_impact_aud: 0,
  missing_aud_count: 0,
  entry_count: 0,
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value))
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function blankDraft(): Draft {
  return {
    entry_type: 'expense',
    treatment: 'operating',
    category: 'tools_equipment',
    description: '',
    amount: '',
    currency: 'AUD',
    amount_aud: '',
    occurred_at: today(),
    vendor: '',
    reference: '',
    notes: '',
  }
}

function audValue(entry: LedgerEntry) {
  if (entry.currency === 'AUD') return Number(entry.amount || 0)
  return entry.amount_aud == null ? null : Number(entry.amount_aud)
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSummary(value: Record<string, unknown> | null | undefined): LedgerSummary {
  if (!value) return emptySummary
  return {
    operating_expenses_aud: asNumber(value.operating_expenses_aud),
    capital_expenses_aud: asNumber(value.capital_expenses_aud),
    other_expenses_aud: asNumber(value.other_expenses_aud),
    income_aud: asNumber(value.income_aud),
    net_cash_impact_aud: asNumber(value.net_cash_impact_aud),
    missing_aud_count: asNumber(value.missing_aud_count),
    entry_count: asNumber(value.entry_count),
  }
}

function cleanSearchTerm(value: string) {
  return value.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
}

export default function BusinessLedgerPanel({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [summary, setSummary] = useState<LedgerSummary>(emptySummary)
  const [resultCount, setResultCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reversingId, setReversingId] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [showEditor, setShowEditor] = useState(false)

  async function load(targetPage = page) {
    if (!workspaceId) return
    setLoading(true)
    const from = (targetPage - 1) * PAGE_SIZE
    const term = cleanSearchTerm(query)

    let entriesQuery = supabase
      .from('business_ledger_entries')
      .select('id,workspace_id,entry_type,treatment,category,description,amount,currency,amount_aud,occurred_at,vendor,reference,notes,purchase_id,external_key,reversal_of_entry_id,reversal_reason,created_at,updated_at', { count: 'exact' })
      .eq('workspace_id', workspaceId)

    if (typeFilter !== 'all') entriesQuery = entriesQuery.eq('entry_type', typeFilter)
    if (term) {
      const pattern = `%${term}%`
      entriesQuery = entriesQuery.or(`description.ilike.${pattern},category.ilike.${pattern},vendor.ilike.${pattern},reference.ilike.${pattern},notes.ilike.${pattern},currency.ilike.${pattern}`)
    }

    const [entriesResult, summaryResult] = await Promise.all([
      entriesQuery
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1),
      supabase.rpc('business_ledger_summary', { p_workspace_id: workspaceId }),
    ])
    setLoading(false)

    const error = entriesResult.error ?? summaryResult.error
    if (error) {
      setMessage(`Ledger could not be loaded: ${error.message}`)
      return
    }

    setEntries((entriesResult.data ?? []) as LedgerEntry[])
    setResultCount(entriesResult.count ?? 0)
    setSummary(normalizeSummary((summaryResult.data?.[0] ?? null) as Record<string, unknown> | null))
    setMessage('')
  }

  useEffect(() => {
    setPage(1)
  }, [query, typeFilter])

  useEffect(() => {
    if (!workspaceId) return
    const timer = window.setTimeout(() => void load(), query.trim() ? 180 : 0)
    return () => window.clearTimeout(timer)
  }, [workspaceId, page, query, typeFilter])

  function startNew() {
    setDraft(blankDraft())
    setShowEditor(true)
    setMessage('')
  }

  function patch(patchValue: Partial<Draft>) {
    setDraft((current) => {
      const next = { ...current, ...patchValue }
      if (patchValue.entry_type && patchValue.entry_type !== current.entry_type) {
        next.category = patchValue.entry_type === 'expense' ? 'tools_equipment' : 'other_income'
        if (patchValue.entry_type === 'income') next.treatment = 'operating'
      }
      if (patchValue.currency === 'AUD') next.amount_aud = next.amount
      return next
    })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving || !workspaceId) return
    const amount = Number(draft.amount)
    if (!draft.description.trim() || !draft.category || !Number.isFinite(amount) || amount < 0) {
      setMessage('Description, category and a valid amount are required.')
      return
    }
    const converted = draft.currency === 'AUD'
      ? amount
      : draft.amount_aud.trim() === '' ? null : Number(draft.amount_aud)
    if (converted != null && (!Number.isFinite(converted) || converted < 0)) {
      setMessage('AUD value must be a valid positive amount, or left blank.')
      return
    }

    setSaving(true)
    const result = await supabase.from('business_ledger_entries').insert({
      workspace_id: workspaceId,
      entry_type: draft.entry_type,
      treatment: draft.treatment,
      category: draft.category,
      description: draft.description.trim(),
      amount,
      currency: draft.currency,
      amount_aud: converted,
      occurred_at: draft.occurred_at || today(),
      vendor: draft.vendor.trim(),
      reference: draft.reference.trim(),
      notes: draft.notes.trim(),
    })
    setSaving(false)
    if (result.error) {
      setMessage(`Ledger entry could not be saved: ${result.error.message}`)
      return
    }
    setShowEditor(false)
    setDraft(blankDraft())
    setMessage('Ledger entry added. Existing ledger history is immutable; corrections use linked reversals.')
    if (page !== 1) setPage(1)
    else await load(1)
  }

  async function reverse(entry: LedgerEntry) {
    if (reversingId) return
    if (entry.reversal_of_entry_id) {
      setMessage('A reversal entry cannot itself be reversed.')
      return
    }
    if (entry.purchase_id || entry.external_key) {
      setMessage('This entry is linked to a source transaction. Correct the Purchase/receiving source instead of reversing it here.')
      return
    }
    const reason = window.prompt(`Reverse “${entry.description}”?\n\nThe original record will remain in history and Calibre will add an equal-and-opposite entry. Optional reason:`, '')
    if (reason === null) return

    setReversingId(entry.id)
    const { error } = await supabase.rpc('reverse_business_ledger_entry', {
      p_workspace_id: workspaceId,
      p_entry_id: entry.id,
      p_reason: reason.trim(),
    })
    setReversingId('')
    if (error) {
      setMessage(`Ledger entry could not be reversed: ${error.message}`)
      return
    }
    setMessage('Reversal added. The original ledger entry remains permanently visible in history.')
    await load(page)
  }

  const categories = draft.entry_type === 'expense' ? expenseCategories : incomeCategories
  const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE))

  return (
    <div className="ledger-v2-stack">
      <section className="ledger-v2-metrics" aria-label="Business ledger summary">
        <div><span>Operating spend</span><strong>{money(summary.operating_expenses_aud)}</strong><small>Running the business</small></div>
        <div><span>Capital spend</span><strong>{money(summary.capital_expenses_aud)}</strong><small>Tools & equipment</small></div>
        <div><span>Other income</span><strong>{money(summary.income_aud)}</strong><small>Excludes Item sale revenue</small></div>
        <div><span>Net cash impact</span><strong className={summary.net_cash_impact_aud < 0 ? 'negative' : ''}>{money(summary.net_cash_impact_aud)}</strong><small>{summary.missing_aud_count ? `${summary.missing_aud_count} foreign entr${summary.missing_aud_count === 1 ? 'y' : 'ies'} not converted` : `${summary.entry_count} ledger entr${summary.entry_count === 1 ? 'y' : 'ies'} included`}</small></div>
      </section>

      <section className="section-card ledger-v2-card">
        <div className="business-v2-panel-heading">
          <div><p className="eyebrow">BUSINESS LEDGER</p><h2>Overheads & business cash movement</h2><p className="muted">Ledger history is append-only. If a manual entry is wrong, reverse it and add the corrected entry; source-linked Purchase entries are corrected at their source.</p></div>
          <button type="button" onClick={startNew}>＋ Add entry</button>
        </div>

        {message && <p className="business-v2-message">{message}</p>}

        <div className="ledger-v2-controls">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search description, vendor, category…" aria-label="Search ledger" />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | 'expense' | 'income')} aria-label="Filter ledger type">
            <option value="all">All entries</option>
            <option value="expense">Expenses</option>
            <option value="income">Other income</option>
          </select>
        </div>

        {loading && <div className="loading-card">Loading ledger…</div>}
        {!loading && (
          <div className="ledger-v2-list">
            {entries.map((entry) => {
              const converted = audValue(entry)
              const sourceControlled = Boolean(entry.purchase_id || entry.external_key)
              const isReversal = Boolean(entry.reversal_of_entry_id)
              return (
                <article className="ledger-v2-row" key={entry.id}>
                  <div className="ledger-v2-row-main">
                    <span className={`ledger-v2-type ledger-v2-type-${entry.entry_type}`}>{isReversal ? 'Reversal' : entry.entry_type === 'expense' ? 'Expense' : 'Income'}</span>
                    <span><strong>{entry.description}</strong><small>{titleCase(entry.category)} · {titleCase(entry.treatment)}{entry.vendor ? ` · ${entry.vendor}` : ''}{entry.reversal_reason ? ` · ${entry.reversal_reason}` : ''}</small></span>
                    <span className="ledger-v2-row-money"><strong>{entry.entry_type === 'expense' ? '−' : '+'}{money(entry.amount, entry.currency)}</strong><small>{entry.currency === 'AUD' ? new Date(entry.occurred_at).toLocaleDateString('en-AU') : `${converted == null ? 'AUD not set' : money(converted, 'AUD')} · ${new Date(entry.occurred_at).toLocaleDateString('en-AU')}`}</small></span>
                  </div>
                  <button type="button" className="secondary small ledger-v2-delete" disabled={isReversal || sourceControlled || reversingId === entry.id} onClick={() => void reverse(entry)} title={sourceControlled ? 'Correct this record at its source Purchase/receiving record.' : isReversal ? 'Reversal records are historical.' : 'Add an equal-and-opposite linked entry.'}>{reversingId === entry.id ? 'Reversing…' : isReversal ? 'Historical' : sourceControlled ? 'Source controlled' : 'Reverse'}</button>
                </article>
              )
            })}
            {entries.length === 0 && <div className="business-v2-empty"><strong>{summary.entry_count ? 'No entries match this filter.' : 'No business ledger entries yet.'}</strong><span>Add tools, subscriptions, consumables, packaging and other business overhead here.</span></div>}
          </div>
        )}

        {!loading && resultCount > PAGE_SIZE && (
          <div className="business-v2-pager">
            <button type="button" className="secondary small" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Previous</button>
            <span>Page {page} of {totalPages} · {resultCount} matching records</span>
            <button type="button" className="secondary small" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next →</button>
          </div>
        )}
      </section>

      {showEditor && (
        <div className="ledger-v2-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowEditor(false) }}>
          <form className="ledger-v2-editor" onSubmit={save}>
            <div className="business-v2-panel-heading"><div><p className="eyebrow">NEW ENTRY</p><h2>Add business ledger entry</h2><p className="muted">Once saved, this entry becomes historical. Correct mistakes with a reversal and a new entry.</p></div><button type="button" className="secondary small" onClick={() => setShowEditor(false)} disabled={saving}>Close</button></div>
            <div className="ledger-v2-form-grid">
              <label>Type<select value={draft.entry_type} onChange={(event) => patch({ entry_type: event.target.value as 'expense' | 'income' })}><option value="expense">Expense</option><option value="income">Other income</option></select></label>
              <label>Treatment<select value={draft.treatment} onChange={(event) => patch({ treatment: event.target.value as 'operating' | 'capital' | 'other' })}><option value="operating">Operating</option><option value="capital">Capital</option><option value="other">Other</option></select></label>
              <label>Category<select value={draft.category} onChange={(event) => patch({ category: event.target.value })}>{categories.map((category) => <option value={category} key={category}>{titleCase(category)}</option>)}</select></label>
              <label>Date<input type="date" value={draft.occurred_at} onChange={(event) => patch({ occurred_at: event.target.value })} /></label>
              <label className="span-2">Description<input value={draft.description} onChange={(event) => patch({ description: event.target.value })} placeholder="e.g. Bergeon movement holder" required /></label>
              <label>Amount<input type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => patch({ amount: event.target.value, ...(draft.currency === 'AUD' ? { amount_aud: event.target.value } : {}) })} required /></label>
              <label>Currency<select value={draft.currency} onChange={(event) => patch({ currency: event.target.value })}>{currencies.map((currency) => <option value={currency} key={currency}>{currency}</option>)}</select></label>
              {draft.currency !== 'AUD' && <label className="span-2">AUD value <span className="ledger-v2-label-note">optional, but needed for business totals</span><input type="number" min="0" step="0.01" value={draft.amount_aud} onChange={(event) => patch({ amount_aud: event.target.value })} /></label>}
              <label>Vendor<input value={draft.vendor} onChange={(event) => patch({ vendor: event.target.value })} /></label>
              <label>Reference<input value={draft.reference} onChange={(event) => patch({ reference: event.target.value })} placeholder="Order / receipt / invoice" /></label>
              <label className="span-2">Notes<textarea rows={3} value={draft.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
            </div>
            <div className="ledger-v2-editor-actions"><button type="button" className="secondary" onClick={() => setShowEditor(false)} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add entry'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
