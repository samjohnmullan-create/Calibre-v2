import { lazy, Suspense, useEffect, useState } from 'react'
import CalibreShell from './CalibreShell'
import BenchModeHost from './BenchModeHost'
import CustomerEnquiryAttention from './CustomerEnquiryAttention'
import WorkshopSessionGate from './WorkshopSessionGate'
import './workshop-shell.css'
import './device-shell'
import './dex-scroll'

const ProcedurePreviewHost = lazy(() => import('./ProcedurePreviewHost'))
const CustomerPackHost = lazy(() => import('./CustomerPackHost'))

type AuxiliaryRoute = 'customer' | 'customer-pack' | 'procedures' | 'other'

function readAuxiliaryRoute(): AuxiliaryRoute {
  const first = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0] ?? ''
  if (first === 'customer' || first === 'customer-pack' || first === 'procedures') return first
  return 'other'
}

function AuxiliaryHosts() {
  const [route, setRoute] = useState<AuxiliaryRoute>(readAuxiliaryRoute)

  useEffect(() => {
    const sync = () => setRoute(readAuxiliaryRoute())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const showCustomerPack = route === 'customer' || route === 'customer-pack'
  const showProcedurePreview = route === 'procedures'
  if (!showCustomerPack && !showProcedurePreview) return null

  return (
    <Suspense fallback={null}>
      {showCustomerPack && <CustomerPackHost />}
      {showProcedurePreview && <ProcedurePreviewHost />}
    </Suspense>
  )
}

export default function WorkshopEntry() {
  return (
    <WorkshopSessionGate>
      <CalibreShell />
      <BenchModeHost />
      <AuxiliaryHosts />
      <CustomerEnquiryAttention />
    </WorkshopSessionGate>
  )
}
