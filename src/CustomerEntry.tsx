import { useEffect, useState } from 'react'
import CustomerSite from './CustomerSite'
import './styles.css'
import './customer-site.css'
import './customer-enquiry-public.css'
import './customer-lightbox.css'

export default function CustomerEntry() {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof HTMLImageElement)) return
      if (!target.closest('.passport-public-image, .passport-gallery')) return
      if (!target.src) return
      event.preventDefault()
      setLightbox({ src: target.currentSrc || target.src, alt: target.alt || 'Full-size item photograph' })
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    if (!lightbox) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [lightbox])

  return <>
    <CustomerSite />
    {lightbox && <div className="customer-lightbox" role="dialog" aria-modal="true" aria-label="Full-size photograph" onClick={() => setLightbox(null)}>
      <button type="button" className="customer-lightbox-close" onClick={() => setLightbox(null)} aria-label="Close full-size photograph">×</button>
      <img src={lightbox.src} alt={lightbox.alt} onClick={(event) => event.stopPropagation()} />
      <span>Tap outside the image or press Esc to close</span>
    </div>}
  </>
}
