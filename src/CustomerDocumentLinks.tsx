import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import CalibreBrandMark from './CalibreBrandMark'
import './customer-document-links.css'

type CustomerFiles = {
  public_title: string
  certificate_number: string | null
  passport_pdf_url: string | null
  certificate_pdf_url: string | null
  customer_pack_issued_at: string | null
}

function passportSlug() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return parts[0] === 'passport' && parts[1] ? decodeURIComponent(parts[1]) : ''
}

export default function CustomerDocumentLinks() {
  const [slug, setSlug] = useState(passportSlug)
  const [files, setFiles] = useState<CustomerFiles | null>(null)

  useEffect(() => {
    const sync = () => setSlug(passportSlug())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!slug) { setFiles(null); return }
    let active = true
    ;(async () => {
      const result = await supabase.from('customer_publications')
        .select('public_title,certificate_number,passport_pdf_url,certificate_pdf_url,customer_pack_issued_at')
        .eq('slug', slug).eq('published', true).maybeSingle()
      if (active) setFiles(result.data as CustomerFiles | null)
    })()
    return () => { active = false }
  }, [slug])

  if (!slug || !files || (!files.passport_pdf_url && !files.certificate_pdf_url)) return null

  return (
    <aside className="customer-document-links" aria-label="Issued watch documents">
      <div className="customer-document-links-head"><CalibreBrandMark /><div><span>CALIBRE CUSTOMER PACK</span><strong>{files.certificate_number || files.public_title}</strong></div></div>
      <p>Your issued documents remain attached to this watch’s permanent digital record.</p>
      <div className="customer-document-links-actions">
        {files.passport_pdf_url && <a href={files.passport_pdf_url} target="_blank" rel="noreferrer" download>Download Passport PDF</a>}
        {files.certificate_pdf_url && <a href={files.certificate_pdf_url} target="_blank" rel="noreferrer" download>Download Certificate PDF</a>}
      </div>
      {files.customer_pack_issued_at && <small>Issued {new Date(files.customer_pack_issued_at).toLocaleDateString('en-AU')}</small>}
    </aside>
  )
}
