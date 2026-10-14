import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type InvoiceFile = {
  id: string
  original_filename: string
  mime_type: string
  storage_path: string
  vendor_name: string
  invoice_number: string
  extraction_status: string
  created_at: string
}

const pageSize = 50

function formatDate(value: string) {
  if (!value) return 'Unknown date'
  try {
    return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function fileKind(file: InvoiceFile) {
  if (file.mime_type === 'application/pdf' || file.original_filename.toLowerCase().endsWith('.pdf')) return 'PDF'
  if (file.mime_type.startsWith('image/')) return 'Image'
  return 'File'
}

function cleanSearch(value: string) {
  return value.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

export default function InvoiceFiles({ workspaceId }: { workspaceId: string }) {
  const [files, setFiles] = useState<InvoiceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => { setPage(0) }, [debouncedQuery, workspaceId])

  async function loadFiles() {
    if (!workspaceId) return
    setLoading(true)
    const clean = cleanSearch(debouncedQuery)
    let request = supabase
      .from('acquisition_invoices')
      .select('id,original_filename,mime_type,storage_path,vendor_name,invoice_number,extraction_status,created_at', { count: 'exact' })
      .eq('workspace_id', workspaceId)

    if (clean) {
      const pattern = `%${clean}%`
      request = request.or(`original_filename.ilike.${pattern},vendor_name.ilike.${pattern},invoice_number.ilike.${pattern},extraction_status.ilike.${pattern}`)
    }

    const from = page * pageSize
    const { data, error, count: nextCount } = await request
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)

    setLoading(false)
    if (error) {
      setMessage(`Files failed to load: ${error.message}`)
      return
    }

    const total = nextCount ?? 0
    if (page > 0 && from >= total) {
      setPage(Math.max(0, Math.ceil(total / pageSize) - 1))
      return
    }

    setFiles((data ?? []) as InvoiceFile[])
    setCount(total)
    setMessage('')
  }

  useEffect(() => { void loadFiles() }, [workspaceId, page, debouncedQuery])

  async function openFile(file: InvoiceFile) {
    setMessage('Opening file…')
    const { data, error } = await supabase.storage.from('calibre-media').createSignedUrl(file.storage_path, 600)
    if (error || !data?.signedUrl) {
      setMessage(`File could not be opened: ${error?.message ?? 'Signed link was not created.'}`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    setMessage('')
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const firstShown = count === 0 ? 0 : page * pageSize + 1
  const lastShown = Math.min(count, (page + 1) * pageSize)

  return (
    <section className="invoice-files-panel">
      <div className="invoice-files-heading">
        <div>
          <p className="eyebrow">DOCUMENT LIBRARY</p>
          <h2>Invoice files</h2>
          <p className="muted">Every invoice image or PDF uploaded through Calibre stays here in private storage, even after the invoice is imported.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void loadFiles()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <div className="inventory-list-toolbar invoice-files-toolbar">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename, vendor, invoice or status…" aria-label="Search invoice files" />
        <span>{count ? `${firstShown}–${lastShown} of ${count}` : '0 files'}</span>
      </div>

      {message && <p className="inventory-message">{message}</p>}
      {loading && files.length === 0 && <p className="inventory-empty">Loading files…</p>}
      {!loading && files.length === 0 && <div className="inventory-empty"><strong>{debouncedQuery ? 'No matching invoice files.' : 'No invoice files yet.'}</strong><span>{debouncedQuery ? 'Try a different search.' : 'Upload an invoice through Intake and it will appear here automatically.'}</span></div>}

      <div className="invoice-files-list">
        {files.map((file) => (
          <article className="invoice-file-row" key={file.id}>
            <div className="invoice-file-icon" aria-hidden="true">{fileKind(file) === 'PDF' ? 'PDF' : 'IMG'}</div>
            <div className="invoice-file-main">
              <strong>{file.original_filename}</strong>
              <small>{file.vendor_name || 'Vendor unresolved'}{file.invoice_number ? ` · Invoice ${file.invoice_number}` : ''}</small>
              <small>{formatDate(file.created_at)} · {file.extraction_status || 'uploaded'}</small>
            </div>
            <button type="button" className="secondary small" onClick={() => void openFile(file)}>Open</button>
          </article>
        ))}
      </div>

      {count > pageSize && <div className="inventory-list-toolbar" aria-label="Invoice file pagination">
        <button type="button" className="secondary small" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
        <span>Page {page + 1} of {totalPages}</span>
        <button type="button" className="secondary small" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
      </div>}
    </section>
  )
}
