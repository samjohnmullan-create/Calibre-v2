import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

type MediaCategory = 'dial' | 'movement' | 'caseback' | 'inside_caseback' | 'crown' | 'serial' | 'hallmark' | 'damage' | 'part' | 'measurement' | 'work_progress' | 'finished' | 'sales' | 'document' | 'invoice' | 'other'

type MediaAsset = {
  id: string
  category: MediaCategory
  role: string
  storage_path: string
  original_filename: string
  mime_type: string
  byte_size: number | null
  caption: string
  is_cover: boolean
  created_at: string
  signed_url?: string
}

const categories: { value: MediaCategory; label: string }[] = [
  { value: 'dial', label: 'Dial' },
  { value: 'movement', label: 'Movement' },
  { value: 'caseback', label: 'Caseback' },
  { value: 'inside_caseback', label: 'Inside caseback' },
  { value: 'crown', label: 'Crown' },
  { value: 'serial', label: 'Serial / reference' },
  { value: 'hallmark', label: 'Hallmark' },
  { value: 'damage', label: 'Fault / damage' },
  { value: 'part', label: 'Part' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'work_progress', label: 'Work progress' },
  { value: 'finished', label: 'Finished' },
  { value: 'sales', label: 'Listing / sales' },
  { value: 'document', label: 'Document' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'other', label: 'Other' },
]

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'photo'
}

function categoryLabel(value: MediaCategory) {
  return categories.find((entry) => entry.value === value)?.label ?? value
}

function isDocument(asset: MediaAsset) {
  return asset.category === 'invoice' || asset.category === 'document' || asset.mime_type === 'application/pdf'
}

export default function ItemMedia({ workspaceId, itemId }: { workspaceId: string; itemId: string }) {
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState<MediaCategory>('other')
  const [caption, setCaption] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const cover = useMemo(() => media.find((asset) => asset.is_cover && !isDocument(asset)) ?? media.find((asset) => !isDocument(asset)) ?? null, [media])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('media_assets')
        .select('id,category,role,storage_path,original_filename,mime_type,byte_size,caption,is_cover,created_at')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .order('is_cover', { ascending: false })
        .order('created_at', { ascending: true })

      if (!active) return
      if (error) {
        setLoading(false)
        setMessage(error.message)
        return
      }

      const rows = (data ?? []) as MediaAsset[]
      const signed = await Promise.all(rows.map(async (asset) => {
        const { data: signedData } = await supabase.storage.from('calibre-media').createSignedUrl(asset.storage_path, 3600)
        return { ...asset, signed_url: signedData?.signedUrl }
      }))
      if (!active) return
      setMedia(signed)
      setLoading(false)
    })()
    return () => { active = false }
  }, [workspaceId, itemId])

  async function refreshMedia() {
    const { data, error } = await supabase
      .from('media_assets')
      .select('id,category,role,storage_path,original_filename,mime_type,byte_size,caption,is_cover,created_at')
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
      .order('is_cover', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) {
      setMessage(error.message)
      return
    }
    const rows = (data ?? []) as MediaAsset[]
    const signed = await Promise.all(rows.map(async (asset) => {
      const { data: signedData } = await supabase.storage.from('calibre-media').createSignedUrl(asset.storage_path, 3600)
      return { ...asset, signed_url: signedData?.signedUrl }
    }))
    setMedia(signed)
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setMessage('Uploading…')
    let hasCover = media.some((asset) => asset.is_cover && !isDocument(asset))

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setMessage(`${file.name} is not an image.`)
        continue
      }
      const path = `${workspaceId}/${itemId}/${crypto.randomUUID()}-${safeName(file.name)}`
      const { error: storageError } = await supabase.storage.from('calibre-media').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      })
      if (storageError) {
        setMessage(`Upload failed: ${storageError.message}`)
        continue
      }

      const makeCover = !hasCover
      const { error: rowError } = await supabase.from('media_assets').insert({
        workspace_id: workspaceId,
        item_id: itemId,
        category,
        role: '',
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type,
        byte_size: file.size,
        caption: caption.trim(),
        is_cover: makeCover,
      })
      if (rowError) {
        await supabase.storage.from('calibre-media').remove([path])
        setMessage(`Photo record failed: ${rowError.message}`)
      } else if (makeCover) {
        hasCover = true
      }
    }

    if (inputRef.current) inputRef.current.value = ''
    setCaption('')
    await refreshMedia()
    setUploading(false)
    setMessage('Photo upload complete.')
  }

  async function setCover(asset: MediaAsset) {
    if (isDocument(asset)) return
    setMessage('Setting primary image…')
    const { error: clearError } = await supabase
      .from('media_assets')
      .update({ is_cover: false })
      .eq('workspace_id', workspaceId)
      .eq('item_id', itemId)
    if (clearError) {
      setMessage(clearError.message)
      return
    }
    const { error } = await supabase
      .from('media_assets')
      .update({ is_cover: true })
      .eq('workspace_id', workspaceId)
      .eq('id', asset.id)
    if (error) {
      setMessage(error.message)
      return
    }
    await refreshMedia()
    setMessage('Primary image updated.')
  }

  async function removeAsset(asset: MediaAsset) {
    const linkedInvoice = asset.role === 'source_invoice'
    setMessage(linkedInvoice ? 'Unlinking invoice…' : 'Removing photo…')
    const { error: rowError } = await supabase
      .from('media_assets')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', asset.id)
    if (rowError) {
      setMessage(rowError.message)
      return
    }

    if (!linkedInvoice) {
      await supabase.storage.from('calibre-media').remove([asset.storage_path])
    }

    if (asset.is_cover) {
      const { data: nextAsset } = await supabase
        .from('media_assets')
        .select('id,category,mime_type')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .not('category', 'in', '(invoice,document)')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (nextAsset?.id) {
        await supabase.from('media_assets').update({ is_cover: true }).eq('workspace_id', workspaceId).eq('id', nextAsset.id)
      }
    }

    await refreshMedia()
    setMessage(linkedInvoice ? 'Invoice link removed. The original document is still safe in Files.' : 'Photo removed.')
  }

  function openAsset(asset: MediaAsset) {
    if (asset.signed_url) window.open(asset.signed_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="section-card media-section">
      <div className="media-heading">
        <div><p className="eyebrow">PHOTOS & MEDIA</p><h3>Item gallery</h3></div>
        <span className="count-chip">{media.length}</span>
      </div>

      <div className="media-upload-panel">
        <label>Category
          <select value={category} onChange={(event) => setCategory(event.target.value as MediaCategory)}>
            {categories.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <label>Caption
          <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Optional note about this photo" />
        </label>
        <label className="media-picker">
          <span>{uploading ? 'Uploading…' : 'Add photos'}</span>
          <input ref={inputRef} type="file" accept="image/*" multiple disabled={uploading} onChange={uploadFiles} />
        </label>
      </div>

      {message && <p className="media-message">{message}</p>}
      {loading && <p className="muted">Loading media…</p>}
      {!loading && media.length === 0 && <div className="media-empty"><strong>No media yet.</strong><span>Add photos, or import an invoice to attach the original source document automatically.</span></div>}

      {!loading && media.length > 0 && (
        <div className="media-gallery">
          {media.map((asset) => {
            const document = isDocument(asset)
            return (
              <article className={`media-card ${asset.is_cover ? 'is-cover' : ''}`} key={asset.id}>
                <div className="media-image-wrap">
                  {document
                    ? <button type="button" className="media-document-link" onClick={() => openAsset(asset)} disabled={!asset.signed_url}><strong>{asset.category === 'invoice' ? 'INVOICE' : 'DOCUMENT'}</strong><span>{asset.original_filename}</span><small>Open original</small></button>
                    : asset.signed_url
                      ? <img src={asset.signed_url} alt={asset.caption || asset.original_filename} loading="lazy" />
                      : <div className="media-image-fallback">Preview unavailable</div>}
                  {asset.is_cover && !document && <span className="media-cover-badge">Primary</span>}
                </div>
                <div className="media-card-body">
                  <div><strong>{categoryLabel(asset.category)}</strong><span>{asset.caption || asset.original_filename}</span></div>
                  <div className="media-card-actions">
                    {!document && !asset.is_cover && <button type="button" className="secondary small" onClick={() => setCover(asset)}>Set primary</button>}
                    {document && <button type="button" className="secondary small" onClick={() => openAsset(asset)} disabled={!asset.signed_url}>Open</button>}
                    <button type="button" className="secondary small" onClick={() => removeAsset(asset)}>{asset.role === 'source_invoice' ? 'Unlink' : 'Remove'}</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {cover && <p className="media-primary-note">Primary image: {cover.caption || cover.original_filename}</p>}
    </section>
  )
}
