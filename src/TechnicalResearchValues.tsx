import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './technical-research-values.css'

type TechnicalFinding = {
  id: string
  confidence: string
  proposed_destination: string | null
  proposed_field: string | null
  proposed_value: unknown
  proposal_status: string
}

type PassportRow = Record<string, unknown> & { item_id?: string }

type DraftRow = {
  id: string
  field: string
  label: string
  confidence: string
  current: unknown
  proposed: string
  selected: boolean
  original: unknown
}

const labels: Record<string, string> = {
  movement_maker: 'Movement maker',
  calibre: 'Calibre',
  calibre_family: 'Calibre family',
  jewels: 'Jewels',
  beat_rate: 'Beat rate',
  power_reserve_hours: 'Power reserve',
  escapement: 'Escapement',
  movement_diameter_mm: 'Movement diameter',
  movement_type: 'Movement type',
  setting_system: 'Setting system',
  complications: 'Complications',
  case_material: 'Case material',
  case_style: 'Case style',
  caseback_type: 'Caseback type',
  crystal_type: 'Crystal type',
  crown_type: 'Crown type',
  lug_width_mm: 'Lug width',
  width_mm: 'Width',
  height_mm: 'Height',
  thickness_mm: 'Thickness',
  water_resistance_marking: 'Water resistance marking',
  hallmarks: 'Hallmarks',
  provenance_summary: 'Provenance summary',
  technical_notes: 'Technical notes',
}

const numericFields = new Set([
  'jewels', 'beat_rate', 'power_reserve_hours', 'movement_diameter_mm',
  'lug_width_mm', 'width_mm', 'height_mm', 'thickness_mm',
])

function display(value: unknown) {
  if (value == null || value === '') return 'Not set'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function editable(value: unknown) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function parseValue(field: string, raw: string, original: unknown) {
  const value = raw.trim()
  if (numericFields.has(field)) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) throw new Error(`${labels[field] ?? field} needs a valid number.`)
    return parsed
  }
  if (Array.isArray(original)) return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (original && typeof original === 'object') {
    try { return JSON.parse(value) } catch { throw new Error(`${labels[field] ?? field} needs valid JSON.`) }
  }
  return value
}

export default function TechnicalResearchValues({
  workspaceId,
  itemId,
  workId,
  requestId,
  findings,
  onChanged,
}: {
  workspaceId: string
  itemId: string
  workId?: string | null
  requestId: string
  findings: TechnicalFinding[]
  onChanged?: () => void | Promise<void>
}) {
  const proposals = useMemo(() => findings.filter((finding) => finding.proposed_destination === 'passport' && finding.proposed_field && finding.proposal_status !== 'ignored'), [findings])
  const [passport, setPassport] = useState<PassportRow | null>(null)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function loadCurrent() {
    const result = await supabase.from('passports').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle()
    if (result.error) {
      setMessage(`Passport could not load: ${result.error.message}`)
      return
    }
    const current = (result.data ?? null) as PassportRow | null
    setPassport(current)
    setRows(proposals.map((finding) => {
      const field = finding.proposed_field as string
      return {
        id: finding.id,
        field,
        label: labels[field] ?? field.replaceAll('_', ' '),
        confidence: finding.confidence,
        current: current?.[field] ?? null,
        proposed: editable(finding.proposed_value),
        selected: finding.proposal_status !== 'applied',
        original: finding.proposed_value,
      }
    }))
  }

  useEffect(() => { void loadCurrent() }, [workspaceId, itemId, requestId, proposals.map((row) => `${row.id}:${row.proposal_status}`).join('|')])

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
  }

  async function saveSelected() {
    if (busy) return
    const chosen = rows.filter((row) => row.selected)
    if (!chosen.length) return setMessage('Select at least one technical field to add.')
    setBusy(true)
    setMessage('')

    try {
      const values: Record<string, unknown> = {}
      for (const row of chosen) values[row.field] = parseValue(row.field, row.proposed, row.original)
      const now = new Date().toISOString()

      const write = passport
        ? await supabase.from('passports').update({ ...values, updated_at: now }).eq('workspace_id', workspaceId).eq('item_id', itemId).select('*').maybeSingle()
        : await supabase.from('passports').insert({ workspace_id: workspaceId, item_id: itemId, ...values, updated_at: now }).select('*').maybeSingle()
      if (write.error) throw write.error
      if (!write.data) throw new Error('Passport was not updated.')
      setPassport(write.data as PassportRow)

      for (const row of chosen) {
        const findingWrite = await supabase.from('research_findings').update({
          proposed_value: values[row.field],
          proposal_status: 'applied',
          decision: 'accepted',
          accepted_at: now,
          applied_at: now,
          updated_at: now,
        }).eq('workspace_id', workspaceId).eq('id', row.id).select('id').maybeSingle()
        if (findingWrite.error) throw findingWrite.error
        if (!findingWrite.data) throw new Error(`${row.label} was saved, but its research proposal could not be marked applied.`)
      }

      const requestResult = await supabase.from('research_requests').select('requested_scope').eq('workspace_id', workspaceId).eq('id', requestId).maybeSingle()
      if (!requestResult.error && requestResult.data) {
        const scope = (requestResult.data.requested_scope ?? {}) as Record<string, unknown>
        await supabase.from('research_requests').update({
          requested_scope: {
            ...scope,
            technical_confirmation: {
              confirmed_at: now,
              fields: values,
            },
          },
        }).eq('workspace_id', workspaceId).eq('id', requestId)
      }

      if (workId) {
        await supabase.from('work_events').insert({
          workspace_id: workspaceId,
          work_record_id: workId,
          event_type: 'technical_research_confirmed',
          summary: `Technical Research added ${chosen.length} Passport field${chosen.length === 1 ? '' : 's'}`,
          details: { research_request_id: requestId, fields: values },
        })
      }

      setRows((current) => current.map((row) => chosen.some((chosenRow) => chosenRow.id === row.id)
        ? { ...row, current: values[row.field], selected: false }
        : row))
      setMessage(`✓ Saved to database · Passport · ${chosen.map((row) => row.label).join(', ')}.`)
      window.dispatchEvent(new CustomEvent('calibre:item-changed', { detail: { itemId, destination: 'passport' } }))
      void Promise.resolve(onChanged?.()).catch(() => undefined)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Technical details could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  if (!proposals.length) return <section className="bench-research-technical-values">
    <div className="bench-guided-heading"><div><p className="eyebrow">TECHNICAL DETAILS</p><strong>No mapped Passport fields yet</strong></div></div>
    <p className="bench-guided-help">Technical Research returned evidence, but none of it was mapped to an editable Passport field. Keep the findings as evidence or run Technical again after adding clearer movement/case photographs.</p>
  </section>

  const pending = rows.filter((row) => row.selected).length

  return <section className="bench-research-technical-values">
    <div className="bench-guided-heading"><div><p className="eyebrow">TECHNICAL DETAILS</p><strong>Review and add to Passport</strong></div><span>{pending ? `${pending} selected` : 'Reviewed'}</span></div>
    <p className="bench-guided-help">These are the technical fields Research wants to add or change. Compare the current database value with the proposal, edit anything you disagree with, untick anything you do not want, then confirm once.</p>

    <div className="technical-values-list">
      {rows.map((row) => {
        const changed = display(row.current) !== display(parseValueSafe(row.field, row.proposed, row.original))
        return <div key={row.id} className={`technical-value-row${changed && row.current != null && row.current !== '' ? ' replacement' : ''}`}>
          <label className="technical-value-toggle">
            <input type="checkbox" checked={row.selected} onChange={(event) => updateRow(row.id, { selected: event.target.checked })} disabled={busy} />
            <span><strong>{row.label}</strong><small>{row.confidence}</small></span>
          </label>
          <div className="technical-value-compare"><div><span>Current</span><strong>{display(row.current)}</strong></div><div><span>Proposed</span><input value={row.proposed} onChange={(event) => updateRow(row.id, { proposed: event.target.value })} disabled={busy || !row.selected} /></div></div>
          {changed && row.current != null && row.current !== '' && <small className="technical-replacement-note">This will replace an existing Passport value.</small>}
        </div>
      })}
    </div>

    <div className="bench-guided-actions"><button type="button" onClick={() => void saveSelected()} disabled={busy || !pending}>{busy ? 'Saving…' : 'Confirm & add selected to Passport'}</button></div>
    {message && <p className="bench-guided-message">{message}</p>}
  </section>
}

function parseValueSafe(field: string, raw: string, original: unknown) {
  try { return parseValue(field, raw, original) } catch { return raw }
}
