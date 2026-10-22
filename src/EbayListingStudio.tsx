import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import CalibreBrandMark from './CalibreBrandMark'
import './ebay-listing.css'

type Item = { id: string; item_number: number; title: string; type: string; status: string }
type ItemSpecific = { name: string; value: string }
type EbayDraft = {
  title: string
  asking_price: number | null
  currency: string
  category_id: string
  condition_id: string
  payment_profile_id: string
  return_profile_id: string
  shipping_profile_id: string
  quantity: number
  listing_type: string
  duration: string
  sku: string
  description_html: string
  images: string[]
  item_specifics: ItemSpecific[]
}
type MarketplaceListing = {
  id: string
  status: string
  external_listing_id: string | null
  listing_url: string
  verified_at: string | null
  published_at: string | null
  verification?: EbayResult | null
}
type Connection = {
  environment: 'sandbox' | 'production'
  marketplace_id: string
  site_id: string
  credentials_configured: boolean
  listing_location_configured: boolean
  configured: boolean
  missing: string[]
}
type Policy = { id: string; name: string }
type Policies = { fulfillment: Policy[]; payment: Policy[]; return: Policy[] }
type EbayError = { code: string; severity: string; short_message: string; long_message: string }
type EbayFee = { name: string; amount: number }
type EbayResult = {
  ack: string
  item_id: string | null
  start_time: string | null
  end_time: string | null
  errors: EbayError[]
  fees: EbayFee[]
}

type PrepareResponse = {
  ok: boolean
  connection: Connection
  item: Item
  draft: EbayDraft
  existing: MarketplaceListing | null
  missing: string[]
}

function visibleRoute() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return parts[0] === 'customer' && parts[1] === 'ebay'
}

function money(value: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(Number(value))
}

function specificsToText(values: ItemSpecific[]) {
  return values.map((entry) => `${entry.name}=${entry.value}`).join('\n')
}

function textToSpecifics(value: string) {
  return value.split('\n').map((line) => {
    const index = line.indexOf('=')
    if (index < 1) return null
    const name = line.slice(0, index).trim()
    const specificValue = line.slice(index + 1).trim()
    return name && specificValue ? { name, value: specificValue } : null
  }).filter((entry): entry is ItemSpecific => Boolean(entry))
}

function firstUsefulMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Request failed')
  return 'Request failed'
}

export default function EbayListingStudio() {
  const [visible, setVisible] = useState(visibleRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [itemId, setItemId] = useState('')
  const [draft, setDraft] = useState<EbayDraft | null>(null)
  const [existing, setExisting] = useState<MarketplaceListing | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [policies, setPolicies] = useState<Policies | null>(null)
  const [specificsText, setSpecificsText] = useState('')
  const [result, setResult] = useState<EbayResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => setVisible(visibleRoute())
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
      const itemResult = await supabase.from('items').select('id,item_number,title,type,status').eq('workspace_id', workspace.data.id).is('archived_at', null).order('item_number', { ascending: false })
      if (!active) return
      if (itemResult.error) {
        setMessage(itemResult.error.message)
        return
      }
      const next = (itemResult.data ?? []) as Item[]
      setItems(next)
      setItemId((current) => current || next[0]?.id || '')
    })()
    return () => { active = false }
  }, [visible])

  async function invoke(body: Record<string, unknown>) {
    const response = await supabase.functions.invoke('calibre-ebay', { body })
    if (response.error) throw response.error
    if (response.data?.error) throw new Error(String(response.data.error))
    return response.data
  }

  async function prepare() {
    if (!itemId) return
    setLoading(true)
    setMessage('Preparing an eBay draft from verified Calibre data…')
    setResult(null)
    try {
      const data = await invoke({ action: 'prepare', item_id: itemId }) as PrepareResponse
      setDraft(data.draft)
      setExisting(data.existing)
      setConnection(data.connection)
      setSpecificsText(specificsToText(data.draft.item_specifics || []))
      const notes = data.missing?.length ? ` Still needed: ${data.missing.join(', ')}.` : ''
      setMessage(`Draft prepared. Nothing has been sent to eBay.${notes}`)
    } catch (error) {
      setMessage(`Could not prepare listing: ${firstUsefulMessage(error)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible && workspaceId && itemId) void prepare()
  }, [visible, workspaceId, itemId])

  async function loadPolicies() {
    if (!connection?.credentials_configured) return
    setChecking(true)
    setMessage('Reading your eBay business policies…')
    try {
      const data = await invoke({ action: 'policies' }) as { policies: Policies; connection: Connection }
      setPolicies(data.policies)
      setConnection(data.connection)
      setDraft((current) => {
        if (!current) return current
        return {
          ...current,
          payment_profile_id: current.payment_profile_id || data.policies.payment[0]?.id || '',
          return_profile_id: current.return_profile_id || data.policies.return[0]?.id || '',
          shipping_profile_id: current.shipping_profile_id || data.policies.fulfillment[0]?.id || '',
        }
      })
      setMessage('eBay policies loaded. Review the selected policies before verifying.')
    } catch (error) {
      setMessage(`Could not load eBay policies: ${firstUsefulMessage(error)}`)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (connection?.credentials_configured && !policies) void loadPolicies()
  }, [connection?.credentials_configured])

  function patch<K extends keyof EbayDraft>(key: K, value: EbayDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
    setResult(null)
  }

  const readiness = useMemo(() => {
    if (!draft) return [] as string[]
    const missing: string[] = []
    if (!draft.title.trim()) missing.push('title')
    if (!(Number(draft.asking_price) > 0)) missing.push('asking price')
    if (!draft.category_id.trim()) missing.push('category ID')
    if (!draft.condition_id.trim()) missing.push('condition ID')
    if (!draft.images.length) missing.push('public photo')
    if (!draft.payment_profile_id.trim()) missing.push('payment policy')
    if (!draft.return_profile_id.trim()) missing.push('return policy')
    if (!draft.shipping_profile_id.trim()) missing.push('shipping policy')
    return missing
  }, [draft])

  function requestListing() {
    if (!draft) return null
    return {
      title: draft.title,
      asking_price: draft.asking_price,
      category_id: draft.category_id,
      condition_id: draft.condition_id,
      payment_profile_id: draft.payment_profile_id,
      return_profile_id: draft.return_profile_id,
      shipping_profile_id: draft.shipping_profile_id,
      item_specifics: textToSpecifics(specificsText),
    }
  }

  async function verifyListing() {
    const listing = requestListing()
    if (!listing || !itemId || readiness.length) {
      setMessage(`Complete before verification: ${readiness.join(', ')}.`)
      return
    }
    setChecking(true)
    setMessage('Asking eBay to validate the listing. This does not publish or charge a listing fee…')
    try {
      const data = await invoke({ action: 'verify', item_id: itemId, listing }) as { ok: boolean; result: EbayResult; marketplace: MarketplaceListing }
      setResult(data.result)
      setExisting(data.marketplace)
      const warnings = data.result.errors?.filter((entry) => entry.severity.toLowerCase() !== 'error') ?? []
      setMessage(warnings.length ? `eBay accepted the listing with ${warnings.length} warning(s). Review them below before publishing.` : 'eBay validation passed. The listing is ready for your approval.')
    } catch (error) {
      setMessage(`eBay verification failed: ${firstUsefulMessage(error)}`)
      await prepare()
    } finally {
      setChecking(false)
    }
  }

  async function publishListing() {
    const listing = requestListing()
    if (!listing || !itemId || readiness.length) {
      setMessage(`Complete before publishing: ${readiness.join(', ')}.`)
      return
    }
    if (!result || !['success', 'warning'].includes(result.ack.toLowerCase())) {
      setMessage('Verify this exact draft with eBay first.')
      return
    }
    const approved = window.confirm(`Publish “${draft?.title}” to eBay Australia for ${money(draft?.asking_price ?? null)}? This creates a real live listing and may incur eBay fees.`)
    if (!approved) return

    setPublishing(true)
    setMessage('Publishing the approved listing to eBay…')
    try {
      const data = await invoke({ action: 'publish', item_id: itemId, listing }) as { ok: boolean; result: EbayResult; marketplace: MarketplaceListing }
      setResult(data.result)
      setExisting(data.marketplace)
      setMessage(`Live on eBay. Listing ${data.result.item_id || ''} is now linked back to this Calibre Item.`)
    } catch (error) {
      setMessage(`eBay publish failed: ${firstUsefulMessage(error)}`)
    } finally {
      setPublishing(false)
    }
  }

  const selectedItem = items.find((item) => item.id === itemId) ?? null
  const errorRows = result?.errors ?? []

  if (!visible) return null

  return (
    <main className="ebay-page">
      <header className="customer-publish-header ebay-header">
        <div>
          <p className="eyebrow">MARKETPLACE</p>
          <h1>eBay Listing Studio</h1>
          <p>Build from Calibre evidence, validate with eBay, then publish only after an explicit approval.</p>
        </div>
        <div className={`ebay-connection ${connection?.configured ? 'connected' : ''}`}>
          <span>{connection?.configured ? 'CONNECTED' : 'SETUP REQUIRED'}</span>
          <strong>{connection?.environment === 'sandbox' ? 'eBay Sandbox' : 'eBay Australia'}</strong>
        </div>
      </header>

      <section className="section-card ebay-item-picker">
        <label>Item
          <select value={itemId} onChange={(event) => setItemId(event.target.value)}>
            {items.map((item) => <option value={item.id} key={item.id}>#{item.item_number} · {item.title}</option>)}
          </select>
        </label>
        {selectedItem && <div className="ebay-item-state"><span>{selectedItem.type}</span><strong>{selectedItem.status.replaceAll('_', ' ')}</strong></div>}
      </section>

      {!connection?.configured && connection && <section className="section-card ebay-setup-card">
        <div><p className="eyebrow">CONNECTION</p><h2>The listing builder is ready; eBay credentials are not connected yet.</h2></div>
        <p>Calibre can prepare the full draft now. Verify and Publish stay disabled until the server has an eBay Client ID, Client Secret, refresh token and listing location.</p>
        <small>Missing server configuration: {connection.missing.join(', ') || 'unknown'}.</small>
      </section>}

      {loading && <div className="loading-card">Preparing eBay draft…</div>}

      {draft && !loading && <>
        <div className="ebay-summary-grid">
          <section className="section-card ebay-preview-card">
            <p className="eyebrow">EBAY PREVIEW</p>
            <div className="ebay-preview">
              <div className="ebay-preview-image">{draft.images[0] ? <img src={draft.images[0]} alt={draft.title} /> : <CalibreBrandMark />}</div>
              <div>
                <span className="ebay-preview-condition">Fixed price · {draft.duration}</span>
                <h2>{draft.title || 'Untitled listing'}</h2>
                <strong className="ebay-preview-price">{money(draft.asking_price)}</strong>
                <p>{draft.images.length} public photo{draft.images.length === 1 ? '' : 's'} · SKU {draft.sku}</p>
              </div>
            </div>
          </section>

          <section className={`section-card ebay-readiness ${readiness.length ? '' : 'ready'}`}>
            <p className="eyebrow">LISTING CHECK</p>
            <h2>{readiness.length ? 'Still needs setup' : result ? 'Verified draft' : 'Ready to verify'}</h2>
            {readiness.length ? <p>Complete: {readiness.join(', ')}.</p> : <p>The draft has the minimum Calibre-side data required to send to eBay for validation.</p>}
            {existing?.status && <div className={`ebay-marketplace-status ${existing.status}`}><span>{existing.status.toUpperCase()}</span>{existing.external_listing_id && <strong>#{existing.external_listing_id}</strong>}</div>}
            {existing?.listing_url && <a href={existing.listing_url} target="_blank" rel="noreferrer">Open eBay listing ↗</a>}
          </section>
        </div>

        <div className="ebay-grid">
          <section className="section-card ebay-form-card">
            <p className="eyebrow">LISTING</p><h2>Core details</h2>
            <label>eBay title <small>{draft.title.length}/80</small><input maxLength={80} value={draft.title} onChange={(event) => patch('title', event.target.value)} /></label>
            <div className="ebay-two">
              <label>Price (AUD)<input inputMode="decimal" value={draft.asking_price ?? ''} onChange={(event) => patch('asking_price', event.target.value ? Number(event.target.value) : null)} /></label>
              <label>Category ID<input inputMode="numeric" value={draft.category_id} onChange={(event) => patch('category_id', event.target.value.trim())} placeholder="eBay leaf category" /></label>
              <label>Condition ID<input inputMode="numeric" value={draft.condition_id} onChange={(event) => patch('condition_id', event.target.value.trim())} placeholder="Category-specific condition" /></label>
            </div>
            <p className="ebay-help">Category and condition IDs are intentionally not guessed. eBay validates them against the selected Australian category.</p>
          </section>

          <section className="section-card ebay-form-card">
            <div className="ebay-card-title"><div><p className="eyebrow">EBAY POLICIES</p><h2>Payment, returns & shipping</h2></div><button type="button" className="secondary small" onClick={() => void loadPolicies()} disabled={!connection?.credentials_configured || checking}>{checking ? 'Checking…' : 'Refresh policies'}</button></div>
            <label>Payment policy
              <select value={draft.payment_profile_id} onChange={(event) => patch('payment_profile_id', event.target.value)}>
                <option value="">Choose policy</option>
                {(policies?.payment ?? []).map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
              </select>
            </label>
            <label>Return policy
              <select value={draft.return_profile_id} onChange={(event) => patch('return_profile_id', event.target.value)}>
                <option value="">Choose policy</option>
                {(policies?.return ?? []).map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
              </select>
            </label>
            <label>Shipping policy
              <select value={draft.shipping_profile_id} onChange={(event) => patch('shipping_profile_id', event.target.value)}>
                <option value="">Choose policy</option>
                {(policies?.fulfillment ?? []).map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
              </select>
            </label>
            <p className="ebay-help">Calibre reads the policy names from your eBay account; the detailed rules remain managed by eBay.</p>
          </section>

          <section className="section-card ebay-form-card">
            <p className="eyebrow">ITEM SPECIFICS</p><h2>Structured eBay facts</h2>
            <textarea rows={9} value={specificsText} onChange={(event) => { setSpecificsText(event.target.value); setResult(null) }} placeholder={'Brand=Omega\nType=Wristwatch\nMovement=Mechanical (Manual)'} />
            <p className="ebay-help">One <strong>Name=Value</strong> per line. These start from the verified Calibre Passport. Add any category-required specifics that eBay asks for during Verify.</p>
          </section>

          <section className="section-card ebay-form-card ebay-description-card">
            <p className="eyebrow">DESCRIPTION</p><h2>Evidence-backed copy</h2>
            <div className="ebay-description-preview" dangerouslySetInnerHTML={{ __html: draft.description_html }} />
            <p className="ebay-help">Generated deterministically from your saved customer publication, condition, service and Passport facts. Internal cost and workshop notes are not sent.</p>
          </section>

          <section className="section-card ebay-form-card ebay-photo-card">
            <p className="eyebrow">PHOTOS</p><h2>{draft.images.length} public image{draft.images.length === 1 ? '' : 's'}</h2>
            <div className="ebay-photo-strip">{draft.images.map((url, index) => <figure key={url}><img src={url} alt={`${draft.title} ${index + 1}`} />{index === 0 && <figcaption>Cover</figcaption>}</figure>)}</div>
            {!draft.images.length && <p>No public photos yet. Copy at least one workshop image into Customer Publishing first.</p>}
          </section>
        </div>

        {errorRows.length > 0 && <section className="section-card ebay-response-card">
          <p className="eyebrow">EBAY RESPONSE</p><h2>{result?.ack || 'Validation response'}</h2>
          <div className="ebay-response-list">{errorRows.map((entry, index) => <article key={`${entry.code}-${index}`} className={entry.severity.toLowerCase() === 'error' ? 'error' : 'warning'}><strong>{entry.severity} · {entry.code}</strong><span>{entry.long_message || entry.short_message}</span></article>)}</div>
        </section>}

        {result?.fees?.length ? <section className="section-card ebay-response-card"><p className="eyebrow">ESTIMATED LISTING FEES</p><div className="ebay-fees">{result.fees.map((fee) => <span key={fee.name}><strong>{fee.name}</strong>{money(fee.amount)}</span>)}</div></section> : null}

        <div className="ebay-savebar">
          <p>{message || 'Prepare → Verify → Publish.'}</p>
          <div>
            <button type="button" className="secondary" onClick={() => void prepare()} disabled={loading || checking || publishing}>Rebuild from Calibre</button>
            <button type="button" className="secondary" onClick={() => void verifyListing()} disabled={!connection?.configured || checking || publishing || readiness.length > 0}>{checking ? 'Verifying…' : 'Verify with eBay'}</button>
            <button type="button" onClick={() => void publishListing()} disabled={!connection?.configured || publishing || readiness.length > 0 || !result || !['success', 'warning'].includes(result.ack.toLowerCase()) || existing?.status === 'live'}>{publishing ? 'Publishing…' : existing?.status === 'live' ? 'Already live' : 'Publish to eBay'}</button>
          </div>
        </div>
      </>}

      {!loading && !draft && <div className="section-card"><h2>No eBay draft</h2><p>{message || 'Choose an Item to prepare a listing.'}</p></div>}
    </main>
  )
}
