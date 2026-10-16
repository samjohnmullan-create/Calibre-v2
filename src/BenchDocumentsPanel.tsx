import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type TechnicalDocument = {
  id: string
  title: string
  document_type: string
  url: string
  notes: string
  origin_kind: string
  verification_status: string
  storage_bucket: string
  storage_path: string
  mime_type: string
  file_size_bytes: number | null
  created_at: string
  research_request_id: string | null
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'manual.pdf'
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function BenchDocumentsPanel({ workspaceId, itemId, workId, refreshKey = 0 }: { workspaceId: string; itemId: string; workId: string; refreshKey?: number }) {
  const [documents, setDocuments] = useState<TechnicalDocument[]>([])
  const [title, setTitle] = useState('')
  const [documentType, setDocumentType] = useState('manual')
  const [externalUrl, setExternalUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const driveLink = useMemo(() => /(^|\.)drive\.google\.com|docs\.google\.com/i.test(externalUrl), [externalUrl])

  async function load() {
    const result = await supabase.from('knowledge_technical_documents')
      .select('id,title,document_type,url,notes,origin_kind,verification_status,storage_bucket,storage_path,mime_type,file_size_bytes,created_at,research_request_id')
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (result.error) return setMessage(`Documents could not load: ${result.error.message}`)
    setDocuments((result.data ?? []) as TechnicalDocument[])
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, refreshKey])

  async function openDocument(document: TechnicalDocument) {
    setMessage('')
    if (document.storage_bucket && document.storage_path) {
      const signed = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 60 * 10)
      if (signed.error || !signed.data?.signedUrl) return setMessage(`Document could not open: ${signed.error?.message ?? 'No signed link returned.'}`)
      window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (document.url) window.open(document.url, '_blank', 'noopener,noreferrer')
  }

  async function attachExternal() {
    if (busy) return
    const cleanUrl = externalUrl.trim()
    if (!cleanUrl) return setMessage('Paste a Google Drive or web document link first.')
    if (!/^https?:\/\//i.test(cleanUrl)) return setMessage('Enter a full https:// document link.')
    setBusy(true)
    setMessage('Attaching document…')
    const result = await supabase.from('knowledge_technical_documents').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      work_id: workId,
      title: title.trim() || (driveLink ? 'Google Drive manual' : 'Bench document'),
      document_type: documentType.trim() || 'manual',
      url: cleanUrl,
      notes: driveLink ? 'Linked from Google Drive. File remains in Drive and is not duplicated in Calibre storage.' : 'External document linked from Bench.',
      origin_kind: 'research',
      verification_status: 'candidate',
      import_batch: 'bench-link',
    }).select('id').single()
    setBusy(false)
    if (result.error || !result.data) return setMessage(`Document was not attached: ${result.error?.message ?? 'No document returned.'}`)
    setMessage(`✓ Saved to database and attached to Bench${driveLink ? ' · Google Drive file remains in Drive' : ''}.`)
    setTitle('')
    setExternalUrl('')
    await load()
  }

  async function uploadPdf() {
    if (busy) return
    if (!file) return setMessage('Choose a PDF first.')
    if (file.type && file.type !== 'application/pdf') return setMessage('Bench document uploads currently accept PDF manuals only.')
    if (file.size > 25 * 1024 * 1024) return setMessage('This PDF is over the 25 MB Calibre storage limit. Use a Google Drive link instead.')
    setBusy(true)
    setMessage('Uploading manual…')
    const storagePath = `${workspaceId}/bench-documents/${itemId}/${workId}/${crypto.randomUUID()}-${safeName(file.name)}`
    const upload = await supabase.storage.from('calibre-media').upload(storagePath, file, { contentType: 'application/pdf', upsert: false })
    if (upload.error) {
      setBusy(false)
      return setMessage(`Manual upload failed: ${upload.error.message}`)
    }
    const result = await supabase.from('knowledge_technical_documents').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      work_id: workId,
      title: title.trim() || file.name.replace(/\.pdf$/i, ''),
      document_type: documentType.trim() || 'manual',
      url: '',
      notes: 'PDF uploaded manually from Bench.',
      origin_kind: 'research',
      verification_status: 'candidate',
      import_batch: 'bench-upload',
      storage_bucket: 'calibre-media',
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size_bytes: file.size,
    }).select('id').single()
    setBusy(false)
    if (result.error || !result.data) return setMessage(`PDF uploaded, but the document record could not be saved: ${result.error?.message ?? 'No document returned.'}`)
    setMessage('✓ PDF uploaded, saved to database and attached to Bench.')
    setTitle('')
    setFile(null)
    await load()
  }

  return <section className="bench-documents-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">DOCUMENTS</p><strong>Bench documents · {documents.length}</strong></div></div>
    <p className="bench-guided-help">Technical sheets and manuals attached to this Item stay available at the Bench. Link a Google Drive file to avoid duplicating storage, or upload a PDF to Calibre when you want a server copy.</p>

    {documents.length === 0 ? <p className="muted">No manuals or technical documents are attached yet.</p> : <div className="bench-documents-list">{documents.map((document) => {
      const isDrive = /(^|\.)drive\.google\.com|docs\.google\.com/i.test(document.url)
      const location = document.storage_path ? `Calibre storage${document.file_size_bytes ? ` · ${formatBytes(document.file_size_bytes)}` : ''}` : isDrive ? 'Google Drive' : 'External link'
      return <div key={document.id} className="bench-document-row"><div><strong>{document.title}</strong><small>{document.document_type || 'document'} · {location} · {document.verification_status}</small></div><div className="bench-guided-actions"><button type="button" className="secondary" onClick={() => void openDocument(document)}>Open</button></div></div>
    })}</div>}

    <details><summary>Attach manual or technical document</summary><div className="bench-document-add">
      <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Certina 25-651 parts sheet" disabled={busy} /></label>
      <label><span>Document type</span><input value={documentType} onChange={(event) => setDocumentType(event.target.value)} placeholder="manual / parts sheet / technical sheet" disabled={busy} /></label>
      <label><span>Google Drive or web link</span><input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://drive.google.com/..." disabled={busy} /></label>
      <div className="bench-guided-actions"><button type="button" onClick={() => void attachExternal()} disabled={busy || !externalUrl.trim()}>{busy ? 'Saving…' : driveLink ? 'Attach Google Drive link' : 'Attach external link'}</button></div>
      <label><span>Or upload PDF to Calibre</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={busy} /></label>
      <div className="bench-guided-actions"><button type="button" className="secondary" onClick={() => void uploadPdf()} disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload PDF to Calibre'}</button></div>
    </div></details>
    {message && <p className="bench-guided-message">{message}</p>}
  </section>
}
