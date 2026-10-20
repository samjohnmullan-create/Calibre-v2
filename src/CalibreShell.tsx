import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import CreateItemFlow from './CreateItemFlow'
import WorkbenchRoute from './WorkbenchRoute'
import CalibreBrandMark from './CalibreBrandMark'
import { useWorkshopSession } from './WorkshopSessionGate'
import './brand-mark-test.css'

const IntakeRoute = lazy(() => import('./IntakeRoute'))
const InventoryHubRoute = lazy(() => import('./InventoryHubRoute'))
const ItemWorkspaceRoute = lazy(() => import('./ItemWorkspaceRoute'))
const BusinessRoute = lazy(() => import('./BusinessRoute'))
const BusinessFinanceRoute = lazy(() => import('./BusinessFinanceRoute'))
const SettingsRoute = lazy(() => import('./SettingsRoute'))
const TimegrapherRoute = lazy(() => import('./TimegrapherRoute'))
const CustomerPublishingRoute = lazy(() => import('./CustomerPublishingRoute'))
const KnowledgePage = lazy(() => import('./KnowledgePage'))
const GlobalSearch = lazy(() => import('./GlobalSearch'))
const UniversalNewMenu = lazy(() => import('./UniversalNewMenu'))

type ShellSection = 'intake' | 'items' | 'workbench' | 'business' | 'timegrapher' | 'calibre' | 'customer' | 'settings' | 'other'

const primaryNav = [
  { key: 'workbench', label: 'Workbench', hash: '#/workbench', icon: '⌁' },
  { key: 'intake', label: 'Intake', hash: '#/intake', icon: '↧' },
  { key: 'items', label: 'Inventory', hash: '#/items', icon: '◫' },
  { key: 'business', label: 'Business', hash: '#/business/finance', icon: '◎' },
] as const

const secondaryNav = [
  { key: 'customer', label: 'Customer', hash: '#/customer', icon: '◉' },
  { key: 'timegrapher', label: 'Timegrapher', hash: '#/timegrapher', icon: '◷' },
  { key: 'calibre', label: 'Library', hash: '#/calibre', icon: '◇' },
  { key: 'settings', label: 'Settings', hash: '#/settings', icon: '⚙' },
] as const

function readSection(): ShellSection {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const first = raw.split('/').filter(Boolean)[0] ?? 'workbench'
  if (first === 'home') return 'workbench'
  if (first === 'work') return 'items'
  if (['intake', 'items', 'workbench', 'business', 'timegrapher', 'calibre', 'customer', 'settings'].includes(first)) return first as ShellSection
  if (first === 'procedures') return 'workbench'
  return 'other'
}

function titleFor(section: ShellSection) {
  if (section === 'items') return 'Inventory'
  if (section === 'calibre') return 'Library'
  if (section === 'customer') return 'Customer Publishing'
  if (section === 'timegrapher') return 'Timegrapher'
  if (section === 'other') return 'Calibre'
  return section.charAt(0).toUpperCase() + section.slice(1)
}

function resetViewport() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.querySelector<HTMLElement>('.calibre-stage')?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  })
}

function RouteLoading({ section }: { section: ShellSection }) {
  return (
    <div className="calibre-route-loading" role="status" aria-live="polite">
      Loading {titleFor(section)}…
    </div>
  )
}

export default function CalibreShell() {
  const initial = useMemo(readSection, [])
  const { signOut, workspace } = useWorkshopSession()
  const [section, setSection] = useState<ShellSection>(initial)
  const [searchOpen, setSearchOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/workbench`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      setSection('workbench')
    }
    const sync = () => {
      const first = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0]
      if (first === 'home') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/workbench`)
        window.dispatchEvent(new HashChangeEvent('hashchange'))
        setSection('workbench')
        setMoreOpen(false)
        resetViewport()
        return
      }
      if (first === 'procedures') {
        window.location.hash = '#/workbench'
        return
      }
      setSection(readSection())
      setMoreOpen(false)
      resetViewport()
    }
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setNewOpen(false)
        setMoreOpen(false)
        setSearchOpen(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setSearchOpen(false)
        setMoreOpen(false)
        setNewOpen(true)
      }
      if (event.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function navigate(hash: string) {
    setSearchOpen(false)
    setNewOpen(false)
    setMoreOpen(false)
    if (window.location.hash === hash) {
      resetViewport()
      return
    }
    window.location.hash = hash
  }

  function openSearch() {
    setNewOpen(false)
    setMoreOpen(false)
    setSearchOpen(true)
  }

  function openNew() {
    setSearchOpen(false)
    setMoreOpen(false)
    setNewOpen(true)
  }

  return (
    <div className="calibre-os" data-shell-section={section}>
      <aside className="calibre-rail" aria-label="Primary navigation">
        <button className="calibre-rail-brand" type="button" onClick={() => navigate('#/workbench')} aria-label="Open Calibre Workbench">
          <span className="calibre-rail-mark" aria-hidden="true"><CalibreBrandMark /></span>
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
          <button type="button" onClick={() => void signOut()} title="Sign out of Calibre">
            <span aria-hidden="true">⇥</span><strong>Sign out</strong>
          </button>
        </div>
      </aside>

      <div className="calibre-stage">
        <header className="calibre-utility-bar">
          <div className="calibre-utility-title">
            <CalibreBrandMark className="calibre-utility-brand-mark" />
            <span className="eyebrow">CALIBRE & CO.</span>
            <strong>{titleFor(section)}</strong>
          </div>
          <div className="calibre-utility-actions">
            {section === 'workbench' && (
              <a className="calibre-new-button" href="https://calibreco.com.au/#/catalogue" target="_blank" rel="noreferrer" title="Open customer-facing catalogue">Catalogue ↗</a>
            )}
            <button className="calibre-search-button" type="button" onClick={openSearch} aria-expanded={searchOpen} aria-label="Search Calibre" title="Search Calibre · Ctrl/⌘ K">
              <span className="calibre-search-icon" aria-hidden="true">⌕</span>
              <span className="calibre-search-label">Search Calibre</span>
              <kbd className="calibre-search-shortcut">⌘K</kbd>
            </button>
            <button className="calibre-new-button" type="button" onClick={openNew} aria-expanded={newOpen} title="New · Ctrl/⌘ N">＋ New</button>
          </div>
        </header>

        {searchOpen && (
          <Suspense fallback={null}>
            <GlobalSearch open onClose={() => setSearchOpen(false)} />
          </Suspense>
        )}
        {newOpen && (
          <Suspense fallback={null}>
            <UniversalNewMenu open onClose={() => setNewOpen(false)} />
          </Suspense>
        )}

        <div className="calibre-content-host">
          {section === 'workbench' && <WorkbenchRoute />}
          {section !== 'workbench' && (
            <Suspense fallback={<RouteLoading section={section} />}>
              {section === 'intake' && <IntakeRoute />}
              {section === 'items' && <><InventoryHubRoute /><ItemWorkspaceRoute /></>}
              {section === 'business' && <><BusinessRoute /><BusinessFinanceRoute /></>}
              {section === 'timegrapher' && <TimegrapherRoute />}
              {section === 'calibre' && <KnowledgePage workspaceId={workspace.id} />}
              {section === 'customer' && <CustomerPublishingRoute />}
              {section === 'settings' && <SettingsRoute />}
            </Suspense>
          )}
          <CreateItemFlow />
        </div>
      </div>

      {moreOpen && (
        <div className="calibre-mobile-more-backdrop" role="presentation" onClick={() => setMoreOpen(false)}>
          <div className="calibre-mobile-more" role="dialog" aria-modal="true" aria-label="More Calibre sections" onClick={(event) => event.stopPropagation()}>
            <div className="calibre-mobile-more-heading"><div><span className="eyebrow">MORE</span><strong>Calibre</strong></div><button type="button" className="secondary small" onClick={() => setMoreOpen(false)}>Close</button></div>
            <button type="button" className={section === 'customer' ? 'active' : ''} onClick={() => navigate('#/customer')}><span>◉</span><div><strong>Customer</strong><small>Catalogue, Passports and Certificates</small></div></button>
            <button type="button" className={section === 'timegrapher' ? 'active' : ''} onClick={() => navigate('#/timegrapher')}><span>◷</span><div><strong>Timegrapher</strong><small>Live microphone timing and calibration</small></div></button>
            <button type="button" className={section === 'intake' ? 'active' : ''} onClick={() => navigate('#/intake')}><span>↧</span><div><strong>Intake</strong><small>Invoices, purchases and incoming records</small></div></button>
            <button type="button" className={section === 'calibre' ? 'active' : ''} onClick={() => navigate('#/calibre')}><span>◇</span><div><strong>Library</strong><small>Movement research and compatibility</small></div></button>
            <button type="button" className={section === 'settings' ? 'active' : ''} onClick={() => navigate('#/settings')}><span>⚙</span><div><strong>Settings</strong><small>Data recovery and system controls</small></div></button>
            <button type="button" onClick={() => void signOut()}><span>⇥</span><div><strong>Sign out</strong><small>End this Calibre session</small></div></button>
          </div>
        </div>
      )}

      <nav className="calibre-mobile-nav" aria-label="Mobile navigation">
        <button type="button" className={section === 'workbench' ? 'active' : ''} onClick={() => navigate('#/workbench')}><span>⌁</span><strong>Work</strong></button>
        <button type="button" className={section === 'items' ? 'active' : ''} onClick={() => navigate('#/items')}><span>◫</span><strong>Items</strong></button>
        <button type="button" className="mobile-new" onClick={openNew}><span>＋</span><strong>New</strong></button>
        <button type="button" className={section === 'business' ? 'active' : ''} onClick={() => navigate('#/business/finance')}><span>◎</span><strong>Business</strong></button>
        <button type="button" className={section === 'intake' || section === 'timegrapher' || section === 'calibre' || section === 'customer' || section === 'settings' || moreOpen ? 'active' : ''} onClick={() => { setSearchOpen(false); setNewOpen(false); setMoreOpen((value) => !value) }} aria-expanded={moreOpen}><span>•••</span><strong>More</strong></button>
      </nav>
    </div>
  )
}
