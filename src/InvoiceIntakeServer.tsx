import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

type IntakeQueue = 'inbox' | 'review' | 'completed'

type Invoice = {
  id: string
  vendor_name: string
  invoice_number: string
  invoice_date: string | null
  currency: string
  subtotal: number | null
  fees: number | null
  postage: number | null
  total: number | null
  exchange_rate_to_aud: number | null
  exchange_rate_date: string | null
  subtotal_aud: number | null
  fees_aud: number | null
  postage_aud: number | null
  total_aud: number | null
  original_filename: string
  mime_type: string
  storage_path: string
  extraction_status: string
  created_at: string
}

type DraftLine = {
  id: string
  line_number: number | null
  lot_number: string
  raw_text: string
  proposed_title: string
  proposed_type: string
  proposed_purpose: string
  quantity: number
  unit_price: number | null
  line_total: number | null
  unit_price_aud: number | null
  line_total_aud: number | null
  confidence: number | null
  include_on_import: boolean
  review_note: string
  created_item_id: string | null
}

type ImportedItem = {
  id: string
  item_number: number
  title: string
}

const itemTypes = ['watch', 'clock', 'jewellery', 'accessory', 'other']
const itemPurposes = ['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other']
const queueStatus: Record<IntakeQueue, string> = {
  inbox: 'uploaded',
  review: 'needs_review',
  completed: 'imported',
}

const queueCopy: Record<IntakeQueue, { eyebrow: string; title: string; description: string; listTitle: string; empty: string }> = {
  inbox: {
    eyebrow: 'BULK INTAKE',
    title: 'Invoice inbox',
    description: 'Upload source documents and have Calibre extract draft records. Nothing enters Inventory until review and import.',
    listTitle: 'Unread invoices',
    empty: 'No unread invoices.',
  },
  review: {
    eyebrow: 'REVIEW QUEUE',
    title: 'Ready to Review',
    description: 'Check extracted facts, titles and costs before committing Items to Inventory.',
    listTitle: 'Awaiting review',
    empty: 'Nothing is waiting for review.',
  },
  completed: {
    eyebrow: 'INTAKE HISTORY',
    title: 'Completed intake',
    description: 'Imported source documents and the Items they created. Originals remain preserved in Files.',
    listTitle: 'Imported invoices',
    empty: 'No completed invoice imports yet.',
  },
}

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'
}

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function roundMoney(value: number | null) {
  if (value == null || Number.isNaN(Number(value))) return null
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

async function sha256File(file: File) {
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('')
}

export default function InvoiceIntakeServer({ workspaceId, queue }: { workspaceId: string; queue: IntakeQueue }) {
  const [open, setOpen] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [reading, setReading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const visible = queue !== 'inbox' || open
  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null
  const includedCount = lines.filter((line) => line.include_on_import && !line.created_item_id).length
  const importedCount = lines.filter((line) => Boolean(line.created_item_id)).length
  const copy = queueCopy[queue]

  async function loadInvoices(selectId?: string) {
    if (!workspaceId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('acquisition_invoices')
      .select('id,vendor_name,invoice_number,invoice_date,currency,subtotal,fees,postage,total,exchange_rate_to_aud,exchange_rate_date,subtotal_aud,fees_aud,postage_aud,total_aud,original_filename,mime_type,storage_path,extraction_status,created_at')
      .eq('workspace_id', workspaceId)
      .eq('extraction_status', queueStatus[queue])
      .order('created_at', { ascending: false })
      .limit(100)
    setLoading(false)
    if (error) {
      setMessage(`Invoices failed to load: ${error.message}`)
      return
    }
    const rows = (data ?? []) as Invoice[]
    setInvoices(rows)
    const target = (selectId && rows.some((invoice) => invoice.id === selectId) ? selectId : '')
      || (rows.some((invoice) => invoice.id === selectedId) ? selectedId : '')
      || rows[0]?.id
      || ''
    setSelectedId(target)
    if (!target) {
      setLines([])
      setImportedItems([])
      setDirty(false)
    }
  }

  async function loadImportedItems(ids: string[]) {
    const uniqueIds = [...new Set(ids.filter(Boolean))]
    if (!uniqueIds.length) {
      setImportedItems([])
      return
    }
    const { data, error } = await supabase
      .from('items')
      .select('id,item_number,title')
      .eq('workspace_id', workspaceId)
      .in('id', uniqueIds)
      .order('item_number', { ascending: true })
    if (error) {
      setMessage(`Items were imported, but the handoff list could not load: ${error.message}`)
      return
    }
    setImportedItems((data ?? []) as ImportedItem[])
  }

  async function loadLines(invoiceId: string) {
    if (!invoiceId) {
      setLines([])
      setImportedItems([])
      setDirty(false)
      return
    }
    const { data, error } = await supabase
      .from('acquisition_invoice_lines')
      .select('id,line_number,lot_number,raw_text,proposed_title,proposed_type,proposed_purpose,quantity,unit_price,line_total,unit_price_aud,line_total_aud,confidence,include_on_import,review_note,created_item_id')
      .eq('workspace_id', workspaceId)
      .eq('invoice_id', invoiceId)
      .order('line_number', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) {
      setMessage(`Invoice lines failed to load: ${error.message}`)
      return
    }
    const rows = (data ?? []) as DraftLine[]
    setLines(rows)
    setDirty(false)
    if (queue === 'completed') await loadImportedItems(rows.map((line) => line.created_item_id ?? ''))
    else setImportedItems([])
  }

  useEffect(() => {
    setSelectedId('')
    setLines([])
    setImportedItems([])
    setDirty(false)
    setMessage('')
    if (visible && workspaceId) void loadInvoices()
  }, [visible, workspaceId, queue])

  useEffect(() => {
    if (visible && selectedId) void loadLines(selectedId)
  }, [visible, selectedId, queue])

  async function uploadInvoice(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !workspaceId || queue !== 'inbox') return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) {
      setMessage('Use a PDF or image invoice.')
      return
    }

    setImportedItems([])
    setUploading(true)
    setMessage('Checking invoice…')

    let fileHash = ''
    try {
      fileHash = await sha256File(file)
    } catch {
      setUploading(false)
      setMessage('This device could not fingerprint the invoice file. Try the upload again.')
      return
    }

    const duplicateResult = await supabase
      .from('acquisition_invoices')
      .select('id,vendor_name,invoice_number,original_filename,extraction_status')
      .eq('workspace_id', workspaceId)
      .eq('file_sha256', fileHash)
      .neq('extraction_status', 'duplicate')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (duplicateResult.error) {
      setUploading(false)
      setMessage(`Duplicate check failed: ${duplicateResult.error.message}`)
      return
    }
    if (duplicateResult.data) {
      if (fileRef.current) fileRef.current.value = ''
      setUploading(false)
      const label = [duplicateResult.data.vendor_name, duplicateResult.data.invoice_number ? `invoice ${duplicateResult.data.invoice_number}` : ''].filter(Boolean).join(' · ')
      const location = duplicateResult.data.extraction_status === 'imported' ? 'Completed' : duplicateResult.data.extraction_status === 'needs_review' ? 'Ready to Review' : 'Inbox'
      setMessage(`This exact invoice file is already in Calibre${label ? ` (${label})` : ''}. The existing record is in ${location}; no duplicate was uploaded.`)
      if (duplicateResult.data.extraction_status === 'uploaded') await loadInvoices(duplicateResult.data.id)
      return
    }

    setMessage('Uploading invoice…')
    const id = crypto.randomUUID()
    const path = `${workspaceId}/invoices/${id}/${safeName(file.name)}`
    const storageResult = await supabase.storage.from('calibre-media').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
    })
    if (storageResult.error) {
      setUploading(false)
      setMessage(`Invoice upload failed: ${storageResult.error.message}`)
      return
    }

    const rowResult = await supabase.from('acquisition_invoices').insert({
      id,
      workspace_id: workspaceId,
      original_filename: file.name,
      mime_type: file.type || (isPdf ? 'application/pdf' : ''),
      byte_size: file.size,
      storage_path: path,
      file_sha256: fileHash,
      extraction_status: 'uploaded',
    })
    if (rowResult.error) {
      await supabase.storage.from('calibre-media').remove([path])
      setUploading(false)
      const duplicate = rowResult.error.code === '23505' || rowResult.error.message.toLowerCase().includes('duplicate')
      setMessage(duplicate ? 'That invoice is already in Calibre. The existing record has been kept and the duplicate upload was discarded.' : `Invoice record failed: ${rowResult.error.message}`)
      return
    }

    if (fileRef.current) fileRef.current.value = ''
    setUploading(false)
    setMessage('Invoice uploaded. No Items have been created.')
    await loadInvoices(id)
  }

  async function readInvoice() {
    if (!selected || reading || queue !== 'inbox') return
    setImportedItems([])
    setReading(true)
    setMessage('Reading invoice…')

    const { data, error } = await supabase.functions.invoke('extract-invoice', {
      body: { invoice_id: selected.id },
    })

    setReading(false)
    if (error) {
      let detail = error.message
      const context = (error as any)?.context
      if (context && typeof context.json === 'function') {
        try {
          const payload = await context.json()
          if (payload?.error) detail = payload.error
        } catch {
          // Keep the original function error.
        }
      }
      const duplicate = detail.toLowerCase().includes('duplicate') || detail.toLowerCase().includes('acquisition_invoices_business_identity_uq')
      setMessage(duplicate ? 'This appears to be the same vendor invoice already stored in Calibre. The existing invoice has been kept rather than creating another financial record.' : `Invoice reading failed: ${detail}`)
      return
    }

    const count = Number(data?.line_count ?? 0)
    const fx = Number(data?.aud_rate)
    const fxText = Number.isFinite(fx) && data?.currency && data.currency !== 'AUD'
      ? ` Converted to AUD at ${fx.toFixed(5)}${data?.aud_rate_date ? ` (${data.aud_rate_date})` : ''}.`
      : ''
    const warning = data?.aud_warning ? ` ${data.aud_warning}` : ''
    setMessage(`Invoice read successfully. ${count} draft line${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} now in Ready to Review.${fxText}${warning} The original document remains in Files.`)
    await loadInvoices()
  }

  function patchLine(id: string, patch: Partial<DraftLine>) {
    if (queue !== 'review') return
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line))
    setDirty(true)
  }

  async function saveDrafts(showSuccess = true) {
    if (!selected || saving || queue !== 'review') return false
    const editable = lines.filter((line) => !line.created_item_id)
    if (editable.some((line) => line.include_on_import && !line.proposed_title.trim())) {
      setMessage('Every included line needs a title before it can be saved/imported.')
      return false
    }

    const rate = selected.exchange_rate_to_aud
    const toAud = (value: number | null) => value == null || rate == null ? null : roundMoney(Number(value) * Number(rate))

    setSaving(true)
    const results = await Promise.all(editable.map((line) => supabase
      .from('acquisition_invoice_lines')
      .update({
        proposed_title: line.proposed_title.trim(),
        proposed_type: itemTypes.includes(line.proposed_type) ? line.proposed_type : 'other',
        proposed_purpose: itemPurposes.includes(line.proposed_purpose) ? line.proposed_purpose : 'resale',
        quantity: Math.max(1, Number(line.quantity) || 1),
        unit_price: line.unit_price == null || Number.isNaN(Number(line.unit_price)) ? null : Number(line.unit_price),
        line_total: line.line_total == null || Number.isNaN(Number(line.line_total)) ? null : Number(line.line_total),
        unit_price_aud: toAud(line.unit_price),
        line_total_aud: toAud(line.line_total),
        include_on_import: line.include_on_import,
        review_note: line.review_note,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('id', line.id)))
    setSaving(false)

    const failed = results.find((result) => result.error)
    if (failed?.error) {
      setMessage(`Draft changes could not be saved: ${failed.error.message}`)
      return false
    }

    setDirty(false)
    if (showSuccess) setMessage('Draft review saved. Nothing has been imported yet.')
    await loadLines(selected.id)
    return true
  }

  async function importReviewed() {
    if (!selected || importing || includedCount === 0 || queue !== 'review') return
    if (dirty) {
      const saved = await saveDrafts(false)
      if (!saved) return
    }

    setImportedItems([])
    setImporting(true)
    setMessage(`Importing ${includedCount} reviewed line${includedCount === 1 ? '' : 's'}…`)
    const { data, error } = await supabase.rpc('import_acquisition_invoice', {
      p_workspace_id: workspaceId,
      p_invoice_id: selected.id,
    })
    setImporting(false)

    if (error) {
      setMessage(`Invoice import failed: ${error.message}`)
      return
    }

    const row = Array.isArray(data) ? data[0] : data
    const count = Number(row?.created_count ?? 0)
    const ids = Array.isArray(row?.created_item_ids) ? row.created_item_ids.filter(Boolean).map(String) : []
    setMessage(`${count} Item${count === 1 ? '' : 's'} created. This invoice is now in Completed; the original remains in Files and linked to each imported Item.`)
    await loadImportedItems(ids)
    await loadInvoices()
  }

  if (!visible) {
    return <button type="button" className="secondary" onClick={() => setOpen(true)}>Import invoice</button>
  }

  return (
    <section className="invoice-intake-card">
      <div className="invoice-intake-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="muted">{copy.description}</p>
        </div>
        {queue === 'inbox' && <button type="button" className="secondary small" onClick={() => setOpen(false)}>Close</button>}
      </div>

      {queue === 'inbox' && <label className="invoice-upload-button">
        <span>{uploading ? 'Uploading…' : 'Upload PDF or photo'}</span>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" disabled={uploading} onChange={uploadInvoice} />
      </label>}
      {message && <p className="invoice-message">{message}</p>}
      {importedItems.length > 0 && (
        <div className="invoice-review-actions">
          <strong>Imported Items</strong>
          {importedItems.map((item) => (
            <button key={item.id} type="button" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(item.id)}` }}>
              Open #{item.item_number} · {item.title}
            </button>
          ))}
        </div>
      )}

      <div className="invoice-intake-grid">
        <aside className="invoice-list-panel">
          <strong>{copy.listTitle}</strong>
          {loading && <p className="muted">Loading…</p>}
          {!loading && invoices.length === 0 && <p className="muted">{copy.empty}</p>}
          {invoices.map((invoice) => (
            <button type="button" key={invoice.id} className={selectedId === invoice.id ? 'active' : ''} onClick={() => setSelectedId(invoice.id)}>
              <span>{invoice.vendor_name || invoice.original_filename}</span>
              <small>{invoice.invoice_number || titleCase(invoice.extraction_status)}</small>
            </button>
          ))}
        </aside>

        <div className="invoice-review-panel">
          {!selected ? <p className="muted">{queue === 'inbox' ? 'Choose or upload an invoice.' : queue === 'review' ? 'Choose an invoice to review.' : 'Choose a completed invoice.'}</p> : <>
            <div className="invoice-summary">
              <div><span>File</span><strong>{selected.original_filename}</strong></div>
              <div><span>Vendor</span><strong>{selected.vendor_name || 'Unresolved'}</strong></div>
              <div><span>Invoice</span><strong>{selected.invoice_number || 'Unresolved'}</strong></div>
              <div><span>Date</span><strong>{selected.invoice_date || 'Unresolved'}</strong></div>
              <div><span>Original total</span><strong>{money(selected.total, selected.currency)}</strong></div>
              <div><span>AUD total</span><strong>{money(selected.total_aud, 'AUD')}</strong></div>
              {selected.currency !== 'AUD' && <div><span>FX rate</span><strong>{selected.exchange_rate_to_aud == null ? 'Unavailable' : `1 ${selected.currency} = ${Number(selected.exchange_rate_to_aud).toFixed(5)} AUD`}</strong></div>}
              {selected.currency !== 'AUD' && <div><span>Rate date</span><strong>{selected.exchange_rate_date || 'Unavailable'}</strong></div>}
            </div>

            {(selected.subtotal != null || selected.fees != null || selected.postage != null) && <div className="invoice-fx-breakdown">
              <span>Subtotal: {money(selected.subtotal, selected.currency)}{selected.currency !== 'AUD' && selected.subtotal_aud != null ? ` → ${money(selected.subtotal_aud, 'AUD')}` : ''}</span>
              <span>Fees: {money(selected.fees, selected.currency)}{selected.currency !== 'AUD' && selected.fees_aud != null ? ` → ${money(selected.fees_aud, 'AUD')}` : ''}</span>
              <span>Postage: {money(selected.postage, selected.currency)}{selected.currency !== 'AUD' && selected.postage_aud != null ? ` → ${money(selected.postage_aud, 'AUD')}` : ''}</span>
            </div>}

            <div className="invoice-extraction-actions">
              {queue === 'inbox' && <button type="button" onClick={readInvoice} disabled={reading || importing}>{reading ? 'Reading invoice…' : 'Read invoice'}</button>}
              {queue === 'inbox' && <span>The private stored file is read server-side. Successful extraction moves it to Ready to Review.</span>}
              {queue === 'review' && <span>Review the extracted lines below, save any corrections, then import the approved Items.</span>}
              {queue === 'completed' && <span>Import complete. This is read-only intake history; the original source document remains preserved in Files.</span>}
            </div>

            <div className="invoice-draft-lines">
              <div className="invoice-lines-heading">
                <strong>{queue === 'completed' ? 'Imported lines' : 'Draft lines'}</strong>
                <span>{lines.length} total · {includedCount} to import · {importedCount} imported</span>
              </div>
              {lines.length === 0 && <p className="muted">{queue === 'inbox' ? 'No extracted lines yet. Tap Read invoice.' : 'No line records found for this invoice.'}</p>}
              {lines.map((line) => {
                const locked = queue !== 'review' || Boolean(line.created_item_id)
                return (
                  <article key={line.id} className={locked && line.created_item_id ? 'invoice-line imported' : 'invoice-line'}>
                    <div className="invoice-line-topline">
                      <label className="invoice-include">
                        <input type="checkbox" checked={Boolean(line.created_item_id) || line.include_on_import} disabled={locked} onChange={(event) => patchLine(line.id, { include_on_import: event.target.checked })} />
                        <span>{line.created_item_id ? 'Imported' : line.include_on_import ? 'Include' : 'Excluded'}</span>
                      </label>
                      <span>{line.lot_number ? `Lot ${line.lot_number}` : `Line ${line.line_number ?? '—'}`}</span>
                      <span>{line.confidence == null ? 'Confidence unknown' : `${Math.round(Number(line.confidence) * 100)}% confidence`}</span>
                    </div>

                    <label className="invoice-field invoice-title-field">Title
                      <input value={line.proposed_title} disabled={locked} onChange={(event) => patchLine(line.id, { proposed_title: event.target.value })} />
                    </label>

                    <div className="invoice-line-fields">
                      <label className="invoice-field">Type
                        <select value={line.proposed_type} disabled={locked} onChange={(event) => patchLine(line.id, { proposed_type: event.target.value })}>
                          {itemTypes.map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}
                        </select>
                      </label>
                      <label className="invoice-field">Purpose
                        <select value={line.proposed_purpose} disabled={locked} onChange={(event) => patchLine(line.id, { proposed_purpose: event.target.value })}>
                          {itemPurposes.map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}
                        </select>
                      </label>
                      <label className="invoice-field">Qty
                        <input type="number" min="1" step="1" value={Number(line.quantity)} disabled={locked} onChange={(event) => patchLine(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} />
                      </label>
                      <label className="invoice-field">Line total ({selected.currency})
                        <input type="number" step="0.01" value={line.line_total ?? ''} disabled={locked} onChange={(event) => patchLine(line.id, { line_total: event.target.value === '' ? null : Number(event.target.value) })} />
                      </label>
                    </div>

                    {selected.currency !== 'AUD' && <p className="invoice-aud-line-value">AUD value: <strong>{money(line.line_total_aud, 'AUD')}</strong></p>}

                    <details className="invoice-source-detail">
                      <summary>Source text</summary>
                      <p>{line.raw_text || 'No source text captured.'}</p>
                    </details>

                    <label className="invoice-field">Review note
                      <textarea rows={2} value={line.review_note} disabled={locked} onChange={(event) => patchLine(line.id, { review_note: event.target.value })} />
                    </label>
                  </article>
                )
              })}
            </div>

            {queue === 'review' && lines.length > 0 && <div className="invoice-review-actions">
              <button type="button" className="secondary" disabled={saving || importing || !dirty} onClick={() => void saveDrafts()}>{saving ? 'Saving…' : dirty ? 'Save review' : 'Review saved'}</button>
              <button type="button" disabled={saving || importing || includedCount === 0} onClick={importReviewed}>{importing ? 'Importing…' : `Import ${includedCount} reviewed item${includedCount === 1 ? '' : 's'}`}</button>
            </div>}
          </>}
        </div>
      </div>
    </section>
  )
}
