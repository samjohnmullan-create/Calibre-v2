import { useEffect, useMemo, useState } from 'react'
import App from './App'
import WorkbenchPartsDesk from './WorkbenchPartsDesk'
import CreateItemFlow from './CreateItemFlow'
import InventoryHubRoute from './InventoryHubRoute'
import IntakeRoute from './IntakeRoute'
import ItemWorkspaceRoute from './ItemWorkspaceRoute'
import HomeRoute from './HomeRoute'
import GlobalSearch from './GlobalSearch'
import UniversalNewMenu from './UniversalNewMenu'

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
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    const sync = () => setSection(readSection())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setNewOpen(false)
        setSearchOpen(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setSearchOpen(false)
        setNewOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function navigate(hash: string) {
    setSearchOpen(false)
    setNewOpen(false)
    window.location.hash = hash
  }

  function openSearch() {
    setNewOpen(false)
    setSearchOpen(true)
  }

  function openNew() {
    setSearchOpen(false)
    setNewOpen(true)
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
            <button className="calibre-search-button" type="button" onClick={openSearch} aria-expanded={searchOpen} title="Search Calibre · Ctrl/⌘ K">
              <span aria-hidden="true">⌕</span><span>Search Calibre</span><kbd>⌘K</kbd>
            </button>
            <button className="calibre-new-button" type="button" onClick={openNew} aria-expanded={newOpen} title="New · Ctrl/⌘ N">＋ New</button>
          </div>
        </header>

        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <UniversalNewMenu open={newOpen} onClose={() => setNewOpen(false)} />

        <div className="calibre-content-host">
          <div className="calibre-legacy-host"><App /></div>
          <HomeRoute />
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
        <button type="button" className="mobile-new" onClick={openNew}><span>＋</span><strong>New</strong></button>
        <button type="button" className={section === 'workbench' ? 'active' : ''} onClick={() => navigate('#/workbench')}><span>⌁</span><strong>Work</strong></button>
        <button type="button" className={section === 'intake' || section === 'business' || section === 'calibre' ? 'active' : ''} onClick={() => navigate('#/intake')}><span>•••</span><strong>More</strong></button>
      </nav>
    </div>
  )
}
