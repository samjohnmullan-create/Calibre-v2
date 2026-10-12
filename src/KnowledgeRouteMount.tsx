import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import KnowledgePage from './KnowledgePage'

function isCalibreRoute() {
  return window.location.hash.replace(/^#\/?/, '').split('/')[0] === 'calibre'
}

export default function KnowledgeRouteMount() {
  const [target, setTarget] = useState<Element | null>(null)
  const [, setRouteTick] = useState(0)

  useEffect(() => {
    const sync = () => {
      const active = isCalibreRoute()
      document.documentElement.classList.toggle('knowledge-route-active', active)
      setRouteTick((value) => value + 1)
      setTarget(active ? document.querySelector('.placeholder-page') : null)
    }

    sync()
    window.addEventListener('hashchange', sync)
    const observer = new MutationObserver(sync)
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('hashchange', sync)
      observer.disconnect()
      document.documentElement.classList.remove('knowledge-route-active')
    }
  }, [])

  if (!isCalibreRoute() || !target) return null
  return createPortal(<KnowledgePage />, target)
}
