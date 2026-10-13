import { useEffect, useMemo, useState } from 'react'
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

export default function InvoiceFiles({ workspaceId }: { workspaceId: string }) {
  const [files, setFiles] = useState<InvoiceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')

  async function loadFiles() {
    if (!workspaceId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('acquisition_invoices')
      .select('id,original_filename,mime_type,storage_path,vendor_name,invoice_number,extraction_status,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      setMessage(`Files failed to load: ${error.message}`)
      return
    }
    setFiles((data ?? []) as InvoiceFile[])
    setMessage('')
  }

  useEffect(() => {
    void loadFiles()
  }, [workspaceId])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return files
    return files.filter((file) => [file.original_filename, file.vendor_name, file.invoice_number, file.extraction_status]
      .some((value) => value?.toLowerCase().includes(text)))
  }, [files, query])

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
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice files…" aria-label="Search invoice files" />
        <span>{filtered.length} file{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {message && <p className="inventory-message">{message}</p>}
      {loading && files.length === 0 && <p className="inventory-empty">Loading files…</p>}
      {!loading && filtered.length === 0 && <div className="inventory-empty"><strong>No invoice files yet.</strong><span>Upload an invoice from the Items screen and it will appear here automatically.</span></div>}

      <div className="invoice-files-list">
        {filtered.map((file) => (
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
    </section>
  )
}
