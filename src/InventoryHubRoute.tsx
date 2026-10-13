import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import PartsInventory from './PartsInventory'
import InvoiceIntakeServer from './InvoiceIntakeServer'
import InvoiceFiles from './InvoiceFiles'

type ItemRow = {
  id: string
  item_number: number
  type: string
  purpose: string
  status: string
  title: string
  notes: string
  created_at: string
}

type InventoryTab = 'all' | 'watch' | 'jewellery' | 'clock' | 'accessory' | 'parts' | 'donor' | 'other' | 'files'

const tabs: { key: InventoryTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'watch', label: 'Watches' },
  { key: 'jewellery', label: 'Jewellery' },
  { key: 'clock', label: 'Clocks' },
  { key: 'accessory', label: 'Accessories' },
  { key: 'parts', label: 'Parts' },
  { key: 'donor', label: 'Donors' },
  { key: 'other', label: 'Other' },
  { key: 'files', label: 'Files' },
]

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isInventoryRoot() {
  const hash = window.location.hash.replace(/\/$/, '')
  return hash === '#/items' || hash === '#items' || hash === ''
}

export default function InventoryHubRoute() {
  const [active, setActive] = useState(isInventoryRoot)
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<InventoryTab>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const sync = () => setActive(isInventoryRoot())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    const interceptItemsNav = (event: MouseEvent) => {
      const target = event.target as Element | null
      const button = target?.closest('.topnav button')
      if (!button || button.textContent?.trim().toLowerCase() !== 'items') return
      event.preventDefault()
      event.stopPropagation()
      window.location.hash = '#/items'
    }
    document.addEventListener('click', interceptItemsNav, true)
    return () => document.removeEventListener('click', interceptItemsNav, true)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('inventory-hub-route-active', active)
    return () => document.body.classList.remove('inventory-hub-route-active')
  }, [active])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setMessage(`Inventory unavailable: ${result.error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(result.data.id)
    })()
    return () => { cancelled = true }
  }, [active])

  useEffect(() => {
    if (!active || !workspaceId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const result = await supabase
        .from('items')
        .select('id,item_number,type,purpose,status,title,notes,created_at')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
        .order('item_number', { ascending: false })
      if (cancelled) return
      setLoading(false)
      if (result.error) {
        setMessage(`Inventory failed to load: ${result.error.message}`)
        return
      }
      setItems((result.data ?? []) as ItemRow[])
      setMessage('')
    })()
    return () => { cancelled = true }
  }, [active, workspaceId])

  const counts = useMemo(() => {
    const knownTypes = new Set(['watch', 'jewellery', 'clock', 'accessory'])
    return {
      all: items.length,
      watch: items.filter((item) => item.type === 'watch').length,
      jewellery: items.filter((item) => item.type === 'jewellery').length,
      clock: items.filter((item) => item.type === 'clock').length,
      accessory: items.filter((item) => item.type === 'accessory').length,
      donor: items.filter((item) => item.purpose === 'donor').length,
      other: items.filter((item) => !knownTypes.has(item.type)).length,
    }
  }, [items])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    const knownTypes = new Set(['watch', 'jewellery', 'clock', 'accessory'])
    return items.filter((item) => {
      const categoryMatch = tab === 'all'
        || (tab === 'donor' && item.purpose === 'donor')
        || (tab === 'other' && !knownTypes.has(item.type))
        || (tab !== 'parts' && tab !== 'donor' && tab !== 'other' && tab !== 'files' && item.type === tab)
      if (!categoryMatch) return false
      if (!text) return true
      return [item.title, item.type, item.purpose, item.status, item.notes, String(item.item_number)]
        .some((value) => value?.toLowerCase().includes(text))
    })
  }, [items, query, tab])

  if (!active) return null

  return (
    <main className="inventory-hub-page">
      <header className="inventory-hub-heading">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h1>Items</h1>
          <p className="muted">Browse the collection first. Open an Item only when you need its Passport, Work, media or commerce record.</p>
        </div>
        <button type="button" aria-label="Create item">＋ Add Item</button>
      </header>

      <div className="inventory-intake-row">
        <InvoiceIntakeServer workspaceId={workspaceId} />
      </div>

      <nav className="inventory-category-tabs" aria-label="Inventory categories">
        {tabs.map(({ key, label }) => {
          const count = key === 'parts' || key === 'files' ? null : counts[key as keyof typeof counts]
          return (
            <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              <span>{label}</span>{count != null && <strong>{count}</strong>}
            </button>
          )
        })}
      </nav>

      {tab === 'parts' ? (
        <PartsInventory />
      ) : tab === 'files' ? (
        <InvoiceFiles workspaceId={workspaceId} />
      ) : (
        <section className="inventory-list-panel">
          <div className="inventory-list-toolbar">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${tabs.find((entry) => entry.key === tab)?.label.toLowerCase() ?? 'items'}…`}
              aria-label="Search inventory"
            />
            <span>{filtered.length} shown</span>
          </div>

          {message && <p className="inventory-message">{message}</p>}
          {loading && <p className="inventory-empty">Loading inventory…</p>}
          {!loading && filtered.length === 0 && <div className="inventory-empty"><strong>Nothing in this list yet.</strong><span>Add an Item or choose another category.</span></div>}

          <div className="inventory-list">
            {filtered.map((item) => (
              <button key={item.id} type="button" className="inventory-row" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(item.id)}` }}>
                <span className="inventory-row-number">#{item.item_number}</span>
                <span className="inventory-row-main">
                  <strong>{item.title}</strong>
                  <small>{titleCase(item.type)} · {titleCase(item.purpose)}</small>
                </span>
                <span className={`status-pill status-${item.status}`}>{titleCase(item.status)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
