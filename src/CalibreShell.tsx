import { useEffect, useMemo, useState } from 'react'
import App from './App'
import WorkbenchPartsDesk from './WorkbenchPartsDesk'
import CreateItemFlow from './CreateItemFlow'
import InventoryHubRoute from './InventoryHubRoute'
import IntakeRoute from './IntakeRoute'
import ItemWorkspaceRoute from './ItemWorkspaceRoute'

type ShellSection = 'home' | 'intake' | 'items' | 'workbench' | 'business' | 'calibre' | 'other'

const primaryNav = [
  { key: 'home', label: 'Home', hash: '#/home', icon: '⌂' },
  { key: 'intake', label: 'Intake', hash: '#/intake', icon: '↧' },
  { key: 'items', label: 'Inventory', hash: '#/items', icon: '◫' },
  { key: 'workbench', label: 'Workbench', hash: '#/workbench', icon: '⌁' },
  { key: 'business', label: 'Business', hash: '#/business', icon: '◎' },
] as const

const secondaryNav = [
  { key: 'calibre', label: 'Library', hash: '#/calibre', icon: '◇' },
] as const

function readSection(): ShellSection {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const first = raw.split('/').filter(Boolean)[0] ?? 'items'
  if (first === 'work') return 'items'
  if (['home', 'intake', 'items', 'workbench', 'business', 'calibre'].includes(first)) return first as ShellSection
  return 'other'
}

function titleFor(section: ShellSection) {
  if (section === 'items') return 'Inventory'
  if (section === 'calibre') return 'Library'
  if (section === 'other') return 'Calibre'
  return section.charAt(0).toUpperCase() + section.slice(1)
}

export default function CalibreShell() {
  const initial = useMemo(readSection, [])
  const [section, setSection] = useState<ShellSection>(initial)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const sync = () => setSection(readSection())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  function navigate(hash: string) {
    window.location.hash = hash
  }

  function startNewItem() {
    const target = document.querySelector<HTMLButtonElement>('button[aria-label="Create item"]')
    if (target) {
      target.click()
      return
    }
    window.location.hash = '#/items'
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('button[aria-label="Create item"]')?.click(), 60)
  }

  return (
    <div className="calibre-os" data-shell-section={section}>
      <aside className="calibre-rail" aria-label="Primary navigation">
        <button className="calibre-rail-brand" type="button" onClick={() => navigate('#/home')} aria-label="Calibre home">
          <span className="calibre-rail-mark" aria-hidden="true"><span className="calibre-rail-moon" /><span className="calibre-rail-star">✦</span></span>
          <span className="calibre-rail-brand-copy"><strong>Calibre</strong><small>& Co.</small></span>
        </button>

        <nav className="calibre-rail-nav">
          {primaryNav.map((entry) => (
            <button key={entry.key} type="button" className={section === entry.key ? 'active' : ''} onClick={() => navigate(entry.hash)}>
              <span aria-hidden="true">{entry.icon}</span><strong>{entry.label}</strong>
            </button>
          ))}
        </nav>

        <div className="calibre-rail-secondary">
          {secondaryNav.map((entry) => (
            <button key={entry.key} type="button" className={section === entry.key ? 'active' : ''} onClick={() => navigate(entry.hash)}>
              <span aria-hidden="true">{entry.icon}</span><strong>{entry.label}</strong>
            </button>
          ))}
          <button type="button" disabled title="Settings workspace is coming next"><span aria-hidden="true">⚙</span><strong>Settings</strong></button>
        </div>
      </aside>

      <div className="calibre-stage">
        <header className="calibre-utility-bar">
          <div className="calibre-utility-title">
            <span className="eyebrow">CALIBRE & CO.</span>
            <strong>{titleFor(section)}</strong>
          </div>
          <div className="calibre-utility-actions">
            <button className="calibre-search-button" type="button" onClick={() => setSearchOpen((value) => !value)} aria-expanded={searchOpen}>
              <span aria-hidden="true">⌕</span><span>Search Calibre</span>
            </button>
            <button className="calibre-new-button" type="button" onClick={startNewItem}>＋ New Item</button>
          </div>
        </header>

        {searchOpen && (
          <div className="calibre-search-preview" role="dialog" aria-label="Global search preview">
            <div>
              <p className="eyebrow">GLOBAL SEARCH</p>
              <h2>One search for all of Calibre</h2>
              <p className="muted">Item numbers, makers, movements, Work records, parts, invoices and knowledge will live here. The shell is in place; indexed search is the next implementation step.</p>
            </div>
            <button className="secondary small" type="button" onClick={() => setSearchOpen(false)}>Close</button>
          </div>
        )}

        <div className="calibre-content-host">
          <div className="calibre-legacy-host"><App /></div>
          <IntakeRoute />
          <InventoryHubRoute />
          <ItemWorkspaceRoute />
          <WorkbenchPartsDesk />
          <CreateItemFlow />
        </div>
      </div>

      <nav className="calibre-mobile-nav" aria-label="Mobile navigation">
        <button type="button" className={section === 'home' ? 'active' : ''} onClick={() => navigate('#/home')}><span>⌂</span><strong>Home</strong></button>
        <button type="button" className={section === 'items' ? 'active' : ''} onClick={() => navigate('#/items')}><span>◫</span><strong>Items</strong></button>
        <button type="button" className="mobile-new" onClick={startNewItem}><span>＋</span><strong>New</strong></button>
        <button type="button" className={section === 'workbench' ? 'active' : ''} onClick={() => navigate('#/workbench')}><span>⌁</span><strong>Work</strong></button>
        <button type="button" className={section === 'intake' || section === 'business' || section === 'calibre' ? 'active' : ''} onClick={() => navigate('#/intake')}><span>•••</span><strong>More</strong></button>
      </nav>
    </div>
  )
}
