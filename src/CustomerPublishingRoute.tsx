import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import CalibreBrandMark from './CalibreBrandMark'

type Item = { id: string; item_number: number; title: string; type: string; status: string }
type Identity = { maker: string; model: string; reference: string; era: string; country: string }
type Passport = {
  movement_maker: string; calibre: string; jewels: number | null; beat_rate: number | null; movement_type: string; escapement: string;
  case_material: string; crystal_type: string; width_mm: number | null; thickness_mm: number | null; provenance_summary: string;
}
type Publication = {
  id?: string; item_id: string; workspace_id: string; slug: string; published: boolean; catalogue_visible: boolean; sold_archive_visible: boolean;
  public_title: string; subtitle: string; summary: string; condition_summary: string; maker: string; model: string; reference: string; era: string; country: string;
  movement_maker: string; calibre: string; jewels: number | null; beat_rate: number | null; movement_type: string; escapement: string; case_material: string;
  crystal_type: string; width_mm: number | null; thickness_mm: number | null; provenance_summary: string; service_summary: string; final_timing_summary: string;
  authenticity_note: string; certificate_number: string | null; certificate_issued_at: string | null; hero_image_url: string; gallery_urls: string[];
  price_amount: number | null; currency: string; availability: 'catalogue' | 'available' | 'reserved' | 'sold' | 'archive'; published_at: string | null;
}
type MediaAsset = { id: string; storage_path: string; original_filename: string; caption: string; is_cover: boolean; signed_url?: string }

const emptyPublication = (workspaceId: string, itemId: string): Publication => ({
  item_id: itemId, workspace_id: workspaceId, slug: '', published: false, catalogue_visible: false, sold_archive_visible: false,
  public_title: '', subtitle: '', summary: '', condition_summary: '', maker: '', model: '', reference: '', era: '', country: '',
  movement_maker: '', calibre: '', jewels: null, beat_rate: null, movement_type: '', escapement: '', case_material: '', crystal_type: '',
  width_mm: null, thickness_mm: null, provenance_summary: '', service_summary: '', final_timing_summary: '', authenticity_note: '',
  certificate_number: null, certificate_issued_at: null, hero_image_url: '', gallery_urls: [], price_amount: null, currency: 'AUD',
  availability: 'catalogue', published_at: null,
})

function routeVisible() {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0] === 'customer'
}
function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'watch-photo.jpg'
}
function numeric(value: string) {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) ? parsed : null
}

export default function CustomerPublishingRoute() {
  const [visible, setVisible] = useState(routeVisible)
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [itemId, setItemId] = useState('')
  const [draft, setDraft] = useState<Publication | null>(null)
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => setVisible(routeVisible())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!visible) return
    let active = true
    ;(async () => {
      const workspace = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active || workspace.error || !workspace.data) {
        if (workspace.error) setMessage(workspace.error.message)
        return
      }
      setWorkspaceId(workspace.data.id)
      const result = await supabase.from('items').select('id,item_number,title,type,status').eq('workspace_id', workspace.data.id).is('archived_at', null).order('item_number', { ascending: false })
      if (!active) return
      if (result.error) setMessage(result.error.message)
      else {
        const next = (result.data ?? []) as Item[]
        setItems(next)
        if (!itemId && next[0]) setItemId(next[0].id)
      }
    })()
    return () => { active = false }
  }, [visible])

  useEffect(() => {
    if (!visible || !workspaceId || !itemId) return
    let active = true
    ;(async () => {
      setLoading(true)
      setMessage('')
      const [itemResult, identityResult, passportResult, publicationResult, mediaResult, timingResult, valuationResult] = await Promise.all([
        supabase.from('items').select('id,item_number,title,type,status').eq('workspace_id', workspaceId).eq('id', itemId).maybeSingle(),
        supabase.from('item_identity').select('maker,model,reference,era,country').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
        supabase.from('passports').select('movement_maker,calibre,jewels,beat_rate,movement_type,escapement,case_material,crystal_type,width_mm,thickness_mm,provenance_summary').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
        supabase.from('customer_publications').select('*').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
        supabase.from('media_assets').select('id,storage_path,original_filename,caption,is_cover,mime_type').eq('workspace_id', workspaceId).eq('item_id', itemId).like('mime_type', 'image/%').order('is_cover', { ascending: false }).order('created_at', { ascending: true }),
        supabase.from('timing_runs').select('rate_seconds_per_day,beat_error_ms,position,checkpoint,recorded_at').eq('workspace_id', workspaceId).eq('item_id', itemId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('valuations').select('target_value,currency').eq('workspace_id', workspaceId).eq('item_id', itemId).order('valued_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (!active) return
      setLoading(false)
      const error = itemResult.error ?? identityResult.error ?? passportResult.error ?? publicationResult.error ?? mediaResult.error ?? timingResult.error ?? valuationResult.error
      if (error) { setMessage(error.message); return }
      const item = itemResult.data as Item | null
      const identity = identityResult.data as Identity | null
      const passport = passportResult.data as Passport | null
      const existing = publicationResult.data as Publication | null
      const timing = timingResult.data as { rate_seconds_per_day: number | null; beat_error_ms: number | null; position: string; checkpoint: string } | null
      const valuation = valuationResult.data as { target_value: number | null; currency: string } | null
      if (existing) setDraft(existing)
      else {
        const next = emptyPublication(workspaceId, itemId)
        next.public_title = item?.title || [identity?.maker, identity?.model].filter(Boolean).join(' ') || 'Vintage watch'
        next.slug = `${slugify(next.public_title)}-${item?.item_number ?? ''}`.replace(/-+$/, '')
        next.maker = identity?.maker || ''
        next.model = identity?.model || ''
        next.reference = identity?.reference || ''
        next.era = identity?.era || ''
        next.country = identity?.country || ''
        next.movement_maker = passport?.movement_maker || ''
        next.calibre = passport?.calibre || ''
        next.jewels = passport?.jewels ?? null
        next.beat_rate = passport?.beat_rate ?? null
        next.movement_type = passport?.movement_type || ''
        next.escapement = passport?.escapement || ''
        next.case_material = passport?.case_material || ''
        next.crystal_type = passport?.crystal_type || ''
        next.width_mm = passport?.width_mm ?? null
        next.thickness_mm = passport?.thickness_mm ?? null
        next.provenance_summary = passport?.provenance_summary || ''
        next.price_amount = valuation?.target_value ?? null
        next.currency = valuation?.currency || 'AUD'
        next.certificate_number = `CAL-${new Date().getFullYear()}-${String(item?.item_number ?? 0).padStart(4, '0')}`
        if (timing) next.final_timing_summary = [
          timing.rate_seconds_per_day != null ? `${Number(timing.rate_seconds_per_day) >= 0 ? '+' : ''}${Number(timing.rate_seconds_per_day).toFixed(0)} sec/day` : '',
          timing.beat_error_ms != null ? `${Number(timing.beat_error_ms).toFixed(1)} ms beat error` : '',
          timing.position || '',
        ].filter(Boolean).join(' · ')
        setDraft(next)
      }
      const signed = await Promise.all(((mediaResult.data ?? []) as MediaAsset[]).map(async (asset) => {
        const signedResult = await supabase.storage.from('calibre-media').createSignedUrl(asset.storage_path, 3600)
        return { ...asset, signed_url: signedResult.data?.signedUrl }
      }))
      if (active) setMedia(signed)
    })()
    return () => { active = false }
  }, [visible, workspaceId, itemId])

  const selectedItem = useMemo(() => items.find((item) => item.id === itemId) ?? null, [items, itemId])

  function patch<K extends keyof Publication>(key: K, value: Publication[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }

  async function save(publish?: boolean) {
    if (!draft) return
    setSaving(true)
    setMessage(publish === true ? 'Publishing…' : publish === false ? 'Unpublishing…' : 'Saving draft…')
    const now = new Date().toISOString()
    const payload: Publication = {
      ...draft,
      workspace_id: workspaceId,
      item_id: itemId,
      published: publish === undefined ? draft.published : publish,
      published_at: publish === true ? (draft.published_at || now) : publish === false ? null : draft.published_at,
      certificate_issued_at: publish === true ? (draft.certificate_issued_at || now) : draft.certificate_issued_at,
      catalogue_visible: publish === true ? (draft.catalogue_visible || draft.availability !== 'archive') : draft.catalogue_visible,
    }
    delete payload.id
    const result = await supabase.from('customer_publications').upsert(payload, { onConflict: 'workspace_id,item_id' }).select('*').single()
    setSaving(false)
    if (result.error || !result.data) { setMessage(result.error?.message ?? 'Save failed.'); return }
    setDraft(result.data as Publication)
    setMessage(publish === true ? 'Published to calibreco.com.au.' : publish === false ? 'Removed from the public site.' : 'Customer draft saved.')
  }

  async function publishInternalPhoto(asset: MediaAsset, makeHero = false) {
    if (!draft || !asset.signed_url) return
    setMessage('Publishing photo…')
    try {
      const response = await fetch(asset.signed_url)
      if (!response.ok) throw new Error('Could not read the workshop photo.')
      const blob = await response.blob()
      const path = `${workspaceId}/${itemId}/${crypto.randomUUID()}-${safeName(asset.original_filename)}`
      const upload = await supabase.storage.from('calibre-public').upload(path, blob, { cacheControl: '31536000', contentType: blob.type || 'image/jpeg', upsert: false })
      if (upload.error) throw upload.error
      const publicUrl = supabase.storage.from('calibre-public').getPublicUrl(path).data.publicUrl
      if (makeHero || !draft.hero_image_url) patch('hero_image_url', publicUrl)
      else if (!draft.gallery_urls.includes(publicUrl)) patch('gallery_urls', [...draft.gallery_urls, publicUrl])
      setMessage('Photo copied to the public Calibre media library. Save or publish to keep it on the Passport.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Photo publishing failed.')
    }
  }

  async function uploadPublicPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !draft) return
    setMessage('Uploading public photo…')
    const path = `${workspaceId}/${itemId}/${crypto.randomUUID()}-${safeName(file.name)}`
    const upload = await supabase.storage.from('calibre-public').upload(path, file, { cacheControl: '31536000', contentType: file.type, upsert: false })
    event.target.value = ''
    if (upload.error) { setMessage(upload.error.message); return }
    const publicUrl = supabase.storage.from('calibre-public').getPublicUrl(path).data.publicUrl
    if (!draft.hero_image_url) patch('hero_image_url', publicUrl)
    else patch('gallery_urls', [...draft.gallery_urls, publicUrl])
    setMessage('Public photo uploaded. Save or publish to attach it to the Passport.')
  }

  if (!visible) return null
  if (!workspaceId) return <main className="customer-publish-page"><div className="loading-card">Opening Customer Publishing…</div></main>

  return (
    <main className="customer-publish-page">
      <header className="customer-publish-header">
        <div><p className="eyebrow">CUSTOMER SIDE</p><h1>Publishing Studio</h1><p>Prepare exactly what customers see at calibreco.com.au. Internal costs, suppliers, diagnosis notes and workshop records stay private.</p></div>
        <a href="https://calibreco.com.au" target="_blank" rel="noreferrer" className="customer-site-link">Open customer site ↗</a>
      </header>

      <section className="section-card customer-publish-picker">
        <label>Watch<select value={itemId} onChange={(event) => setItemId(event.target.value)}>{items.map((item) => <option key={item.id} value={item.id}>#{item.item_number} · {item.title}</option>)}</select></label>
        {draft && <div className={`customer-publish-state ${draft.published ? 'live' : ''}`}><span>{draft.published ? 'LIVE' : 'DRAFT'}</span><strong>{selectedItem?.status?.replaceAll('_', ' ')}</strong></div>}
      </section>

      {loading && <div className="loading-card">Loading customer record…</div>}
      {draft && !loading && <>
        <div className="customer-publish-grid">
          <section className="section-card customer-publish-form">
            <div className="customer-publish-section-title"><div><p className="eyebrow">PUBLIC IDENTITY</p><h2>Catalogue presentation</h2></div><button type="button" className="secondary small" onClick={() => patch('slug', `${slugify(draft.public_title)}-${selectedItem?.item_number ?? ''}`)}>Regenerate slug</button></div>
            <label>Public title<input value={draft.public_title} onChange={(e) => patch('public_title', e.target.value)} /></label>
            <label>Subtitle<input value={draft.subtitle} onChange={(e) => patch('subtitle', e.target.value)} placeholder="One-line character or selling point" /></label>
            <label>Public URL slug<input value={draft.slug} onChange={(e) => patch('slug', slugify(e.target.value))} /></label>
            <label>Summary<textarea rows={6} value={draft.summary} onChange={(e) => patch('summary', e.target.value)} placeholder="Customer-friendly history and description" /></label>
            <label>Condition summary<textarea rows={4} value={draft.condition_summary} onChange={(e) => patch('condition_summary', e.target.value)} /></label>
            <label>Service summary<textarea rows={4} value={draft.service_summary} onChange={(e) => patch('service_summary', e.target.value)} placeholder="Only work you are comfortable stating publicly" /></label>
            <label>Authenticity / evidence note<textarea rows={4} value={draft.authenticity_note} onChange={(e) => patch('authenticity_note', e.target.value)} placeholder="Confirmed, probable or unresolved facts" /></label>
          </section>

          <section className="section-card customer-publish-form">
            <p className="eyebrow">PUBLIC FACTS</p><h2>Passport data</h2>
            <div className="customer-publish-two"><label>Maker<input value={draft.maker} onChange={(e) => patch('maker', e.target.value)} /></label><label>Model<input value={draft.model} onChange={(e) => patch('model', e.target.value)} /></label><label>Reference<input value={draft.reference} onChange={(e) => patch('reference', e.target.value)} /></label><label>Era<input value={draft.era} onChange={(e) => patch('era', e.target.value)} /></label><label>Movement maker<input value={draft.movement_maker} onChange={(e) => patch('movement_maker', e.target.value)} /></label><label>Calibre<input value={draft.calibre} onChange={(e) => patch('calibre', e.target.value)} /></label><label>Jewels<input inputMode="numeric" value={draft.jewels ?? ''} onChange={(e) => patch('jewels', numeric(e.target.value))} /></label><label>Beat rate<input inputMode="numeric" value={draft.beat_rate ?? ''} onChange={(e) => patch('beat_rate', numeric(e.target.value))} /></label><label>Case material<input value={draft.case_material} onChange={(e) => patch('case_material', e.target.value)} /></label><label>Crystal<input value={draft.crystal_type} onChange={(e) => patch('crystal_type', e.target.value)} /></label></div>
            <label>Provenance summary<textarea rows={4} value={draft.provenance_summary} onChange={(e) => patch('provenance_summary', e.target.value)} /></label>
            <label>Final timing summary<input value={draft.final_timing_summary} onChange={(e) => patch('final_timing_summary', e.target.value)} /></label>
          </section>

          <section className="section-card customer-publish-form">
            <p className="eyebrow">CATALOGUE</p><h2>Sale & visibility</h2>
            <div className="customer-publish-two"><label>Availability<select value={draft.availability} onChange={(e) => patch('availability', e.target.value as Publication['availability'])}><option value="catalogue">Catalogue only</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option><option value="archive">Archive</option></select></label><label>Price (AUD)<input inputMode="decimal" value={draft.price_amount ?? ''} onChange={(e) => patch('price_amount', numeric(e.target.value))} /></label></div>
            <label className="customer-publish-check"><input type="checkbox" checked={draft.catalogue_visible} onChange={(e) => patch('catalogue_visible', e.target.checked)} /> Show in catalogue</label>
            <label className="customer-publish-check"><input type="checkbox" checked={draft.sold_archive_visible} onChange={(e) => patch('sold_archive_visible', e.target.checked)} /> Keep in permanent archive</label>
            <label>Certificate number<input value={draft.certificate_number ?? ''} onChange={(e) => patch('certificate_number', e.target.value || null)} /></label>
            <div className="customer-publish-preview-links"><a href={`#/passport/${encodeURIComponent(draft.slug)}`} target="_blank" rel="noreferrer">Preview Passport ↗</a><a href={`#/certificate/${encodeURIComponent(draft.slug)}`} target="_blank" rel="noreferrer">Preview Certificate ↗</a></div>
          </section>

          <section className="section-card customer-publish-form customer-publish-media">
            <div className="customer-publish-section-title"><div><p className="eyebrow">PUBLIC PHOTOGRAPHY</p><h2>Passport images</h2></div><label className="secondary small customer-upload-button">Upload public photo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadPublicPhoto} /></label></div>
            {draft.hero_image_url && <div className="customer-current-hero"><img src={draft.hero_image_url} alt="Current public cover" /><div><strong>Current cover</strong><button type="button" className="text-button" onClick={() => patch('hero_image_url', '')}>Remove</button></div></div>}
            <p className="customer-publish-help">Workshop photos stay private until you explicitly copy one into the public media library.</p>
            <div className="customer-media-strip">{media.map((asset) => <article key={asset.id}>{asset.signed_url ? <img src={asset.signed_url} alt={asset.caption || asset.original_filename} /> : <div className="customer-media-placeholder"><CalibreBrandMark /></div>}<div><strong>{asset.caption || asset.original_filename}</strong><span>{asset.is_cover ? 'Workshop cover' : 'Workshop photo'}</span><div><button type="button" onClick={() => void publishInternalPhoto(asset, true)}>Use as cover</button><button type="button" className="secondary small" onClick={() => void publishInternalPhoto(asset, false)}>Add to gallery</button></div></div></article>)}</div>
          </section>
        </div>

        <div className="customer-publish-savebar"><p>{message}</p><div><button type="button" className="secondary" onClick={() => void save()} disabled={saving}>Save draft</button>{draft.published && <button type="button" className="secondary" onClick={() => void save(false)} disabled={saving}>Unpublish</button>}<button type="button" onClick={() => void save(true)} disabled={saving}>{saving ? 'Saving…' : draft.published ? 'Update live record' : 'Publish to calibreco.com.au'}</button></div></div>
      </>}
      {!loading && !draft && <div className="section-card"><h2>No customer record</h2><p>{message || 'Choose an Item to prepare its public record.'}</p></div>}
    </main>
  )
}
