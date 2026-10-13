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
  extraction_payload?: Record<string, unknown> | null
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

type TesseractLike = {
  recognize: (image: Blob | HTMLCanvasElement, language: string, options?: { logger?: (event: { status?: string; progress?: number }) => void }) => Promise<{ data: { text: string } }>
}

type PdfJsLike = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (input: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (pageNumber: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }>; getViewport: (input: { scale: number }) => { width: number; height: number }; render: (input: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } }> }> }
}

declare global {
  interface Window {
    Tesseract?: TesseractLike
    pdfjsLib?: PdfJsLike
  }
}

const itemTypes = new Set(['watch', 'clock', 'jewellery', 'accessory', 'other'])
const itemPurposes = new Set(['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other'])
const PDF_JS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
const PDF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'
}

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function loadScript(src: string, id: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing?.dataset.loaded === 'true') {
      resolve()
      return
    }
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => { script.dataset.loaded = 'true'; resolve() }
    script.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.appendChild(script)
  })
}

function inferType(text: string) {
  const value = text.toLowerCase()
  if (/\b(watch|wristwatch|pocket watch|timepiece)\b/.test(value)) return 'watch'
  if (/\b(clock|alarm clock|mantel clock|carriage clock)\b/.test(value)) return 'clock'
  if (/\b(ring|bracelet|necklace|brooch|earring|earrings|pendant|chain|jewellery|jewelry|bangle|cufflink|cufflinks)\b/.test(value)) return 'jewellery'
  if (/\b(strap|watch band|watchband|case|box|wallet|purse|keyring|accessory)\b/.test(value)) return 'accessory'
  return 'other'
}

function draftLinesFromText(text: string): ParsedLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 4)

  const candidates: ParsedLine[] = []
  lines.forEach((line, index) => {
    const type = inferType(line)
    const hasInventoryWord = type !== 'other'
    const lotMatch = line.match(/^(?:lot\s*)?([A-Za-z]?\d{1,6})\s*[-:.)]?\s+(.+)/i)
    const priceMatch = line.match(/(?:AUD\s*|\$)\s*([0-9][0-9,]*(?:\.\d{2})?)\s*$/i)
    const endsWithAmount = line.match(/\b([0-9][0-9,]*\.\d{2})\s*$/)
    const hasLotWord = /^lot\b/i.test(line)

    if (!hasInventoryWord && !lotMatch && !hasLotWord) return

    const rawAmount = priceMatch?.[1] ?? endsWithAmount?.[1]
    const amount = rawAmount ? Number(rawAmount.replace(/,/g, '')) : null
    const titleSource = lotMatch?.[2] ?? line
    const cleanTitle = titleSource
      .replace(/(?:AUD\s*|\$)\s*[0-9][0-9,]*(?:\.\d{2})?\s*$/i, '')
      .replace(/\b[0-9][0-9,]*\.\d{2}\s*$/, '')
      .trim()

    candidates.push({
      line_number: index + 1,
      lot_number: lotMatch?.[1] ?? '',
      raw_text: line,
      title: cleanTitle || line,
      type,
      purpose: 'resale',
      quantity: 1,
      unit_price: amount,
      line_total: amount,
      confidence: hasInventoryWord && (lotMatch || amount != null) ? 0.72 : hasInventoryWord ? 0.55 : 0.4,
      review_note: 'Automatically proposed from OCR/text extraction — review before import.',
    })
  })

  return candidates.slice(0, 150)
}

export default function InvoiceIntake({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [rawText, setRawText] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null

  async function loadInvoices(selectId?: string) {
    if (!workspaceId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('acquisition_invoices')
      .select('id,vendor_name,invoice_number,invoice_date,currency,total,original_filename,mime_type,byte_size,storage_path,extraction_status,extraction_payload,created_at')
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
    const current = invoices.find((invoice) => invoice.id === selectedId)
    const payloadText = current?.extraction_payload && typeof current.extraction_payload.raw_text === 'string'
      ? current.extraction_payload.raw_text
      : ''
    setRawText(payloadText)
  }, [open, selectedId, invoices])

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

  async function ensureTesseract() {
    if (!window.Tesseract) await loadScript(TESSERACT_URL, 'calibre-tesseract')
    if (!window.Tesseract) throw new Error('OCR library did not initialize.')
    return window.Tesseract
  }

  async function ocr(input: Blob | HTMLCanvasElement) {
    const engine = await ensureTesseract()
    const result = await engine.recognize(input, 'eng', {
      logger: (event) => {
        if (event.status === 'recognizing text' && typeof event.progress === 'number') {
          setMessage(`Reading invoice… ${Math.round(event.progress * 100)}%`)
        }
      },
    })
    return result.data.text.trim()
  }

  async function extractPdf(blob: Blob) {
    if (!window.pdfjsLib) await loadScript(PDF_JS_URL, 'calibre-pdfjs')
    if (!window.pdfjsLib) throw new Error('PDF reader did not initialize.')
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise
    const textPages: string[] = []

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      setMessage(`Reading PDF page ${pageNo} of ${pdf.numPages}…`)
      const page = await pdf.getPage(pageNo)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item) => item.str ?? '').join(' ').replace(/\s+/g, ' ').trim()
      if (pageText.length >= 30) {
        textPages.push(pageText)
        continue
      }

      const viewport = page.getViewport({ scale: 1.8 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) continue
      await page.render({ canvasContext: context, viewport }).promise
      const pageOcr = await ocr(canvas)
      textPages.push(pageOcr)
    }

    return textPages.join('\n').trim()
  }

  async function readInvoice() {
    if (!selected || extracting) return
    setExtracting(true)
    setMessage('Opening stored invoice…')

    const download = await supabase.storage.from('calibre-media').download(selected.storage_path)
    if (download.error || !download.data) {
      setExtracting(false)
      setMessage(`Could not open invoice: ${download.error?.message ?? 'No file returned.'}`)
      return
    }

    try {
      const isPdf = selected.mime_type === 'application/pdf' || selected.original_filename.toLowerCase().endsWith('.pdf')
      const text = isPdf ? await extractPdf(download.data) : await ocr(download.data)
      if (!text.trim()) {
        setMessage('Calibre could not detect readable text in this invoice.')
        setExtracting(false)
        return
      }

      const proposed = draftLinesFromText(text)
      const payload = { raw_text: text, extraction_method: isPdf ? 'pdf_text_or_ocr' : 'image_ocr', extracted_at: new Date().toISOString() }
      const updateResult = await supabase.from('acquisition_invoices').update({
        extraction_status: proposed.length ? 'needs_review' : 'text_extracted',
        extraction_payload: payload,
        updated_at: new Date().toISOString(),
      }).eq('workspace_id', workspaceId).eq('id', selected.id)
      if (updateResult.error) throw updateResult.error

      const clearResult = await supabase.from('acquisition_invoice_lines').delete().eq('workspace_id', workspaceId).eq('invoice_id', selected.id)
      if (clearResult.error) throw clearResult.error

      if (proposed.length) {
        const rows = proposed.map((line, index) => ({
          workspace_id: workspaceId,
          invoice_id: selected.id,
          line_number: line.line_number ?? index + 1,
          lot_number: String(line.lot_number ?? ''),
          raw_text: String(line.raw_text ?? ''),
          proposed_title: String(line.title ?? line.raw_text ?? '').trim(),
          proposed_type: itemTypes.has(String(line.type ?? '')) ? String(line.type) : 'other',
          proposed_purpose: itemPurposes.has(String(line.purpose ?? '')) ? String(line.purpose) : 'resale',
          quantity: Math.max(1, Number(line.quantity) || 1),
          unit_price: line.unit_price == null ? null : Number(line.unit_price),
          line_total: line.line_total == null ? null : Number(line.line_total),
          confidence: line.confidence == null ? null : Number(line.confidence),
          review_note: String(line.review_note ?? ''),
          include_on_import: true,
        }))
        const insertResult = await supabase.from('acquisition_invoice_lines').insert(rows)
        if (insertResult.error) throw insertResult.error
      }

      setRawText(text)
      await loadInvoices(selected.id)
      await loadLines(selected.id)
      setMessage(proposed.length
        ? `Calibre read the invoice and proposed ${proposed.length} draft line${proposed.length === 1 ? '' : 's'}. Review them before import.`
        : 'Calibre extracted the invoice text, but could not safely identify stock lines yet. Review the extracted text below.')
    } catch (error) {
      setMessage(`Invoice reading failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setExtracting(false)
    }
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
      extraction_payload: { ...parsed, raw_text: rawText },
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
        <div><p className="eyebrow">BULK INTAKE</p><h2>Invoice intake</h2><p className="muted">Upload the original first. Calibre reads it into draft rows; you review them before any stock is created.</p></div>
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
              <button type="button" onClick={readInvoice} disabled={extracting}>{extracting ? 'Reading invoice…' : 'Read invoice'}</button>
              <span>Text PDFs are read directly. Scans and photos use OCR. Nothing becomes inventory until you approve it.</span>
            </div>

            {rawText && (
              <details className="invoice-raw-text">
                <summary>Extracted text</summary>
                <pre>{rawText}</pre>
              </details>
            )}

            <details className="invoice-json-fallback">
              <summary>Advanced: paste structured extraction</summary>
              <form className="invoice-json-form" onSubmit={applyExtractedJson}>
                <label>Paste extracted JSON
                  <textarea rows={7} value={jsonText} onChange={(event) => setJsonText(event.target.value)} placeholder="Optional structured JSON override…" />
                </label>
                <button type="submit" disabled={!jsonText.trim()}>Load draft rows</button>
              </form>
            </details>

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
