import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'
import WatchXray from './WatchXray'

type XrayRecord = {
  item_type: string
  maker: string
  model: string
  movement_maker: string
  calibre: string
  movement_type: string
  escapement: string
}

function certificateSlug() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return parts[0] === 'certificate' && parts[1] ? decodeURIComponent(parts[1]) : ''
}

function isWatchType(type?: string | null) {
  const value = (type || 'watch').trim().toLowerCase()
  return value === 'watch' || value === 'wristwatch' || value === 'pocket_watch' || value === 'pocket watch'
}

export default function CertificateXrayPortal() {
  const [slug, setSlug] = useState(certificateSlug)
  const [record, setRecord] = useState<XrayRecord | null>(null)
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const sync = () => setSlug(certificateSlug())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    let active = true
    setRecord(null)
    if (!slug) return () => { active = false }
    ;(async () => {
      const { data, error } = await supabase
        .from('customer_publications')
        .select('item_type,maker,model,movement_maker,calibre,movement_type,escapement')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle()
      if (!active) return
      if (error || !data || !isWatchType(data.item_type)) setRecord(null)
      else setRecord(data as XrayRecord)
    })()
    return () => { active = false }
  }, [slug])

  useEffect(() => {
    setTarget(null)
    if (!slug || !record) return

    let anchor: HTMLElement | null = null
    const mount = () => {
      const sheet = document.querySelector<HTMLElement>('.certificate-sheet')
      if (!sheet) return
      const existing = sheet.querySelector<HTMLElement>('[data-certificate-xray-anchor]')
      anchor = existing || document.createElement('div')
      if (!existing) {
        anchor.dataset.certificateXrayAnchor = 'true'
        const footer = sheet.querySelector('footer')
        sheet.insertBefore(anchor, footer)
      }
      setTarget(anchor)
    }

    mount()
    const root = document.getElementById('root')
    const observer = new MutationObserver(mount)
    if (root) observer.observe(root, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      setTarget(null)
      if (anchor?.isConnected) anchor.remove()
    }
  }, [record, slug])

  if (!target || !record) return null
  return createPortal(
    <WatchXray
      maker={record.maker}
      model={record.model}
      movementMaker={record.movement_maker}
      calibre={record.calibre}
      movementType={record.movement_type}
      escapement={record.escapement}
    />,
    target,
  )
}
