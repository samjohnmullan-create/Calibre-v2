import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

type Invoice = {
  id: string
  vendor_name: string
  invoice_number: string
  currency: string
  total: number | null
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
  quantity: number
  line_total: number | null
  confidence: number | null
  review_note: string
}

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'
}

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

export default function InvoiceIntakeServer({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [uploading, setUploading] = useState(false)
  const [reading, setReading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null

  async function loadInvoices(selectId?: string) {
    if (!workspaceId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('acquisition_invoices')
      .select('id,vendor_name,invoice_number,currency,total,original_filename,mime_type,storage_path,extraction_status,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      setMessage(`Invoices failed to load: ${error.message}`)
      return
    }
    const rows = (data ?? []) as Invoice[]
    setInvoices(rows)
    const target = selectId || selectedId || rows[0]?.id || ''
    if (target) setSelectedId(target)
  }

  async function loadLines(invoiceId: string) {
    if (!invoiceId) {
      setLines([])
      return
    }
    const { data, error } = await supabase
      .from('acquisition_invoice_lines')
      .select('id,line_number,lot_number,raw_text,proposed_title,proposed_type,quantity,line_total,confidence,review_note')
      .eq('workspace_id', workspaceId)
      .eq('invoice_id', invoiceId)
      .order('line_number', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) {
      setMessage(`Invoice lines failed to load: ${error.message}`)
      return
    }
    setLines((data ?? []) as DraftLine[])
  }

  useEffect(() => {
    if (open && workspaceId) void loadInvoices()
  }, [open, workspaceId])

  useEffect(() => {
    if (open && selectedId) void loadLines(selectedId)
  }, [open, selectedId])

  async function uploadInvoice(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !workspaceId) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) {
      setMessage('Use a PDF or image invoice.')
      return
    }

    setUploading(true)
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
      extraction_status: 'uploaded',
    })
    if (rowResult.error) {
      await supabase.storage.from('calibre-media').remove([path])
      setUploading(false)
      setMessage(`Invoice record failed: ${rowResult.error.message}`)
      return
    }

    if (fileRef.current) fileRef.current.value = ''
    setUploading(false)
    setMessage('Invoice uploaded. No Items have been created.')
    await loadInvoices(id)
  }

  async function readInvoice() {
    if (!selected || reading) return
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
      setMessage(`Invoice reading failed: ${detail}`)
      return
    }

    const count = Number(data?.line_count ?? 0)
    setMessage(`Invoice read successfully. ${count} draft line${count === 1 ? '' : 's'} ready for review. No Items have been created.`)
    await loadInvoices(selected.id)
    await loadLines(selected.id)
  }

  if (!open) {
    return <button type="button" className="secondary" onClick={() => setOpen(true)}>Import invoice</button>
  }

  return (
    <section className="invoice-intake-card">
      <div className="invoice-intake-heading">
        <div>
          <p className="eyebrow">BULK INTAKE</p>
          <h2>Invoice intake</h2>
          <p className="muted">Upload the original. Calibre reads it server-side into draft rows for review before stock is created.</p>
        </div>
        <button type="button" className="secondary small" onClick={() => setOpen(false)}>Close</button>
      </div>

      <label className="invoice-upload-button">
        <span>{uploading ? 'Uploading…' : 'Upload PDF or photo'}</span>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" disabled={uploading} onChange={uploadInvoice} />
      </label>
      {message && <p className="invoice-message">{message}</p>}

      <div className="invoice-intake-grid">
        <aside className="invoice-list-panel">
          <strong>Invoices</strong>
          {loading && <p className="muted">Loading…</p>}
          {!loading && invoices.length === 0 && <p className="muted">No invoices uploaded yet.</p>}
          {invoices.map((invoice) => (
            <button type="button" key={invoice.id} className={selectedId === invoice.id ? 'active' : ''} onClick={() => setSelectedId(invoice.id)}>
              <span>{invoice.vendor_name || invoice.original_filename}</span>
              <small>{invoice.invoice_number || invoice.extraction_status}</small>
            </button>
          ))}
        </aside>

        <div className="invoice-review-panel">
          {!selected ? <p className="muted">Choose or upload an invoice.</p> : <>
            <div className="invoice-summary">
              <div><span>File</span><strong>{selected.original_filename}</strong></div>
              <div><span>Vendor</span><strong>{selected.vendor_name || 'Unresolved'}</strong></div>
              <div><span>Invoice</span><strong>{selected.invoice_number || 'Unresolved'}</strong></div>
              <div><span>Total</span><strong>{money(selected.total, selected.currency)}</strong></div>
            </div>

            <div className="invoice-extraction-actions">
              <button type="button" onClick={readInvoice} disabled={reading}>{reading ? 'Reading invoice…' : 'Read invoice'}</button>
              <span>The private stored file is read by the server. Results become draft rows only.</span>
            </div>

            <div className="invoice-draft-lines">
              <div className="invoice-lines-heading"><strong>Draft lines</strong><span>{lines.length}</span></div>
              {lines.length === 0 && <p className="muted">No extracted lines yet.</p>}
              {lines.map((line) => (
                <article key={line.id}>
                  <div>
                    <span>{line.lot_number ? `Lot ${line.lot_number}` : `Line ${line.line_number ?? '—'}`}</span>
                    <strong>{line.proposed_title || line.raw_text}</strong>
                    <small>{line.proposed_type} · qty {Number(line.quantity)}</small>
                  </div>
                  <div>
                    <strong>{money(line.line_total, selected.currency)}</strong>
                    <small>{line.confidence == null ? 'Confidence unknown' : `${Math.round(Number(line.confidence) * 100)}% confidence`}</small>
                  </div>
                  {line.review_note && <p>{line.review_note}</p>}
                </article>
              ))}
            </div>
          </>}
        </div>
      </div>
    </section>
  )
}
