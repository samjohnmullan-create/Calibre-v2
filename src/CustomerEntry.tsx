import { useEffect } from 'react'
import CustomerSite from './CustomerSite'
import './styles.css'
import './customer-site.css'
import './customer-enquiry-public.css'

const PUBLIC_OBJECT_PATH = '/storage/v1/object/public/calibre-public/'
const PUBLIC_RENDER_PATH = '/storage/v1/render/image/public/calibre-public/'

function optimisePublicImageUrl(source: string, width: number) {
  if (!source || !source.includes(PUBLIC_OBJECT_PATH)) return source
  try {
    const url = new URL(source, window.location.href)
    url.pathname = url.pathname.replace(PUBLIC_OBJECT_PATH, PUBLIC_RENDER_PATH)
    url.searchParams.set('width', String(width))
    url.searchParams.set('quality', '76')
    url.searchParams.set('resize', 'contain')
    return url.toString()
  } catch {
    return source
  }
}

function optimiseImage(image: HTMLImageElement) {
  if (image.dataset.calibreOptimised === '1') return
  const source = image.currentSrc || image.src
  if (!source.includes(PUBLIC_OBJECT_PATH)) return

  const isCard = Boolean(image.closest('.catalogue-card, .customer-home-feature'))
  const width = isCard ? 900 : 1800
  const optimised = optimisePublicImageUrl(source, width)
  if (optimised === source) return

  image.dataset.calibreOptimised = '1'
  image.decoding = 'async'
  if (isCard) image.loading = 'lazy'
  image.src = optimised
}

export default function CustomerEntry() {
  useEffect(() => {
    const optimiseAll = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLImageElement>('img').forEach(optimiseImage)
    }

    optimiseAll()
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          if (node instanceof HTMLImageElement) optimiseImage(node)
          optimiseAll(node)
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return <CustomerSite />
}
