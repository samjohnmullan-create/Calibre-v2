import { FormEvent, useEffect, useMemo, useState } from 'react'
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
  created_at: string
  updated_at: string
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

export default function BusinessLedgerPanel({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [showEditor, setShowEditor] = useState(false)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    const result = await supabase
      .from('business_ledger_entries')
      .select('id,workspace_id,entry_type,treatment,category,description,amount,currency,amount_aud,occurred_at,vendor,reference,notes,purchase_id,external_key,created_at,updated_at')
      .eq('workspace_id', workspaceId)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
    setLoading(false)
    if (result.error) {
      setMessage(`Ledger could not be loaded: ${result.error.message}`)
      return
    }
    setEntries((result.data ?? []) as LedgerEntry[])
    setMessage('')
  }

  useEffect(() => { if (workspaceId) void load() }, [workspaceId])

  const totals = useMemo(() => {
    let operatingExpenses = 0
    let capitalExpenses = 0
    let otherExpenses = 0
    let income = 0
    let missingAud = 0
    for (const entry of entries) {
      const value = audValue(entry)
      if (value == null) {
        missingAud += 1
        continue
      }
      if (entry.entry_type === 'income') income += value
      else if (entry.treatment === 'capital') capitalExpenses += value
      else if (entry.treatment === 'operating') operatingExpenses += value
      else otherExpenses += value
    }
    return {
      operatingExpenses,
      capitalExpenses,
      otherExpenses,
      income,
      netCashImpact: income - operatingExpenses - capitalExpenses - otherExpenses,
      missingAud,
    }
  }, [entries])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (typeFilter !== 'all' && entry.entry_type !== typeFilter) return false
      if (!needle) return true
      return [entry.description, entry.category, entry.vendor, entry.reference, entry.notes, entry.currency]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [entries, query, typeFilter])

  function startNew() {
    setEditingId(null)
    setDraft(blankDraft())
    setShowEditor(true)
    setMessage('')
  }

  function startEdit(entry: LedgerEntry) {
    setEditingId(entry.id)
    setDraft({
      entry_type: entry.entry_type,
      treatment: entry.treatment,
      category: entry.category,
      description: entry.description,
      amount: String(entry.amount),
      currency: entry.currency,
      amount_aud: entry.amount_aud == null ? '' : String(entry.amount_aud),
      occurred_at: entry.occurred_at,
      vendor: entry.vendor,
      reference: entry.reference,
      notes: entry.notes,
    })
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
    const payload = {
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
      updated_at: new Date().toISOString(),
    }
    const result = editingId
      ? await supabase.from('business_ledger_entries').update(payload).eq('workspace_id', workspaceId).eq('id', editingId)
      : await supabase.from('business_ledger_entries').insert(payload)
    setSaving(false)
    if (result.error) {
      setMessage(`Ledger entry could not be saved: ${result.error.message}`)
      return
    }
    setShowEditor(false)
    setEditingId(null)
    setDraft(blankDraft())
    setMessage(editingId ? 'Ledger entry updated.' : 'Ledger entry added.')
    await load()
  }

  async function remove(entry: LedgerEntry) {
    if (!window.confirm(`Delete “${entry.description}” from the business ledger?`)) return
    const result = await supabase
      .from('business_ledger_entries')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', entry.id)
    if (result.error) {
      setMessage(`Ledger entry could not be deleted: ${result.error.message}`)
      return
    }
    if (editingId === entry.id) {
      setEditingId(null)
      setShowEditor(false)
      setDraft(blankDraft())
    }
    setMessage('Ledger entry deleted.')
    await load()
  }

  const categories = draft.entry_type === 'expense' ? expenseCategories : incomeCategories

  return (
    <div className="ledger-v2-stack">
      <section className="ledger-v2-metrics" aria-label="Business ledger summary">
        <div><span>Operating spend</span><strong>{money(totals.operatingExpenses)}</strong><small>Running the business</small></div>
        <div><span>Capital spend</span><strong>{money(totals.capitalExpenses)}</strong><small>Tools & equipment</small></div>
        <div><span>Other income</span><strong>{money(totals.income)}</strong><small>Excludes Item sale revenue</small></div>
        <div><span>Net cash impact</span><strong className={totals.netCashImpact < 0 ? 'negative' : ''}>{money(totals.netCashImpact)}</strong><small>{totals.missingAud ? `${totals.missingAud} foreign entr${totals.missingAud === 1 ? 'y' : 'ies'} not converted` : 'All entries included'}</small></div>
      </section>

      <section className="section-card ledger-v2-card">
        <div className="business-v2-panel-heading">
          <div><p className="eyebrow">BUSINESS LEDGER</p><h2>Overheads & business cash movement</h2><p className="muted">Keep business overhead here. Item purchases, repair costs and sale proceeds stay on their Item records so profit is not counted twice.</p></div>
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
            {filtered.map((entry) => {
              const converted = audValue(entry)
              return (
                <article className="ledger-v2-row" key={entry.id}>
                  <button type="button" className="ledger-v2-row-main" onClick={() => startEdit(entry)}>
                    <span className={`ledger-v2-type ledger-v2-type-${entry.entry_type}`}>{entry.entry_type === 'expense' ? 'Expense' : 'Income'}</span>
                    <span><strong>{entry.description}</strong><small>{titleCase(entry.category)} · {titleCase(entry.treatment)}{entry.vendor ? ` · ${entry.vendor}` : ''}</small></span>
                    <span className="ledger-v2-row-money"><strong>{entry.entry_type === 'expense' ? '−' : '+'}{money(entry.amount, entry.currency)}</strong><small>{entry.currency === 'AUD' ? new Date(entry.occurred_at).toLocaleDateString('en-AU') : `${converted == null ? 'AUD not set' : money(converted, 'AUD')} · ${new Date(entry.occurred_at).toLocaleDateString('en-AU')}`}</small></span>
                  </button>
                  <button type="button" className="secondary small ledger-v2-delete" onClick={() => void remove(entry)} aria-label={`Delete ${entry.description}`}>Delete</button>
                </article>
              )
            })}
            {filtered.length === 0 && <div className="business-v2-empty"><strong>{entries.length ? 'No entries match this filter.' : 'No business ledger entries yet.'}</strong><span>Add tools, subscriptions, consumables, packaging and other business overhead here.</span></div>}
          </div>
        )}
      </section>

      {showEditor && (
        <div className="ledger-v2-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowEditor(false) }}>
          <form className="ledger-v2-editor" onSubmit={save}>
            <div className="business-v2-panel-heading"><div><p className="eyebrow">{editingId ? 'EDIT ENTRY' : 'NEW ENTRY'}</p><h2>{editingId ? 'Update ledger entry' : 'Add business ledger entry'}</h2></div><button type="button" className="secondary small" onClick={() => setShowEditor(false)} disabled={saving}>Close</button></div>
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
            <div className="ledger-v2-editor-actions"><button type="button" className="secondary" onClick={() => setShowEditor(false)} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add entry'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
