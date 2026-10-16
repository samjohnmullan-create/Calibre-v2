import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import CalibreBrandMark from './CalibreBrandMark'

export type CustomerPublication = {
  id: string
  slug: string
  published: boolean
  catalogue_visible: boolean
  sold_archive_visible: boolean
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
}

const fields = 'id,slug,published,catalogue_visible,sold_archive_visible,public_title,subtitle,summary,condition_summary,maker,model,reference,era,country,movement_maker,calibre,jewels,beat_rate,movement_type,escapement,case_material,crystal_type,width_mm,thickness_mm,provenance_summary,service_summary,final_timing_summary,authenticity_note,certificate_number,certificate_issued_at,hero_image_url,gallery_urls,price_amount,currency,availability,published_at'

type PublicRoute = { page: 'home' | 'catalogue' | 'sold' | 'passport' | 'certificate'; slug: string | null }

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

function display(value: string | number | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
}

function navigate(hash: string) {
  if (window.location.hash === hash) window.scrollTo({ top: 0, behavior: 'smooth' })
  else window.location.hash = hash
}

function Header() {
  return (
    <header className="customer-header">
      <button className="customer-brand" type="button" onClick={() => navigate('#/home')}>
        <CalibreBrandMark className="customer-brand-mark" />
        <span><strong>Calibre & Co.</strong><small>Vintage watches · documented properly</small></span>
      </button>
      <nav aria-label="Customer navigation">
        <button type="button" onClick={() => navigate('#/home')}>Home</button>
        <button type="button" onClick={() => navigate('#/catalogue')}>Catalogue</button>
        <button type="button" onClick={() => navigate('#/sold')}>Archive</button>
      </nav>
    </header>
  )
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="customer-empty"><CalibreBrandMark /><p className="eyebrow">CALIBRE & CO.</p><h2>{title}</h2><p>{copy}</p></div>
}

function CatalogueCard({ item }: { item: CustomerPublication }) {
  return (
    <article className="catalogue-card" onClick={() => navigate(`#/passport/${encodeURIComponent(item.slug)}`)}>
      <div className="catalogue-card-image">
        {item.hero_image_url ? <img src={item.hero_image_url} alt={item.public_title} /> : <div className="catalogue-image-placeholder"><CalibreBrandMark /></div>}
        <span className={`availability-pill ${item.availability}`}>{item.availability.replace('_', ' ')}</span>
      </div>
      <div className="catalogue-card-copy">
        <p className="eyebrow">{[item.maker, item.era].filter(Boolean).join(' · ') || 'CALIBRE & CO.'}</p>
        <h2>{item.public_title || [item.maker, item.model].filter(Boolean).join(' ') || 'Untitled watch'}</h2>
        {item.subtitle && <p>{item.subtitle}</p>}
        <div className="catalogue-card-footer">
          <span>{item.calibre ? `Cal. ${item.calibre}` : item.movement_type || 'Mechanical watch'}</span>
          {item.price_amount != null && item.availability !== 'sold' && <strong>{money(item.price_amount, item.currency)}</strong>}
        </div>
      </div>
    </article>
  )
}

function Home() {
  const [featured, setFeatured] = useState<CustomerPublication[]>([])
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.from('customer_publications').select(fields).eq('published', true).eq('catalogue_visible', true).neq('availability', 'archive').order('published_at', { ascending: false, nullsFirst: false }).limit(3)
      if (active) setFeatured((data ?? []) as CustomerPublication[])
    })()
    return () => { active = false }
  }, [])

  return <main className="customer-main">
    <section className="customer-home-hero">
      <p className="eyebrow">CALIBRE & CO. · TASMANIA</p>
      <h1>Old watches deserve better records.</h1>
      <p>We research, document and restore vintage watches with the evidence left visible. Every published watch carries a digital Passport — its identity, movement, known history, service record and the things that are still uncertain.</p>
      <div className="customer-home-actions"><button type="button" onClick={() => navigate('#/catalogue')}>Explore the catalogue</button><button type="button" className="secondary-public" onClick={() => navigate('#/sold')}>Browse the archive</button></div>
    </section>

    <section className="customer-home-strip">
      <article><p className="eyebrow">01 · IDENTIFY</p><strong>Evidence before certainty.</strong><p>Maker, movement, markings and measurements are recorded before claims are made.</p></article>
      <article><p className="eyebrow">02 · PRESERVE</p><strong>Repair without erasing history.</strong><p>Age is not a defect. Restoration should make a watch usable without pretending it is new.</p></article>
      <article><p className="eyebrow">03 · DOCUMENT</p><strong>The Passport stays with the watch.</strong><p>A permanent customer-safe record can remain available long after the watch has been sold.</p></article>
    </section>

    {featured.length > 0 && <section className="customer-home-feature">
      <div className="customer-home-feature-heading"><div><p className="eyebrow">RECENTLY DOCUMENTED</p><h2>From the catalogue</h2></div><button type="button" onClick={() => navigate('#/catalogue')}>View all →</button></div>
      <div className="catalogue-grid">{featured.map((item) => <CatalogueCard key={item.id} item={item} />)}</div>
    </section>}

    <section className="customer-home-manifesto">
      <div><p className="eyebrow">THE CALIBRE RECORD</p><h2>A watch is more than a listing.</h2></div>
      <div><p>A sales description disappears. A Passport is intended to remain useful: what the watch was identified as, why that identification was made, what work was carried out and what was measured afterwards.</p><p>Where something is uncertain, the record should say so. Confirmed, probable and unresolved are more useful than manufactured confidence.</p></div>
    </section>
  </main>
}

function Catalogue({ sold = false }: { sold?: boolean }) {
  const [items, setItems] = useState<CustomerPublication[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      let query = supabase.from('customer_publications').select(fields).eq('published', true)
      query = sold ? query.eq('sold_archive_visible', true) : query.eq('catalogue_visible', true).neq('availability', 'archive')
      const { data, error } = await query.order('published_at', { ascending: false, nullsFirst: false })
      if (!active) return
      setLoading(false)
      if (error) setMessage(error.message)
      else setItems((data ?? []) as CustomerPublication[])
    })()
    return () => { active = false }
  }, [sold])

  if (loading) return <EmptyState title="Opening the collection…" copy="Loading published Calibre records." />
  if (message) return <EmptyState title="Catalogue unavailable" copy={message} />

  return (
    <main className="customer-main">
      <section className="customer-hero">
        <p className="eyebrow">{sold ? 'THE ARCHIVE' : 'THE CATALOGUE'}</p>
        <h1>{sold ? 'Watches that have passed through Calibre.' : 'Old watches. Properly documented.'}</h1>
        <p>{sold ? 'A permanent record of previously sold and restored pieces.' : 'Each watch is researched, photographed and recorded before it reaches the catalogue. The Passport stays with the watch.'}</p>
      </section>
      {items.length ? <section className="catalogue-grid">{items.map((item) => <CatalogueCard key={item.id} item={item} />)}</section> : <EmptyState title={sold ? 'The archive is still being assembled.' : 'The first watches are being prepared.'} copy="Published pieces will appear here as their records are completed." />}
    </main>
  )
}

function Passport({ slug, certificate = false }: { slug: string | null; certificate?: boolean }) {
  const [item, setItem] = useState<CustomerPublication | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!slug) { setLoading(false); return }
      const { data, error } = await supabase.from('customer_publications').select(fields).eq('slug', slug).eq('published', true).maybeSingle()
      if (!active) return
      setLoading(false)
      if (error) setMessage(error.message)
      else setItem(data as CustomerPublication | null)
    })()
    return () => { active = false }
  }, [slug])

  const specs = useMemo(() => item ? [
    ['Maker', item.maker], ['Model', item.model], ['Reference', item.reference], ['Era', item.era], ['Country', item.country],
    ['Movement maker', item.movement_maker], ['Calibre', item.calibre], ['Jewels', item.jewels], ['Beat rate', item.beat_rate ? `${item.beat_rate.toLocaleString()} BPH` : ''],
    ['Movement', item.movement_type], ['Escapement', item.escapement], ['Case', item.case_material], ['Crystal', item.crystal_type],
    ['Width', item.width_mm ? `${item.width_mm} mm` : ''], ['Thickness', item.thickness_mm ? `${item.thickness_mm} mm` : ''],
  ].filter(([, value]) => value !== '' && value !== null) : [], [item])

  if (loading) return <EmptyState title="Opening Passport…" copy="Loading the published watch record." />
  if (message || !item) return <EmptyState title="Passport not found" copy={message || 'This record may not be published yet.'} />

  if (certificate) {
    return (
      <main className="certificate-page">
        <section className="certificate-sheet">
          <div className="certificate-mark"><CalibreBrandMark /></div>
          <p className="eyebrow">CALIBRE & CO.</p>
          <h1>Watch Certificate</h1>
          <p className="certificate-intro">This certificate records the verified public facts held by Calibre & Co. for the watch identified below.</p>
          <div className="certificate-watch"><strong>{item.public_title}</strong><span>{[item.maker, item.model, item.reference].filter(Boolean).join(' · ')}</span></div>
          <dl className="certificate-grid">{specs.slice(0, 10).map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{display(value as string | number)}</dd></div>)}</dl>
          {item.authenticity_note && <div className="certificate-note"><strong>Record note</strong><p>{item.authenticity_note}</p></div>}
          <footer><span>Certificate {item.certificate_number || 'Pending'}</span><span>{item.certificate_issued_at ? new Date(item.certificate_issued_at).toLocaleDateString('en-AU') : 'Digital record'}</span></footer>
        </section>
      </main>
    )
  }

  const gallery = [item.hero_image_url, ...(item.gallery_urls ?? [])].filter(Boolean).filter((url, index, array) => array.indexOf(url) === index)

  return (
    <main className="passport-page">
      <section className="passport-public-hero">
        <div className="passport-public-image">{item.hero_image_url ? <img src={item.hero_image_url} alt={item.public_title} /> : <div className="catalogue-image-placeholder"><CalibreBrandMark /></div>}</div>
        <div className="passport-public-heading">
          <p className="eyebrow">WATCH PASSPORT</p>
          <h1>{item.public_title}</h1>
          <p>{item.subtitle || item.summary}</p>
          <div className="passport-public-meta"><span>{item.certificate_number ? `Certificate ${item.certificate_number}` : 'Calibre documented record'}</span><span>{item.availability.replace('_', ' ')}</span></div>
        </div>
      </section>

      <section className="passport-public-section"><div className="section-heading"><p className="eyebrow">IDENTITY</p><h2>The watch at a glance</h2></div><dl className="passport-spec-grid">{specs.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{display(value as string | number)}</dd></div>)}</dl></section>
      {item.summary && <section className="passport-public-section split"><div><p className="eyebrow">ABOUT THIS WATCH</p><h2>Its record</h2></div><p>{item.summary}</p></section>}
      {item.provenance_summary && <section className="passport-public-section split"><div><p className="eyebrow">PROVENANCE</p><h2>Known history</h2></div><p>{item.provenance_summary}</p></section>}
      {item.service_summary && <section className="passport-public-section split"><div><p className="eyebrow">WORKSHOP</p><h2>Service record</h2></div><p>{item.service_summary}</p></section>}
      {item.final_timing_summary && <section className="passport-public-section split"><div><p className="eyebrow">FINAL TIMING</p><h2>Measured result</h2></div><p>{item.final_timing_summary}</p></section>}
      {item.condition_summary && <section className="passport-public-section split"><div><p className="eyebrow">CONDITION</p><h2>What remains visible</h2></div><p>{item.condition_summary}</p></section>}
      {item.authenticity_note && <section className="passport-public-section split"><div><p className="eyebrow">EVIDENCE NOTE</p><h2>What is known</h2></div><p>{item.authenticity_note}</p></section>}
      {gallery.length > 1 && <section className="passport-public-section"><div className="section-heading"><p className="eyebrow">PHOTOGRAPHIC RECORD</p><h2>Documented details</h2></div><div className="passport-gallery">{gallery.map((url) => <img key={url} src={url} alt="Watch record" />)}</div></section>}
      <section className="passport-actions"><button type="button" onClick={() => navigate(`#/certificate/${encodeURIComponent(item.slug)}`)}>View certificate</button><button type="button" className="secondary-public" onClick={() => navigate('#/catalogue')}>Back to catalogue</button></section>
    </main>
  )
}

export default function CustomerSite() {
  const [route, setRoute] = useState<PublicRoute>(() => readPublicRoute())
  useEffect(() => { const sync = () => { setRoute(readPublicRoute()); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }; window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync) }, [])
  useEffect(() => { document.title = route.page === 'passport' ? 'Watch Passport · Calibre & Co.' : route.page === 'certificate' ? 'Watch Certificate · Calibre & Co.' : 'Calibre & Co. · Vintage Watches' }, [route.page])
  return <div className="customer-site"><Header />{route.page === 'home' && <Home />}{route.page === 'catalogue' && <Catalogue />}{route.page === 'sold' && <Catalogue sold />}{route.page === 'passport' && <Passport slug={route.slug} />}{route.page === 'certificate' && <Passport slug={route.slug} certificate />}</div>
}

export function isCustomerRoute() {
  const first = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0]
  return ['home', 'catalogue', 'sold', 'passport', 'certificate'].includes(first)
}
