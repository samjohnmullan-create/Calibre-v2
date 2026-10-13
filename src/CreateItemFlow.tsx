import { FormEvent, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type CreatedItem = {
  id: string
  item_number: number
  title: string
  type: string
  purpose: string
  status: string
}

const itemTypes = ['watch', 'clock', 'jewellery', 'accessory', 'other']
const itemPurposes = ['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other']

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function CreateItemFlow() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('watch')
  const [purpose, setPurpose] = useState('resale')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const openFlow = () => {
      setMessage('')
      setOpen(true)
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const button = target?.closest('button[aria-label="Create item"]')
      if (!button) return
      event.preventDefault()
      openFlow()
    }
    document.addEventListener('click', handleClick)
    window.addEventListener('calibre:new-item', openFlow)
    return () => {
      document.removeEventListener('click', handleClick)
      window.removeEventListener('calibre:new-item', openFlow)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  function resetAndClose() {
    if (busy) return
    setOpen(false)
    setTitle('')
    setType('watch')
    setPurpose('resale')
    setNotes('')
    setMessage('')
  }

  async function createItem(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || busy) return

    setBusy(true)
    setMessage('Creating Item…')

    const workspaceResult = await supabase
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (workspaceResult.error || !workspaceResult.data) {
      setBusy(false)
      setMessage(`Could not find workspace: ${workspaceResult.error?.message ?? 'No workspace found.'}`)
      return
    }

    const result = await supabase.rpc('create_item', {
      p_workspace_id: workspaceResult.data.id,
      p_title: title.trim(),
      p_type: type,
      p_purpose: purpose,
      p_notes: notes.trim(),
    })

    setBusy(false)

    if (result.error || !result.data) {
      setMessage(`Could not create Item: ${result.error?.message ?? 'No Item returned.'}`)
      return
    }

    const created = result.data as CreatedItem
    setOpen(false)
    setTitle('')
    setType('watch')
    setPurpose('resale')
    setNotes('')
    setMessage('')
    window.location.hash = `#/items/${encodeURIComponent(created.id)}`
  }

  if (!open) return null

  return (
    <div className="create-item-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) resetAndClose()
    }}>
      <section className="create-item-sheet" role="dialog" aria-modal="true" aria-labelledby="create-item-title">
        <div className="create-item-heading">
          <div>
            <p className="eyebrow">NEW ITEM</p>
            <h2 id="create-item-title">Add to Calibre</h2>
            <p className="muted">Capture the object now. Identity, photos, research and Work can be added afterwards.</p>
          </div>
          <button type="button" className="secondary small" onClick={resetAndClose} disabled={busy}>Close</button>
        </div>

        <form className="create-item-form" onSubmit={createItem}>
          <label className="create-item-wide">Title
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Oris black dial wristwatch" required />
          </label>

          <label>Type
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {itemTypes.map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}
            </select>
          </label>

          <label>Purpose
            <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
              {itemPurposes.map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}
            </select>
          </label>

          <label className="create-item-wide">Quick notes
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional condition, source or intake note" />
          </label>

          {message && <p className="create-item-message create-item-wide">{message}</p>}

          <div className="create-item-actions create-item-wide">
            <button type="button" className="secondary" onClick={resetAndClose} disabled={busy}>Cancel</button>
            <button type="submit" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create Item'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
