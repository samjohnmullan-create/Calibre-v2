import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type EnquiryStatus = 'new' | 'replied' | 'negotiating' | 'sold' | 'closed'

type PublicationSummary = {
  public_title: string
  slug: string
  item_id: string
  availability: string
}

type Enquiry = {
  id: string
  publication_id: string
  name: string
  email: string
  phone: string
  message: string
  status: EnquiryStatus
  source_url: string
  created_at: string
  updated_at: string
  customer_publications: PublicationSummary | null
}

const statuses: { value: EnquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'replied', label: 'Replied' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'sold', label: 'Sold' },
  { value: 'closed', label: 'Closed' },
]

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function mailto(enquiry: Enquiry) {
  const watch = enquiry.customer_publications?.public_title || 'your Calibre enquiry'
  const subject = encodeURIComponent(`Re: ${watch}`)
  const body = encodeURIComponent(`Hi ${enquiry.name},\n\nThanks for your enquiry about ${watch}.\n\n`)
  return `mailto:${encodeURIComponent(enquiry.email)}?subject=${subject}&body=${body}`
}

export default function CustomerEnquiriesRoute() {
  const [items, setItems] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<'active' | 'all' | EnquiryStatus>('active')
  const [updating, setUpdating] = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_enquiries')
      .select('id,publication_id,name,email,phone,message,status,source_url,created_at,updated_at,customer_publications(public_title,slug,item_id,availability)')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('')
    setItems((data ?? []) as unknown as Enquiry[])
  }

  useEffect(() => { void load() }, [])

  const counts = useMemo(() => ({
    new: items.filter((item) => item.status === 'new').length,
    active: items.filter((item) => !['sold', 'closed'].includes(item.status)).length,
    negotiating: items.filter((item) => item.status === 'negotiating').length,
    closed: items.filter((item) => ['sold', 'closed'].includes(item.status)).length,
  }), [items])

  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'all') return true
    if (filter === 'active') return !['sold', 'closed'].includes(item.status)
    return item.status === filter
  }), [items, filter])

  async function updateStatus(enquiry: Enquiry, status: EnquiryStatus) {
    if (status === enquiry.status) return
    setUpdating(enquiry.id)
    const now = new Date().toISOString()
    const { error } = await supabase.from('customer_enquiries').update({ status, updated_at: now }).eq('id', enquiry.id)
    setUpdating('')
    if (error) {
      setMessage(error.message)
      return
    }
    setItems((current) => current.map((item) => item.id === enquiry.id ? { ...item, status, updated_at: now } : item))
    setMessage(`Enquiry marked ${status}.`)
  }

  return (
    <main className="customer-publish-page customer-enquiries-page">
      <header className="customer-publish-header">
        <div>
          <p className="eyebrow">CUSTOMER SIDE</p>
          <h1>Enquiries</h1>
          <p>Customer interest tied directly to the watch they were viewing. Keep the conversation moving without losing which piece they asked about.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      <section className="customer-enquiry-summary" aria-label="Enquiry summary">
        <button type="button" className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}><span>Active</span><strong>{counts.active}</strong></button>
        <button type="button" className={filter === 'new' ? 'active' : ''} onClick={() => setFilter('new')}><span>New</span><strong>{counts.new}</strong></button>
        <button type="button" className={filter === 'negotiating' ? 'active' : ''} onClick={() => setFilter('negotiating')}><span>Negotiating</span><strong>{counts.negotiating}</strong></button>
        <button type="button" className={filter === 'closed' ? 'active' : ''} onClick={() => setFilter('closed')}><span>Closed / sold</span><strong>{counts.closed}</strong></button>
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><span>All</span><strong>{items.length}</strong></button>
      </section>

      {message && <p className="customer-enquiry-message">{message}</p>}
      {loading && <div className="loading-card">Opening customer enquiries…</div>}
      {!loading && !visible.length && <section className="section-card customer-enquiry-empty"><h2>No enquiries here yet</h2><p>New website enquiries will appear here automatically and stay attached to their watch.</p></section>}

      {!loading && visible.length > 0 && <section className="customer-enquiry-list">
        {visible.map((enquiry) => {
          const publication = enquiry.customer_publications
          return <article className={`section-card customer-enquiry-card status-${enquiry.status}`} key={enquiry.id}>
            <div className="customer-enquiry-card-head">
              <div>
                <p className="eyebrow">{dateTime(enquiry.created_at)}</p>
                <h2>{publication?.public_title || 'Published watch'}</h2>
                <p className="customer-enquiry-person"><strong>{enquiry.name}</strong> · <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>{enquiry.phone ? <> · <a href={`tel:${enquiry.phone}`}>{enquiry.phone}</a></> : null}</p>
              </div>
              <label>Status
                <select value={enquiry.status} disabled={updating === enquiry.id} onChange={(event) => void updateStatus(enquiry, event.target.value as EnquiryStatus)}>
                  {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
            </div>
            <blockquote>{enquiry.message}</blockquote>
            <div className="customer-enquiry-actions">
              <a className="customer-enquiry-primary" href={mailto(enquiry)} onClick={() => { if (enquiry.status === 'new') void updateStatus(enquiry, 'replied') }}>Reply by email</a>
              {publication?.slug && <a href={`https://calibreco.com.au/#/passport/${encodeURIComponent(publication.slug)}`} target="_blank" rel="noreferrer">Open Passport ↗</a>}
              {publication?.item_id && <a href={`#/items/${encodeURIComponent(publication.item_id)}`}>Open Item</a>}
            </div>
          </article>
        })}
      </section>}
    </main>
  )
}
