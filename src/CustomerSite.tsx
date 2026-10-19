import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import CalibreBrandMark from './CalibreBrandMark'

export type CustomerPublication = {
  id: string
  slug: string
  published: boolean
  catalogue_visible: boolean
  sold_archive_visible: boolean
  item_type: string
  public_title: string
  subtitle: string
  summary: string
  condition_summary: string
  maker: string
  model: string
  reference: string
  era: string
  country: string
  movement_maker: string
  calibre: string
  jewels: number | null
  beat_rate: number | null
  movement_type: string
  escapement: string
  case_material: string
  crystal_type: string
  width_mm: number | null
  thickness_mm: number | null
  provenance_summary: string
  service_summary: string
  final_timing_summary: string
  authenticity_note: string
  certificate_number: string | null
  certificate_issued_at: string | null
  hero_image_url: string
  gallery_urls: string[]
  price_amount: number | null
  currency: string
  availability: 'catalogue' | 'available' | 'reserved' | 'sold' | 'archive'
  published_at: string | null
  passport_pdf_url: string | null
  certificate_pdf_url: string | null
  customer_pack_issued_at: string | null
}

type CustomerCard = Pick<CustomerPublication,
  'id' | 'slug' | 'item_type' | 'public_title' | 'subtitle' | 'maker' | 'era' | 'calibre' | 'movement_type' |
  'hero_image_url' | 'price_amount' | 'currency' | 'availability'
>

const cardFields = 'id,slug,item_type,public_title,subtitle,maker,era,calibre,movement_type,hero_image_url,price_amount,currency,availability'
const passportFields = 'id,slug,published,catalogue_visible,sold_archive_visible,item_type,public_title,subtitle,summary,condition_summary,maker,model,reference,era,country,movement_maker,calibre,jewels,beat_rate,movement_type,escapement,case_material,crystal_type,width_mm,thickness_mm,provenance_summary,service_summary,final_timing_summary,authenticity_note,certificate_number,certificate_issued_at,hero_image_url,gallery_urls,price_amount,currency,availability,published_at,passport_pdf_url,certificate_pdf_url,customer_pack_issued_at'

type PublicRoute = { page: 'home' | 'catalogue' | 'sold' | 'passport' | 'certificate'; slug: string | null }

function isWatchType(type?: string | null) {
  const value = (type || 'watch').trim().toLowerCase()
  return value === 'watch' || value === 'wristwatch' || value === 'pocket_watch' || value === 'pocket watch'
}

function itemNoun(type?: string | null) {
  if (isWatchType(type)) return 'watch'
  const value = (type || '').trim().toLowerCase().replaceAll('_', ' ')
  if (value.includes('lighter')) return 'lighter'
  if (value.includes('clock')) return 'clock'
  if (value.includes('jewel')) return 'jewellery item'
  return 'item'
}

function readPublicRoute(): PublicRoute {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'passport') return { page: 'passport', slug: parts[1] ? decodeURIComponent(parts[1]) : null }
  if (parts[0] === 'certificate') return { page: 'certificate', slug: parts[1] ? decodeURIComponent(parts[1]) : null }
  if (parts[0] === 'catalogue') return { page: 'catalogue', slug: null }
  if (parts[0] === 'sold') return { page: 'sold', slug: null }
  return { page: 'home', slug: null }
}

function money(value: number | null, currency: string) {
  if (value == null) return ''
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

function display(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}`
}

function navigate(hash: string) {
  if (window.location.hash === hash) window.scrollTo({ top: 0, behavior: 'smooth' })
  else window.location.hash = hash
}

function setMetaTag(attribute: 'name' | 'property', key: string, content?: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!content) { element?.remove(); return }
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.content = content
}

function applyCustomerMeta(title: string, description: string, image?: string) {
  document.title = title
  setMetaTag('name', 'description', description)
  setMetaTag('name', 'theme-color', '#172026')
  setMetaTag('property', 'og:title', title)
  setMetaTag('property', 'og:description', description)
  setMetaTag('property', 'og:type', 'website')
  setMetaTag('property', 'og:site_name', 'Calibre & Co.')
  setMetaTag('property', 'og:url', window.location.href)
  setMetaTag('property', 'og:image', image)
  setMetaTag('name', 'twitter:card', image ? 'summary_large_image' : 'summary')
  setMetaTag('name', 'twitter:title', title)
  setMetaTag('name', 'twitter:description', description)
  setMetaTag('name', 'twitter:image', image)
}

function Header() {
  return <header className="customer-header">
    <button className="customer-brand" type="button" onClick={() => navigate('#/home')} aria-label="Calibre & Co. home">
      <CalibreBrandMark className="customer-brand-mark" />
      <span><strong>Calibre & Co.</strong><small>Vintage pieces · documented properly</small></span>
    </button>
    <nav aria-label="Customer navigation"><button type="button" onClick={() => navigate('#/home')}>Home</button><button type="button" onClick={() => navigate('#/catalogue')}>Catalogue</button><button type="button" onClick={() => navigate('#/sold')}>Archive</button></nav>
  </header>
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="customer-empty"><CalibreBrandMark /><p className="eyebrow">CALIBRE & CO.</p><h2>{title}</h2><p>{copy}</p></div>
}

function CatalogueCard({ item }: { item: CustomerCard }) {
  const noun = itemNoun(item.item_type)
  const watch = isWatchType(item.item_type)
  const target = `#/passport/${encodeURIComponent(item.slug)}`
  const open = () => navigate(target)
  return <article className="catalogue-card" role="link" tabIndex={0} aria-label={`Open Calibre Passport for ${item.public_title || item.maker || `this ${noun}`}`} onClick={open} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() } }}>
    <div className="catalogue-card-image">{item.hero_image_url ? <img src={item.hero_image_url} alt={item.public_title} loading="lazy" decoding="async" /> : <div className="catalogue-image-placeholder"><CalibreBrandMark /></div>}<span className={`availability-pill ${item.availability}`}>{item.availability.replace('_', ' ')}</span></div>
    <div className="catalogue-card-copy"><p className="eyebrow">{[item.maker, item.era].filter(Boolean).join(' · ') || 'CALIBRE & CO.'}</p><h2>{item.public_title || item.maker || `Untitled ${noun}`}</h2>{item.subtitle && <p>{item.subtitle}</p>}<div className="catalogue-card-footer"><span>{watch ? (item.calibre ? `Cal. ${item.calibre}` : item.movement_type || 'Vintage watch') : item.item_type?.replaceAll('_', ' ') || 'Collectable'}</span>{item.price_amount != null && item.availability !== 'sold' && <strong>{money(item.price_amount, item.currency)}</strong>}</div></div>
  </article>
}

function Home() {
  const [featured, setFeatured] = useState<CustomerCard[]>([])
  useEffect(() => { let active = true; (async () => { const { data } = await supabase.from('customer_publications').select(cardFields).eq('published', true).eq('catalogue_visible', true).neq('availability', 'archive').order('published_at', { ascending: false, nullsFirst: false }).limit(3); if (active) setFeatured((data ?? []) as CustomerCard[]) })(); return () => { active = false } }, [])
  return <main className="customer-main">
    <section className="customer-home-hero"><p className="eyebrow">CALIBRE & CO. · TASMANIA</p><h1>Old pieces deserve better records.</h1><p>We research, document and preserve vintage watches and collectables with the evidence left visible. Every published piece carries a digital Passport recording what it is, what is known about it and what remains uncertain.</p><div className="customer-home-actions"><button type="button" onClick={() => navigate('#/catalogue')}>Explore the catalogue</button><button type="button" className="secondary-public" onClick={() => navigate('#/sold')}>Browse the archive</button></div></section>
    <section className="customer-home-strip"><article><p className="eyebrow">01 · IDENTIFY</p><strong>Evidence before certainty.</strong><p>Maker, markings, measurements and construction are recorded before claims are made.</p></article><article><p className="eyebrow">02 · PRESERVE</p><strong>Care without erasing history.</strong><p>Age is not a defect. Conservation should make an object usable or presentable without pretending it is new.</p></article><article><p className="eyebrow">03 · DOCUMENT</p><strong>The Passport stays with the piece.</strong><p>A permanent customer-safe record can remain available long after an item has been sold.</p></article></section>
    {featured.length > 0 && <section className="customer-home-feature"><div className="customer-home-feature-heading"><div><p className="eyebrow">RECENTLY DOCUMENTED</p><h2>From the catalogue</h2></div><button type="button" onClick={() => navigate('#/catalogue')}>View all →</button></div><div className="catalogue-grid">{featured.map((item) => <CatalogueCard key={item.id} item={item} />)}</div></section>}
    <section className="customer-home-manifesto"><div><p className="eyebrow">THE CALIBRE RECORD</p><h2>An object is more than a listing.</h2></div><div><p>A sales description disappears. A Passport is intended to remain useful: what the item was identified as, why that identification was made, what work was carried out and what was observed afterwards.</p><p>Where something is uncertain, the record should say so. Confirmed, probable and unresolved are more useful than manufactured confidence.</p></div></section>
  </main>
}

function Catalogue({ sold = false }: { sold?: boolean }) {
  const [items, setItems] = useState<CustomerCard[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  useEffect(() => { let active = true; (async () => { let query = supabase.from('customer_publications').select(cardFields).eq('published', true); query = sold ? query.eq('sold_archive_visible', true) : query.eq('catalogue_visible', true).neq('availability', 'archive'); const { data, error } = await query.order('published_at', { ascending: false, nullsFirst: false }); if (!active) return; setLoading(false); if (error) setMessage(error.message); else setItems((data ?? []) as CustomerCard[]) })(); return () => { active = false } }, [sold])
  if (loading) return <EmptyState title="Opening the collection…" copy="Loading published Calibre records." />
  if (message) return <EmptyState title="Catalogue unavailable" copy={message} />
  return <main className="customer-main"><section className="customer-hero"><p className="eyebrow">{sold ? 'THE ARCHIVE' : 'THE CATALOGUE'}</p><h1>{sold ? 'Pieces that have passed through Calibre.' : 'Vintage pieces. Properly documented.'}</h1><p>{sold ? 'A permanent record of previously sold and documented pieces.' : 'Each item is researched, photographed and recorded before it reaches the catalogue. Its Passport stays with it.'}</p></section>{items.length ? <section className="catalogue-grid">{items.map((item) => <CatalogueCard key={item.id} item={item} />)}</section> : <EmptyState title={sold ? 'The archive is still being assembled.' : 'The first pieces are being prepared.'} copy="Published pieces will appear here as their records are completed." />}</main>
}

function EnquiryPanel({ item }: { item: CustomerPublication }) {
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [message, setMessage] = useState(''), [website, setWebsite] = useState(''), [sending, setSending] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('')
  if (item.availability === 'sold' || item.availability === 'archive') return null
  const noun = itemNoun(item.item_type)
  const label = item.availability === 'available' ? `Enquire about this ${noun}` : item.availability === 'reserved' ? `Ask about this reserved ${noun}` : `Ask about this ${noun}`
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (website) { setSent(true); return }
    if (name.trim().length < 2 || !email.includes('@') || message.trim().length < 10) { setError('Please add your name, a valid email and a short message.'); return }
    setSending(true)
    const { error: insertError } = await supabase.from('customer_enquiries').insert({ publication_id: item.id, name: name.trim(), email: email.trim(), phone: phone.trim(), message: message.trim(), source_url: window.location.href.slice(0, 700) })
    setSending(false)
    if (insertError) { setError('Your enquiry could not be sent just now. Please try again.'); return }
    setSent(true); setName(''); setEmail(''); setPhone(''); setMessage('')
  }
  return <section className={`passport-enquiry ${open || sent ? 'open' : ''}`}><div className="passport-enquiry-intro"><div><p className="eyebrow">INTERESTED IN THIS {noun.toUpperCase()}?</p><h2>{sent ? 'Enquiry received.' : label}</h2><p>{sent ? `Thanks — your message is now attached to this ${noun} in our Calibre records.` : 'Ask about availability, condition, shipping or anything else you would like to know before deciding.'}</p></div>{!sent && !open && <button type="button" onClick={() => setOpen(true)}>{label}</button>}</div>{open && !sent && <form className="passport-enquiry-form" onSubmit={submit}><div className="passport-enquiry-fields"><label>Name<input required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Phone <span>optional</span><input maxLength={80} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label></div><label>Message<textarea required minLength={10} maxLength={4000} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`I'm interested in ${item.public_title}…`} /></label><label className="passport-enquiry-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>{error && <p className="passport-enquiry-error" role="alert">{error}</p>}<div className="passport-enquiry-submit"><button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send enquiry'}</button><p>Your details are used only to respond to this enquiry and are never shown publicly.</p></div></form>}</section>
}

function Passport({ slug, certificate = false }: { slug: string | null; certificate?: boolean }) {
  const [item, setItem] = useState<CustomerPublication | null>(null), [loading, setLoading] = useState(true), [message, setMessage] = useState('')
  useEffect(() => { let active = true; (async () => { if (!slug) { setLoading(false); return } const { data, error } = await supabase.from('customer_publications').select(passportFields).eq('slug', slug).eq('published', true).maybeSingle(); if (!active) return; setLoading(false); if (error) setMessage(error.message); else setItem(data as CustomerPublication | null) })(); return () => { active = false } }, [slug])
  useEffect(() => { if (!item) return; const noun = itemNoun(item.item_type); const description = item.subtitle || item.summary || `Documented vintage ${noun} record for ${item.public_title}.`; applyCustomerMeta(`${item.public_title} · ${certificate ? 'Certificate' : 'Calibre Passport'} · Calibre & Co.`, description, item.hero_image_url || undefined) }, [item, certificate])
  const watch = item ? isWatchType(item.item_type) : true
  const noun = item ? itemNoun(item.item_type) : 'item'
  const specs = useMemo(() => item ? [
    ['Maker', item.maker], ['Model', item.model], ['Reference', item.reference], ['Era', item.era], ['Country', item.country],
    ...(isWatchType(item.item_type) ? [['Movement maker', item.movement_maker], ['Calibre', item.calibre], ['Jewels', item.jewels], ['Beat rate', item.beat_rate ? `${item.beat_rate.toLocaleString()} BPH` : ''], ['Movement', item.movement_type], ['Escapement', item.escapement], ['Case', item.case_material], ['Crystal', item.crystal_type]] : []),
    ['Width', item.width_mm ? `${item.width_mm} mm` : ''], ['Thickness', item.thickness_mm ? `${item.thickness_mm} mm` : ''],
  ].filter(([, value]) => value !== '' && value !== null) : [], [item])
  if (loading) return <EmptyState title="Opening Passport…" copy="Loading the published Calibre record." />
  if (message || !item) return <EmptyState title="Passport not found" copy={message || 'This record may not be published yet.'} />
  if (certificate) return <main className="certificate-page"><section className="certificate-sheet"><div className="certificate-mark"><CalibreBrandMark /></div><p className="eyebrow">CALIBRE & CO.</p><h1>{watch ? 'Watch Certificate' : 'Certificate of Record'}</h1><p className="certificate-intro">This certificate records the verified public facts held by Calibre & Co. for the {noun} identified below.</p><div className="certificate-watch"><strong>{item.public_title}</strong><span>{[item.maker, item.model, item.reference].filter(Boolean).join(' · ')}</span></div><dl className="certificate-grid">{specs.slice(0, 10).map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{display(value as string | number)}</dd></div>)}</dl>{item.authenticity_note && <div className="certificate-note"><strong>Record note</strong><p>{item.authenticity_note}</p></div>}<footer><span>Certificate {item.certificate_number || 'Pending'}</span><span>{item.certificate_issued_at ? new Date(item.certificate_issued_at).toLocaleDateString('en-AU') : 'Digital record'}</span></footer></section></main>
  const gallery = [item.hero_image_url, ...(item.gallery_urls ?? [])].filter(Boolean).filter((url, index, array) => array.indexOf(url) === index)
  const hasDocuments = Boolean(item.passport_pdf_url || item.certificate_pdf_url)
  return <main className="passport-page"><section className="passport-public-hero"><div className="passport-public-image">{item.hero_image_url ? <img src={item.hero_image_url} alt={item.public_title} decoding="async" /> : <div className="catalogue-image-placeholder"><CalibreBrandMark /></div>}</div><div className="passport-public-heading"><p className="eyebrow">{watch ? 'WATCH PASSPORT' : 'CALIBRE PASSPORT'}</p><h1>{item.public_title}</h1><p>{item.subtitle || item.summary}</p><div className="passport-public-meta"><span>{item.certificate_number ? `Certificate ${item.certificate_number}` : 'Calibre documented record'}</span><span>{item.availability.replace('_', ' ')}</span></div>{item.price_amount != null && item.availability === 'available' && <p className="passport-public-price">{money(item.price_amount, item.currency)}</p>}</div></section>
    <EnquiryPanel item={item} />
    <section className="passport-public-section"><div className="section-heading"><p className="eyebrow">IDENTITY</p><h2>The {noun} at a glance</h2></div><dl className="passport-spec-grid">{specs.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{display(value as string | number)}</dd></div>)}</dl></section>
    {item.summary && <section className="passport-public-section split"><div><p className="eyebrow">ABOUT THIS {noun.toUpperCase()}</p><h2>Its record</h2></div><p>{item.summary}</p></section>}
    {item.provenance_summary && <section className="passport-public-section split"><div><p className="eyebrow">PROVENANCE</p><h2>Known history</h2></div><p>{item.provenance_summary}</p></section>}
    {item.service_summary && <section className="passport-public-section split"><div><p className="eyebrow">WORKSHOP</p><h2>{watch ? 'Service record' : 'Work record'}</h2></div><p>{item.service_summary}</p></section>}
    {watch && item.final_timing_summary && <section className="passport-public-section split"><div><p className="eyebrow">FINAL TIMING</p><h2>Measured result</h2></div><p>{item.final_timing_summary}</p></section>}
    {item.condition_summary && <section className="passport-public-section split"><div><p className="eyebrow">CONDITION</p><h2>What remains visible</h2></div><p>{item.condition_summary}</p></section>}
    {item.authenticity_note && <section className="passport-public-section split"><div><p className="eyebrow">EVIDENCE NOTE</p><h2>What is known</h2></div><p>{item.authenticity_note}</p></section>}
    {gallery.length > 1 && <section className="passport-public-section"><div className="section-heading"><p className="eyebrow">PHOTOGRAPHIC RECORD</p><h2>Documented details</h2></div><div className="passport-gallery">{gallery.map((url, index) => <img key={url} src={url} alt={`${item.public_title} documented detail ${index + 1}`} loading="lazy" decoding="async" />)}</div></section>}
    {hasDocuments && <section className="passport-public-section passport-document-section"><div><p className="eyebrow">CUSTOMER PACK</p><h2>Permanent documents</h2>{item.customer_pack_issued_at && <p>Issued {new Date(item.customer_pack_issued_at).toLocaleDateString('en-AU')}</p>}</div><div className="passport-document-links">{item.passport_pdf_url && <a href={item.passport_pdf_url} target="_blank" rel="noreferrer">Download Passport PDF ↗</a>}{item.certificate_pdf_url && <a href={item.certificate_pdf_url} target="_blank" rel="noreferrer">Download Certificate PDF ↗</a>}</div></section>}
    <section className="passport-actions"><button type="button" onClick={() => navigate(`#/certificate/${encodeURIComponent(item.slug)}`)}>View certificate</button><button type="button" className="secondary-public" onClick={() => navigate('#/catalogue')}>Back to catalogue</button></section>
  </main>
}

export default function CustomerSite() {
  const [route, setRoute] = useState<PublicRoute>(() => readPublicRoute())
  useEffect(() => { const sync = () => { setRoute(readPublicRoute()); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }; window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync) }, [])
  useEffect(() => { const metadata = route.page === 'catalogue' ? ['Vintage Catalogue · Calibre & Co.', 'Browse documented vintage watches and collectables from Calibre & Co. in Tasmania.'] : route.page === 'sold' ? ['Vintage Archive · Calibre & Co.', 'Browse the permanent Calibre & Co. archive of previously documented vintage pieces.'] : route.page === 'passport' ? ['Calibre Passport · Calibre & Co.', 'A documented Calibre & Co. record with identity, provenance, condition and workshop information.'] : route.page === 'certificate' ? ['Certificate · Calibre & Co.', 'A Calibre & Co. digital certificate recording the published facts held for a documented vintage piece.'] : ['Calibre & Co. · Vintage Pieces, Documented Properly', 'Tasmanian vintage watches and collectables researched, preserved and documented with permanent digital Passports.']; applyCustomerMeta(metadata[0], metadata[1]) }, [route.page, route.slug])
  return <div className="customer-site"><Header />{route.page === 'home' && <Home />}{route.page === 'catalogue' && <Catalogue />}{route.page === 'sold' && <Catalogue sold />}{route.page === 'passport' && <Passport slug={route.slug} />}{route.page === 'certificate' && <Passport slug={route.slug} certificate />}</div>
}

export function isCustomerRoute() {
  const first = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0]
  return ['home', 'catalogue', 'sold', 'passport', 'certificate'].includes(first)
}
