import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type ProposalFinding = {
  id: string
  confidence: string
  decision: string
  proposed_destination: string | null
  proposed_field: string | null
  proposed_value: unknown
  proposal_status: string
}

const allowedFields: Record<string, Set<string>> = {
  item: new Set(['title', 'type', 'notes']),
  identity: new Set(['maker', 'model', 'reference', 'serial', 'year_from', 'year_to', 'era', 'country', 'materials', 'dimensions_text', 'dial_markings', 'case_markings', 'movement_markings', 'notes']),
  passport: new Set(['movement_maker', 'calibre', 'calibre_family', 'jewels', 'beat_rate', 'power_reserve_hours', 'escapement', 'movement_diameter_mm', 'movement_type', 'setting_system', 'complications', 'case_material', 'case_style', 'caseback_type', 'crystal_type', 'crown_type', 'lug_width_mm', 'width_mm', 'height_mm', 'thickness_mm', 'water_resistance_marking', 'hallmarks', 'provenance_summary', 'technical_notes']),
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function displayValue(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function editedValue(raw: string, original: unknown) {
  if (typeof original === 'number') {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) throw new Error('Enter a valid number.')
    return parsed
  }
  if (typeof original === 'boolean') return raw.trim().toLowerCase() === 'true'
  if (Array.isArray(original)) {
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error()
      return parsed
    } catch {
      return raw.split(',').map((value) => value.trim()).filter(Boolean)
    }
  }
  if (original && typeof original === 'object') {
    try { return JSON.parse(raw) } catch { throw new Error('Enter valid JSON for this value.') }
  }
  return raw.trim()
}

export default function ResearchProposalReview({
  finding,
  workspaceId,
  itemId,
  onChanged,
}: {
  finding: ProposalFinding
  workspaceId: string
  itemId: string
  onChanged?: () => void | Promise<void>
}) {
  const destination = finding.proposed_destination ?? ''
  const field = finding.proposed_field ?? ''
  const canApply = Boolean(destination && field && allowedFields[destination]?.has(field))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayValue(finding.proposed_value))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const destinationLabel = useMemo(() => {
    if (destination === 'identity') return 'Item details'
    if (destination === 'passport') return 'Passport'
    if (destination === 'item') return 'Item'
    return titleCase(destination || 'Research')
  }, [destination])

  async function writeCanonical(value: unknown) {
    if (!canApply) throw new Error('This research result is not mapped to a safe Item field yet.')
    const now = new Date().toISOString()

    if (destination === 'item') {
      const result = await supabase.from('items')
        .update({ [field]: value, updated_at: now })
        .eq('workspace_id', workspaceId)
        .eq('id', itemId)
      if (result.error) throw result.error
      return
    }

    const table = destination === 'identity' ? 'item_identity' : 'passports'
    const existing = await supabase.from(table).select('item_id')
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
      .maybeSingle()
    if (existing.error) throw existing.error

    const payload = { [field]: value, updated_at: now }
    const result = existing.data
      ? await supabase.from(table).update(payload).eq('workspace_id', workspaceId).eq('item_id', itemId)
      : await supabase.from(table).insert({ workspace_id: workspaceId, item_id: itemId, ...payload })
    if (result.error) throw result.error
  }

  async function confirm() {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const value = editing ? editedValue(draft, finding.proposed_value) : finding.proposed_value
      await writeCanonical(value)
      const now = new Date().toISOString()
      const findingUpdate = await supabase.from('research_findings').update({
        proposed_value: value,
        proposal_status: 'applied',
        decision: 'accepted',
        accepted_at: now,
        applied_at: now,
        updated_at: now,
      }).eq('workspace_id', workspaceId).eq('id', finding.id)
      if (findingUpdate.error) throw findingUpdate.error
      setMessage(`Added to ${destinationLabel}.`)
      setEditing(false)
      await onChanged?.()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This detail could not be added.')
    } finally {
      setBusy(false)
    }
  }

  async function keepOnly() {
    if (busy) return
    setBusy(true)
    setMessage('')
    const result = await supabase.from('research_findings').update({
      proposal_status: 'kept',
      decision: 'accepted',
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('id', finding.id)
    setBusy(false)
    if (result.error) return setMessage(result.error.message)
    setMessage('Kept as research evidence only.')
    await onChanged?.()
  }

  async function reject() {
    if (busy) return
    setBusy(true)
    setMessage('')
    const result = await supabase.from('research_findings').update({
      proposal_status: 'ignored',
      decision: 'rejected',
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('id', finding.id)
    setBusy(false)
    if (result.error) return setMessage(result.error.message)
    setMessage('Rejected.')
    await onChanged?.()
  }

  if (!finding.proposed_destination || !finding.proposed_field) return null

  if (finding.proposal_status === 'applied') {
    return <div className="bench-guided-actions"><span className="status-pill status-complete">✓ Added to {destinationLabel}</span></div>
  }
  if (finding.proposal_status === 'kept') {
    return <div className="bench-guided-actions"><span className="status-pill">Kept as research only</span></div>
  }
  if (finding.proposal_status === 'ignored' || finding.decision === 'rejected') {
    return <div className="bench-guided-actions"><span className="status-pill">Rejected</span></div>
  }

  return <div className="bench-research-review">
    {editing && <label className="bench-research-edit-value">
      <span>Edit before adding</span>
      <textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} />
    </label>}
    <div className="bench-guided-actions">
      {canApply && <button type="button" onClick={() => void confirm()} disabled={busy}>{busy ? 'Saving…' : editing ? `Save to ${destinationLabel}` : `Confirm & add to ${destinationLabel}`}</button>}
      {canApply && <button type="button" className="secondary" onClick={() => { setEditing((value) => !value); setMessage('') }} disabled={busy}>{editing ? 'Cancel edit' : 'Edit first'}</button>}
      <button type="button" className="secondary" onClick={() => void keepOnly()} disabled={busy}>Keep as research</button>
      <button type="button" className="secondary" onClick={() => void reject()} disabled={busy}>Reject</button>
    </div>
    {!canApply && <p className="bench-guided-help">This finding is useful evidence, but it is not mapped to a safe editable Item field.</p>}
    {message && <p className="bench-guided-message">{message}</p>}
  </div>
}
