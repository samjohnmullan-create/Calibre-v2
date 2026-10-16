import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-component-state.css'

type ComponentState = 'installed' | 'removed' | 'opened' | 'unopened' | 'disassembled' | 'reassembled' | 'cleaning' | 'stored' | 'not_applicable'

type ComponentRow = {
  id?: string
  component_key: string
  component_label: string
  state: ComponentState | ''
  location: string
  notes: string
  sequence: number
  updated_at?: string
}

const DEFAULT_COMPONENTS: Array<Pick<ComponentRow, 'component_key' | 'component_label' | 'sequence'>> = [
  { component_key: 'movement', component_label: 'Movement', sequence: 10 },
  { component_key: 'hands', component_label: 'Hands', sequence: 20 },
  { component_key: 'dial', component_label: 'Dial', sequence: 30 },
  { component_key: 'balance', component_label: 'Balance', sequence: 40 },
  { component_key: 'escapement', component_label: 'Escapement', sequence: 50 },
  { component_key: 'train', component_label: 'Train of wheels', sequence: 60 },
  { component_key: 'barrel', component_label: 'Barrel / mainspring', sequence: 70 },
  { component_key: 'keyless', component_label: 'Keyless works', sequence: 80 },
  { component_key: 'stem_crown', component_label: 'Stem / crown', sequence: 90 },
  { component_key: 'case_crystal', component_label: 'Case / crystal', sequence: 100 },
]

const STATES: Array<{ value: ComponentState; label: string }> = [
  { value: 'installed', label: 'Installed' },
  { value: 'removed', label: 'Removed' },
  { value: 'opened', label: 'Opened' },
  { value: 'unopened', label: 'Unopened' },
  { value: 'disassembled', label: 'Disassembled' },
  { value: 'reassembled', label: 'Reassembled' },
  { value: 'cleaning', label: 'In cleaning' },
  { value: 'stored', label: 'Stored' },
  { value: 'not_applicable', label: 'N/A' },
]

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isOut(row: ComponentRow) {
  return !!row.state && !['installed', 'reassembled', 'not_applicable'].includes(row.state)
}

export default function WorkComponentState({
  workspaceId,
  itemId,
  workId,
  onChanged,
  compact = false,
}: {
  workspaceId: string
  itemId: string
  workId: string
  onChanged?: () => Promise<void> | void
  compact?: boolean
}) {
  const [rows, setRows] = useState<ComponentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [message, setMessage] = useState('')
  const [customLabel, setCustomLabel] = useState('')

  async function load() {
    if (!workspaceId || !workId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('work_component_states')
      .select('id,component_key,component_label,state,location,notes,sequence,updated_at')
      .eq('workspace_id', workspaceId)
      .eq('work_id', workId)
      .order('sequence', { ascending: true })
      .order('component_label', { ascending: true })
    setLoading(false)
    if (error) {
      setMessage(`Component state could not load: ${error.message}`)
      return
    }

    const existing = new Map((data ?? []).map((row) => [row.component_key, row as ComponentRow]))
    const merged: ComponentRow[] = DEFAULT_COMPONENTS.map((component) => existing.get(component.component_key) ?? {
      ...component,
      state: '',
      location: '',
      notes: '',
    })
    for (const row of (data ?? []) as ComponentRow[]) {
      if (!DEFAULT_COMPONENTS.some((component) => component.component_key === row.component_key)) merged.push(row)
    }
    merged.sort((a, b) => a.sequence - b.sequence || a.component_label.localeCompare(b.component_label))
    setRows(merged)
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, workId])

  const recorded = useMemo(() => rows.filter((row) => !!row.state), [rows])
  const outCount = useMemo(() => recorded.filter(isOut).length, [recorded])

  function patchRow(componentKey: string, patch: Partial<ComponentRow>) {
    setRows((current) => current.map((row) => row.component_key === componentKey ? { ...row, ...patch } : row))
  }

  async function saveRow(row: ComponentRow) {
    if (!row.state || savingKey) return
    setSavingKey(row.component_key)
    setMessage('')
    const now = new Date().toISOString()
    const payload = {
      workspace_id: workspaceId,
      work_id: workId,
      item_id: itemId,
      component_key: row.component_key,
      component_label: row.component_label,
      state: row.state,
      location: row.location.trim(),
      notes: row.notes.trim(),
      sequence: row.sequence,
      updated_at: now,
    }
    const { error } = await supabase
      .from('work_component_states')
      .upsert(payload, { onConflict: 'workspace_id,work_id,component_key' })
    if (error) {
      setSavingKey('')
      setMessage(`Component state could not save: ${error.message}`)
      return
    }

    await supabase.from('work_events').insert({
      workspace_id: workspaceId,
      work_id: workId,
      item_id: itemId,
      event_type: 'component_state_changed',
      summary: `${row.component_label}: ${titleCase(row.state)}${row.location.trim() ? ` · ${row.location.trim()}` : ''}`,
      details: {
        component_key: row.component_key,
        component_label: row.component_label,
        state: row.state,
        location: row.location.trim(),
        notes: row.notes.trim(),
      },
      actor_type: 'user',
    })

    setSavingKey('')
    setMessage(`${row.component_label} state saved.`)
    await load()
    await onChanged?.()
  }

  async function addCustom(event: FormEvent) {
    event.preventDefault()
    const label = customLabel.trim()
    if (!label) return
    const keyBase = slug(label) || `component_${Date.now()}`
    let key = keyBase
    let suffix = 2
    while (rows.some((row) => row.component_key === key)) {
      key = `${keyBase}_${suffix}`
      suffix += 1
    }
    const sequence = Math.max(100, ...rows.map((row) => row.sequence)) + 10
    setRows((current) => [...current, { component_key: key, component_label: label, state: '', location: '', notes: '', sequence }])
    setCustomLabel('')
  }

  if (loading) return <section className="work-component-state section-card"><p className="eyebrow">PHYSICAL STATE</p><strong>Loading component state…</strong></section>

  return (
    <section className={`work-component-state section-card ${compact ? 'compact' : ''}`} aria-label="Component and tray state">
      <div className="work-component-state-heading">
        <div><p className="eyebrow">PHYSICAL STATE</p><h3>Components & trays</h3><p>Record where the watch physically is, not just which procedure step is open.</p></div>
        <div className="work-component-state-count"><strong>{outCount}</strong><span>out / open</span><small>{recorded.length} recorded</small></div>
      </div>

      {message && <p className="work-component-state-message">{message}</p>}

      <div className="work-component-state-list">
        {rows.map((row) => (
          <article key={row.component_key} className={`${row.state ? `state-${row.state}` : 'state-unrecorded'} ${isOut(row) ? 'out' : ''}`}>
            <div className="work-component-state-title">
              <strong>{row.component_label}</strong>
              <span>{row.state ? titleCase(row.state) : 'Not recorded'}</span>
            </div>
            <div className="work-component-state-fields">
              <label>State
                <select value={row.state} onChange={(event) => patchRow(row.component_key, { state: event.target.value as ComponentState | '' })}>
                  <option value="">Not recorded</option>
                  {STATES.map((state) => <option key={state.value} value={state.value}>{state.label}</option>)}
                </select>
              </label>
              <label>Location / tray
                <input list="calibre-component-locations" value={row.location} onChange={(event) => patchRow(row.component_key, { location: event.target.value })} placeholder="Tray A, movement holder, cleaner…" />
              </label>
              <label className="notes">Notes
                <input value={row.notes} onChange={(event) => patchRow(row.component_key, { notes: event.target.value })} placeholder="Optional physical-state note" />
              </label>
              <button type="button" onClick={() => void saveRow(row)} disabled={!row.state || !!savingKey}>{savingKey === row.component_key ? 'Saving…' : 'Save'}</button>
            </div>
          </article>
        ))}
      </div>

      <datalist id="calibre-component-locations">
        <option value="Watch" />
        <option value="Movement holder" />
        <option value="Tray A" />
        <option value="Tray B" />
        <option value="Tray C" />
        <option value="Parts pot" />
        <option value="Ultrasonic basket" />
        <option value="Cleaner" />
        <option value="Drying" />
        <option value="Parts stock" />
      </datalist>

      <form className="work-component-state-add" onSubmit={addCustom}>
        <label>Add another component<input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="Calendar works, automatic module…" /></label>
        <button type="submit" className="secondary" disabled={!customLabel.trim()}>Add</button>
      </form>
    </section>
  )
}
