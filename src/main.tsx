import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'

const CustomerEntry = lazy(() => import('./CustomerEntry'))
const WorkshopEntry = lazy(() => import('./WorkshopEntry'))

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

function isCustomerHashRoute() {
  const first = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0]
  return ['home', 'catalogue', 'sold', 'passport', 'certificate'].includes(first)
}

function Root() {
  // Production hostnames are authoritative. Customer visitors should never
  // download the workshop bundle just because both products share a repo.
  if (isCustomerHostname()) return <CustomerEntry />
  if (isWorkshopHostname()) return <WorkshopEntry />

  // Preserve customer previews on non-production hosts without pulling the
  // workshop bundle into the public site.
  if (isCustomerHashRoute()) return <CustomerEntry />
  return <WorkshopEntry />
}

function LoadingShell() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#172026', color: '#d3d9d4', fontFamily: 'system-ui,sans-serif' }}>Opening Calibre…</div>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Suspense fallback={<LoadingShell />}><Root /></Suspense></StrictMode>,
)
