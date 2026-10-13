import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import './invoice-intake.css'

type Invoice = {
  id: string
  vendor_name: string
  invoice_number: string
  invoice_date: string | null
  currency: string
  total: number | null
  original_filename: string
  mime_type: string
  byte_size: number | null
  storage_path: string
  extraction_status: string
  created_at: string
}

type DraftLine = {
  id: string
  invoice_id: string
  line_number: number | null
  lot_number: string
  raw_text: string
  proposed_title: string
  proposed_type: string
  proposed_purpose: string
  quantity: number
  unit_price: number | null
  line_total: number | null
  confidence: number | null
  include_on_import: boolean
  review_note: string
}

type ParsedLine = {
  line_number?: number | null
  lot_number?: string
  raw_text?: string
  title?: string
  type?: string
  purpose?: string
  quantity?: number
  unit_price?: number | null
  line_total?: number | null
  confidence?: number | null
  review_note?: string
}

type ParsedInvoice = {
  vendor_name?: string
  invoice_number?: string
  invoice_date?: string | null
  currency?: string
  subtotal?: number | null
  fees?: number | null
  postage?: number | null
  total?: number | null
  lines?: ParsedLine[]
}

const itemTypes = new Set(['watch', 'clock', 'jewellery', 'accessory', 'other'])
const itemPurposes = new Set(['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other'])

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'
}

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

export default function InvoiceIntake({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [jsonText, setJsonText] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null

  async function loadInvoices(selectId?: string) {
    if (!workspaceId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('acquisition_invoices')
      .select('id,vendor_name,invoice_number,invoice_date,currency,total,original_filename,mime_type,byte_size,storage_path,extraction_status,created_at')
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
      .select('id,invoice_id,line_number,lot_number,raw_text,proposed_title,proposed_type,proposed_purpose,quantity,unit_price,line_total,confidence,include_on_import,review_note')
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
    setMessage('Invoice uploaded. It is stored safely; no Items have been created.')
    await loadInvoices(id)
  }

  async function copyExtractionRequest() {
    if (!selected) return
    const { data, error } = await supabase.storage.from('calibre-media').createSignedUrl(selected.storage_path, 3600)
    if (error || !data?.signedUrl) {
      setMessage(`Could not create document link: ${error?.message ?? 'No link returned.'}`)
      return
    }
    const request = `Read this acquisition invoice for Calibre & Co. The document may be a scanned/image PDF. Extract only what is actually visible; do not invent missing values.\n\nDocument: ${data.signedUrl}\nInvoice ID: ${selected.id}\n\nReturn ONLY valid JSON in this shape:\n{\n  "vendor_name": "",\n  "invoice_number": "",\n  "invoice_date": null,\n  "currency": "AUD",\n  "subtotal": null,\n  "fees": null,\n  "postage": null,\n  "total": null,\n  "lines": [\n    {\n      "line_number": 1,\n      "lot_number": "",\n      "raw_text": "exact visible line/lot description",\n      "title": "short inventory title",\n      "type": "watch|clock|jewellery|accessory|other",\n      "purpose": "resale",\n      "quantity": 1,\n      "unit_price": null,\n      "line_total": null,\n      "confidence": 0.0,\n      "review_note": "anything uncertain"\n    }\n  ]\n}\n\nIf a line is a mixed bundle/lot, keep it as ONE line rather than inventing individual objects. Fees/postage belong at invoice level unless explicitly line-specific.`
    await navigator.clipboard.writeText(request)
    setMessage('Extraction request copied. Paste it into ChatGPT, then paste the returned JSON back here.')
  }

  async function applyExtractedJson(event: FormEvent) {
    event.preventDefault()
    if (!selected || !jsonText.trim()) return
    let parsed: ParsedInvoice
    try {
      parsed = JSON.parse(jsonText.trim()) as ParsedInvoice
    } catch {
      setMessage('That is not valid JSON yet. Paste only the JSON returned from the extraction.')
      return
    }
    const parsedLines = Array.isArray(parsed.lines) ? parsed.lines : []
    const rows = parsedLines
      .filter((line) => line && (line.title || line.raw_text))
      .map((line, index) => ({
        workspace_id: workspaceId,
        invoice_id: selected.id,
        line_number: Number.isFinite(Number(line.line_number)) ? Number(line.line_number) : index + 1,
        lot_number: String(line.lot_number ?? ''),
        raw_text: String(line.raw_text ?? ''),
        proposed_title: String(line.title ?? line.raw_text ?? '').trim(),
        proposed_type: itemTypes.has(String(line.type ?? '')) ? String(line.type) : 'other',
        proposed_purpose: itemPurposes.has(String(line.purpose ?? '')) ? String(line.purpose) : 'resale',
        quantity: Math.max(1, Number(line.quantity) || 1),
        unit_price: line.unit_price == null ? null : Number(line.unit_price),
        line_total: line.line_total == null ? null : Number(line.line_total),
        confidence: line.confidence == null ? null : Math.max(0, Math.min(1, Number(line.confidence))),
        review_note: String(line.review_note ?? ''),
        include_on_import: true,
      }))

    const invoiceUpdate = await supabase.from('acquisition_invoices').update({
      vendor_name: String(parsed.vendor_name ?? '').trim(),
      invoice_number: String(parsed.invoice_number ?? '').trim(),
      invoice_date: parsed.invoice_date || null,
      currency: String(parsed.currency || 'AUD').trim() || 'AUD',
      subtotal: parsed.subtotal == null ? null : Number(parsed.subtotal),
      fees: parsed.fees == null ? null : Number(parsed.fees),
      postage: parsed.postage == null ? null : Number(parsed.postage),
      total: parsed.total == null ? null : Number(parsed.total),
      extraction_status: 'needs_review',
      extraction_payload: parsed,
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('id', selected.id)
    if (invoiceUpdate.error) {
      setMessage(`Invoice header could not be saved: ${invoiceUpdate.error.message}`)
      return
    }

    const clearResult = await supabase.from('acquisition_invoice_lines').delete().eq('workspace_id', workspaceId).eq('invoice_id', selected.id)
    if (clearResult.error) {
      setMessage(`Could not replace draft lines: ${clearResult.error.message}`)
      return
    }
    if (rows.length) {
      const insertResult = await supabase.from('acquisition_invoice_lines').insert(rows)
      if (insertResult.error) {
        setMessage(`Draft lines could not be saved: ${insertResult.error.message}`)
        return
      }
    }

    setJsonText('')
    setMessage(`${rows.length} draft line${rows.length === 1 ? '' : 's'} loaded for review. Nothing has been imported into Items yet.`)
    await loadInvoices(selected.id)
    await loadLines(selected.id)
  }

  if (!open) {
    return <button type="button" className="secondary" onClick={() => setOpen(true)}>Import invoice</button>
  }

  return (
    <section className="invoice-intake-card">
      <div className="invoice-intake-heading">
        <div><p className="eyebrow">BULK INTAKE</p><h2>Invoice intake</h2><p className="muted">Upload the original first. Extraction creates draft rows only; you review them before any stock is created.</p></div>
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
              <button type="button" onClick={copyExtractionRequest}>Copy for ChatGPT</button>
              <span>Works with text PDFs and scanned/image invoices because ChatGPT reviews the original document.</span>
            </div>

            <form className="invoice-json-form" onSubmit={applyExtractedJson}>
              <label>Paste extracted JSON
                <textarea rows={7} value={jsonText} onChange={(event) => setJsonText(event.target.value)} placeholder="Paste the JSON returned by ChatGPT here…" />
              </label>
              <button type="submit" disabled={!jsonText.trim()}>Load draft rows</button>
            </form>

            <div className="invoice-draft-lines">
              <div className="invoice-lines-heading"><strong>Draft lines</strong><span>{lines.length}</span></div>
              {lines.length === 0 && <p className="muted">No extracted lines yet.</p>}
              {lines.map((line) => (
                <article key={line.id}>
                  <div><span>{line.lot_number ? `Lot ${line.lot_number}` : `Line ${line.line_number ?? '—'}`}</span><strong>{line.proposed_title || line.raw_text}</strong><small>{line.proposed_type} · qty {Number(line.quantity)}</small></div>
                  <div><strong>{money(line.line_total, selected.currency)}</strong><small>{line.confidence == null ? 'Confidence unknown' : `${Math.round(Number(line.confidence) * 100)}% confidence`}</small></div>
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
