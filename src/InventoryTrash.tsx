import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type TrashKind = 'item' | 'part' | 'tool' | 'consumable'
type TrashRow = {
  id: string
  kind: TrashKind
  title: string
  detail: string
  archived_at: string
  archive_reason: string
}

type DeleteEligibility = {
  entity_type: TrashKind
  entity_id: string
  can_delete: boolean
  reasons: string[]
}

type Props = {
  workspaceId: string
  refreshToken?: number
  onRestored?: () => void
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function InventoryTrash({ workspaceId, refreshToken = 0, onRestored }: Props) {
  const [rows, setRows] = useState<TrashRow[]>([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [message, setMessage] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | TrashKind>('all')

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    const [itemsResult, partsResult, toolsResult, consumablesResult] = await Promise.all([
      supabase.from('items').select('id,item_number,title,type,purpose,archived_at,archive_reason').eq('workspace_id', workspaceId).not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(200),
      supabase.from('parts').select('id,part_type,manufacturer,reference,description,archived_at,archive_reason').eq('workspace_id', workspaceId).not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(200),
      supabase.from('tools').select('id,name,manufacturer,model,category,archived_at,archive_reason').eq('workspace_id', workspaceId).not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(200),
      supabase.from('consumables').select('id,name,category,unit,archived_at,archive_reason').eq('workspace_id', workspaceId).not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(200),
    ])
    setLoading(false)
    const error = itemsResult.error ?? partsResult.error ?? toolsResult.error ?? consumablesResult.error
    if (error) {
      setMessage(`Trash could not be loaded: ${error.message}`)
      return
    }

    const next: TrashRow[] = [
      ...(itemsResult.data ?? []).map((row) => ({
        id: row.id,
        kind: 'item' as const,
        title: `Item #${row.item_number} · ${row.title}`,
        detail: `${titleCase(row.type)} · ${titleCase(row.purpose)}`,
        archived_at: row.archived_at as string,
        archive_reason: row.archive_reason || '',
      })),
      ...(partsResult.data ?? []).map((row) => ({
        id: row.id,
        kind: 'part' as const,
        title: row.description || titleCase(row.part_type),
        detail: [row.manufacturer, row.reference, titleCase(row.part_type)].filter(Boolean).join(' · '),
        archived_at: row.archived_at as string,
        archive_reason: row.archive_reason || '',
      })),
      ...(toolsResult.data ?? []).map((row) => ({
        id: row.id,
        kind: 'tool' as const,
        title: row.name,
        detail: [row.manufacturer, row.model, row.category ? titleCase(row.category) : ''].filter(Boolean).join(' · '),
        archived_at: row.archived_at as string,
        archive_reason: row.archive_reason || '',
      })),
      ...(consumablesResult.data ?? []).map((row) => ({
        id: row.id,
        kind: 'consumable' as const,
        title: row.name,
        detail: [row.category ? titleCase(row.category) : '', row.unit].filter(Boolean).join(' · '),
        archived_at: row.archived_at as string,
        archive_reason: row.archive_reason || '',
      })),
    ].sort((a, b) => b.archived_at.localeCompare(a.archived_at))

    setRows(next)
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, refreshToken])

  const visibleRows = useMemo(() => kindFilter === 'all' ? rows : rows.filter((row) => row.kind === kindFilter), [rows, kindFilter])
  const counts = useMemo(() => ({
    item: rows.filter((row) => row.kind === 'item').length,
    part: rows.filter((row) => row.kind === 'part').length,
    tool: rows.filter((row) => row.kind === 'tool').length,
    consumable: rows.filter((row) => row.kind === 'consumable').length,
  }), [rows])

  async function restore(row: TrashRow) {
    if (!workspaceId || restoringId || deletingId) return
    setRestoringId(row.id)
    const { error } = await supabase.rpc('restore_inventory_entity', {
      p_workspace_id: workspaceId,
      p_entity_type: row.kind,
      p_entity_id: row.id,
    })
    setRestoringId('')
    if (error) {
      setMessage(`Could not restore ${row.title}: ${error.message}`)
      return
    }
    setMessage(`${row.title} restored to active inventory.`)
    await load()
    onRestored?.()
  }

  async function permanentlyDelete(row: TrashRow) {
    if (!workspaceId || deletingId || restoringId) return
    setDeletingId(row.id)
    setMessage('Checking whether permanent deletion is safe…')
    const eligibilityResult = await supabase.rpc('inventory_delete_eligibility', {
      p_workspace_id: workspaceId,
      p_entity_type: row.kind,
      p_entity_id: row.id,
    })
    if (eligibilityResult.error) {
      setDeletingId('')
      setMessage(`Could not check ${row.title}: ${eligibilityResult.error.message}`)
      return
    }

    const eligibility = eligibilityResult.data as DeleteEligibility | null
    if (!eligibility?.can_delete) {
      setDeletingId('')
      const reasons = eligibility?.reasons?.length ? eligibility.reasons.join(' · ') : 'Dependent history exists.'
      setMessage(`Permanent delete blocked for ${row.title}: ${reasons}`)
      return
    }

    const confirmed = window.confirm(`Permanently delete “${row.title}”?\n\nCalibre found no linked history that requires preservation. This final deletion cannot be undone.`)
    if (!confirmed) {
      setDeletingId('')
      setMessage('Permanent deletion cancelled. The record remains safely archived.')
      return
    }

    const deleteResult = await supabase.rpc('permanently_delete_inventory_entity', {
      p_workspace_id: workspaceId,
      p_entity_type: row.kind,
      p_entity_id: row.id,
    })
    setDeletingId('')
    if (deleteResult.error) {
      setMessage(`Permanent delete failed for ${row.title}: ${deleteResult.error.message}`)
      return
    }

    setMessage(`${row.title} permanently deleted. Audit evidence of the deletion is retained where applicable.`)
    await load()
    onRestored?.()
  }

  return (
    <section className="inventory-trash">
      <div className="inventory-trash-heading">
        <div><p className="eyebrow">TRASH</p><h2>Archived inventory</h2><p className="muted">Archive is the normal Remove action. Restore is always preferred. Permanent deletion is available only for archived records that the database proves have no purchase, Work, fit, donor, sale, media, storage or other dependent history.</p></div>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <nav className="inventory-trash-filters" aria-label="Trash filters">
        <button type="button" className={kindFilter === 'all' ? 'active' : ''} onClick={() => setKindFilter('all')}>All <strong>{rows.length}</strong></button>
        <button type="button" className={kindFilter === 'item' ? 'active' : ''} onClick={() => setKindFilter('item')}>Items <strong>{counts.item}</strong></button>
        <button type="button" className={kindFilter === 'part' ? 'active' : ''} onClick={() => setKindFilter('part')}>Parts <strong>{counts.part}</strong></button>
        <button type="button" className={kindFilter === 'tool' ? 'active' : ''} onClick={() => setKindFilter('tool')}>Tools <strong>{counts.tool}</strong></button>
        <button type="button" className={kindFilter === 'consumable' ? 'active' : ''} onClick={() => setKindFilter('consumable')}>Consumables <strong>{counts.consumable}</strong></button>
      </nav>

      {message && <p className="inventory-message">{message}</p>}
      {loading && <div className="loading-card">Loading Trash…</div>}
      {!loading && visibleRows.length === 0 && <div className="inventory-empty"><strong>Trash is empty.</strong><span>Archived records will appear here and can be restored.</span></div>}

      <div className="inventory-trash-list">
        {visibleRows.map((row) => (
          <article key={`${row.kind}-${row.id}`} className="inventory-trash-row">
            <div className="inventory-trash-kind">{titleCase(row.kind)}</div>
            <div className="inventory-trash-main"><strong>{row.title}</strong><span>{row.detail}</span>{row.archive_reason && <small>Reason: {row.archive_reason}</small>}</div>
            <time dateTime={row.archived_at}>{new Date(row.archived_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</time>
            <div className="inventory-trash-actions">
              <button type="button" className="secondary small" disabled={restoringId === row.id || deletingId === row.id} onClick={() => void restore(row)}>{restoringId === row.id ? 'Restoring…' : 'Restore'}</button>
              <button type="button" className="danger small" disabled={restoringId === row.id || deletingId === row.id} onClick={() => void permanentlyDelete(row)}>{deletingId === row.id ? 'Checking…' : 'Delete permanently…'}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
