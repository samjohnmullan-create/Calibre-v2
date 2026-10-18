import { useEffect, useState } from 'react'
import CustomerPublishingStudio from './CustomerPublishingStudio'
import CustomerEnquiriesRoute from './CustomerEnquiriesRoute'

function readMode() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return parts[0] === 'customer' && parts[1] === 'enquiries' ? 'enquiries' : 'publishing'
}

export default function CustomerPublishingRoute() {
  const [mode, setMode] = useState<'publishing' | 'enquiries'>(() => readMode())

  useEffect(() => {
    const sync = () => setMode(readMode())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return <>
    <nav className="customer-hub-nav" aria-label="Customer workspace">
      <button type="button" className={mode === 'publishing' ? 'active' : ''} onClick={() => { window.location.hash = '#/customer' }}>Publishing</button>
      <button type="button" className={mode === 'enquiries' ? 'active' : ''} onClick={() => { window.location.hash = '#/customer/enquiries' }}>Enquiries</button>
    </nav>
    {mode === 'enquiries' ? <CustomerEnquiriesRoute /> : <CustomerPublishingStudio />}
  </>
}
