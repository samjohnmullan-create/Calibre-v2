import { FormEvent, useEffect, useState } from 'react'

type Props = {
  open: boolean
  label: string
  busy?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => Promise<void> | void
}

export default function ArchiveConfirmDialog({ open, label, busy = false, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

  if (!open) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onConfirm(reason.trim())
  }

  return (
    <div className="archive-dialog-backdrop" role="presentation" onClick={() => { if (!busy) onCancel() }}>
      <form className="archive-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div>
          <p className="eyebrow">REMOVE SAFELY</p>
          <h2 id="archive-dialog-title">Archive {label}?</h2>
          <p className="muted">This removes it from active inventory without deleting purchase cost, workshop history, donor links or audit evidence. You can restore it from Trash.</p>
        </div>
        <label>
          Reason <span className="muted">(optional)</span>
          <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Duplicate, no longer held, written off, entered by mistake…" autoFocus />
        </label>
        <div className="archive-dialog-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className="danger" disabled={busy}>{busy ? 'Archiving…' : 'Archive'}</button>
        </div>
      </form>
    </div>
  )
}
