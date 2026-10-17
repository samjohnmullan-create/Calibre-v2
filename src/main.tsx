import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CalibreShell from './CalibreShell'
import BenchModeHost from './BenchModeHost'
import ProcedurePreviewHost from './ProcedurePreviewHost'
import CustomerPackHost from './CustomerPackHost'
import CustomerDocumentLinks from './CustomerDocumentLinks'
import CustomerSite, { isCustomerRoute } from './CustomerSite'
import './styles.css'
import './workbench-dex.css'
import './workbench-controls.css'
import './mobile.css'
import './item-editing.css'
import './media.css'
import './passport.css'
import './passport-finder.css'
import './research.css'
import './knowledge.css'
import './parts.css'
import './compatibility.css'
import './create-item.css'
import './inventory-hub.css'
import './invoice-intake.css'
import './purchase-intake.css'
import './storage-manager.css'
import './theme-classic.css'
import './brand-polish.css'
import './shell-layout.css'
import './shell-chrome.css'
import './responsive-cards.css'
import './device-shell'
import './dex-scroll'
import './ux-shell-v2.css'
import './inventory-ux-v2.css'
import './item-workspace-v2.css'
import './item-storage.css'
import './item-sale-panel.css'
import './home-v2.css'
import './global-actions.css'
import './workbench-v2.css'
import './library-v2.css'
import './business-v2.css'
import './business-ledger-v2.css'
import './business-pagination.css'
import './settings-v2.css'
import './audit-history-v2.css'
import './calibre-classic-v2.css'
import './layout-normalizer-v2.css'
import './mobile-acceptance-v2.css'
import './route-acceptance-fixes.css'
import './workbench-command-centre.css'
import './workbench-mobile-phase2.css'
import './bench-mode-host.css'
import './bench-quick-layout.css'
import './safe-removal.css'
import './system-health.css'
import './resource-inventory.css'
import './bench-dex-toolbar.css'
import './bench-mobile-acceptance.css'
import './glass-active-tabs.css'
import './mobile-ui-v3.css'
import './research-click-fix.css'
import './customer-site.css'
import './customer-publishing.css'

function hostname() {
  return window.location.hostname.toLowerCase()
}

function isCustomerHostname() {
  const host = hostname()
  return host === 'calibreco.com.au' || host === 'www.calibreco.com.au'
}

function isWorkshopHostname() {
  return hostname() === 'app.calibreco.com.au'
}

function WorkshopApp() {
  return <><CalibreShell /><BenchModeHost /><ProcedurePreviewHost /><CustomerPackHost /></>
}

function CustomerApp() {
  return <><CustomerSite /><CustomerDocumentLinks /></>
}

function Root() {
  // Production hostnames are authoritative. The workshop host must never be
  // switched into the customer catalogue by a hash route or stale bookmark.
  if (isCustomerHostname()) return <CustomerApp />
  if (isWorkshopHostname()) return <WorkshopApp />

  // Keep customer hash routes available only on non-production preview hosts.
  if (isCustomerRoute()) return <CustomerApp />
  return <WorkshopApp />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
)
