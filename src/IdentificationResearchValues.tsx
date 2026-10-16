import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './research-workspace.css'

type Finding = {
  id: string
  confidence: string
  proposed_destination: string | null
  proposed_field: string | null
  proposed_value: unknown
  proposal_status: string
}

type Row = {
  id: string
  destination: 'item' | 'identity' | 'passport'
  field: string
  current: unknown
  proposed: string
  original: unknown
  confidence: string
  selected: boolean
}

const blockedItemFields = new Set(['purpose', 'status'])
const numeric = new Set(['year_from','year_to','jewels','beat_rate','power_reserve_hours','movement_diameter_mm','lug_width_mm','width_mm','height_mm','thickness_mm'])

function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) }
function display(value: unknown) {
  if (value == null || value === '') return 'Not set'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
function parse(field: string, raw: string, original: unknown) {
  if (numeric.has(field)) {
    const value = Number(raw)
    if (!Number.isFinite(value)) throw new Error(`${pretty(field)} needs a valid number.`)
    return value
  }
  if (Array.isArray(original)) return raw.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (original && typeof original === 'object') {
    try { return JSON.parse(raw) } catch { throw new Error(`${pretty(field)} needs valid JSON.`) }
  }
  return raw.trim()
}

export default function IdentificationResearchValues({ workspaceId, itemId, requestId, findings, onChanged }: { workspaceId: string; itemId: string; requestId: string; findings: Finding[]; onChanged?: () => void | Promise<void> }) {
  const proposals = useMemo(() => findings.filter((finding) => {
    if (!finding.proposed_destination || !finding.proposed_field || finding.proposal_status === 'ignored') return false
    if (!['item','identity','passport'].includes(finding.proposed_destination)) return false
    if (finding.proposed_destination === 'item' && blockedItemFields.has(finding.proposed_field)) return false
    return true
  }), [findings])
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    const [item, identity, passport] = await Promise.all([
      supabase.from('items').select('*').eq('workspace_id', workspaceId).eq('id', itemId).single(),
      supabase.from('item_identity').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('passports').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
    ])
    if (item.error) return setMessage(item.error.message)
    const records: Record<string, Record<string, unknown>> = {
      item: item.data as Record<string, unknown>,
      identity: (identity.data ?? {}) as Record<string, unknown>,
      passport: (passport.data ?? {}) as Record<string, unknown>,
    }
    setRows(proposals.map((finding) => {
      const destination = finding.proposed_destination as Row['destination']
      const field = finding.proposed_field as string
      return {
        id: finding.id,
        destination,
        field,
        current: records[destination]?.[field] ?? null,
        proposed: display(finding.proposed_value) === 'Not set' ? '' : display(finding.proposed_value),
        original: finding.proposed_value,
        confidence: finding.confidence,
        selected: finding.proposal_status !== 'applied',
      }
    }))
  }

  useEffect(() => { void load() }, [workspaceId, itemId, requestId, proposals.map((row) => `${row.id}:${row.proposal_status}`).join('|')])

  async function save() {
    const selected = rows.filter((row) => row.selected)
    if (!selected.length || busy) return
    setBusy(true)
    setMessage('')
    try {
      const now = new Date().toISOString()
      const byDestination = new Map<Row['destination'], Row[]>()
      for (const row of selected) byDestination.set(row.destination, [...(byDestination.get(row.destination) ?? []), row])

      for (const [destination, destinationRows] of byDestination.entries()) {
        const values: Record<string, unknown> = {}
        for (const row of destinationRows) values[row.field] = parse(row.field, row.proposed, row.original)
        if (destination === 'item') {
          const write = await supabase.from('items').update({ ...values, updated_at: now }).eq('workspace_id', workspaceId).eq('id', itemId).select('id').maybeSingle()
          if (write.error || !write.data) throw new Error(write.error?.message ?? 'Item details were not updated.')
        } else {
          const table = destination === 'identity' ? 'item_identity' : 'passports'
          const existing = await supabase.from(table).select('item_id').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle()
          if (existing.error) throw existing.error
          const write = existing.data
            ? await supabase.from(table).update({ ...values, updated_at: now }).eq('workspace_id', workspaceId).eq('item_id', itemId).select('item_id').maybeSingle()
            : await supabase.from(table).insert({ workspace_id: workspaceId, item_id: itemId, ...values, updated_at: now }).select('item_id').maybeSingle()
          if (write.error || !write.data) throw new Error(write.error?.message ?? `${pretty(destination)} was not updated.`)
        }
      }

      for (const row of selected) {
        const value = parse(row.field, row.proposed, row.original)
        const write = await supabase.from('research_findings').update({ proposed_value: value, proposal_status: 'applied', decision: 'accepted', accepted_at: now, applied_at: now, updated_at: now }).eq('workspace_id', workspaceId).eq('id', row.id).select('id').maybeSingle()
        if (write.error || !write.data) throw new Error(write.error?.message ?? `${pretty(row.field)} could not be marked applied.`)
      }

      setRows((current) => current.map((row) => selected.some((chosen) => chosen.id === row.id) ? { ...row, current: parse(row.field, row.proposed, row.original), selected: false } : row))
      setMessage(`✓ Saved to database · ${selected.length} confirmed detail${selected.length === 1 ? '' : 's'}.`)
      window.dispatchEvent(new CustomEvent('calibre:item-changed', { detail: { itemId, destination: 'research' } }))
      void Promise.resolve(onChanged?.()).catch(() => undefined)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Confirmed details could not be saved.')
    } finally { setBusy(false) }
  }

  if (!rows.length) return null
  const selectedCount = rows.filter((row) => row.selected).length
  return <section className="research-batch-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">PROPOSED ITEM UPDATES</p><strong>Review current → proposed values</strong></div><span>{selectedCount} selected</span></div>
    <div className="research-batch-list">{rows.map((row) => <article key={row.id} className={row.current != null && row.current !== '' && display(row.current) !== row.proposed ? 'replacement' : ''}>
      <label><input type="checkbox" checked={row.selected} onChange={(event) => setRows((current) => current.map((entry) => entry.id === row.id ? { ...entry, selected: event.target.checked } : entry))} disabled={busy} /><span><strong>{pretty(row.field)}</strong><small>{pretty(row.destination)} · {row.confidence}</small></span></label>
      <div className="research-batch-compare"><div><span>Current</span><strong>{display(row.current)}</strong></div><div><span>Proposed</span><input value={row.proposed} onChange={(event) => setRows((current) => current.map((entry) => entry.id === row.id ? { ...entry, proposed: event.target.value } : entry))} disabled={busy || !row.selected} /></div></div>
      {row.current != null && row.current !== '' && display(row.current) !== row.proposed && <small className="research-replacement-warning">This replaces an existing value.</small>}
    </article>)}</div>
    <div className="bench-guided-actions"><button type="button" disabled={busy || !selectedCount} onClick={() => void save()}>{busy ? 'Saving…' : 'Confirm selected'}</button></div>
    {message && <p className="bench-guided-message">{message}</p>}
  </section>
}
