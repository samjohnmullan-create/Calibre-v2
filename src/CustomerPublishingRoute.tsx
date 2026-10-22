import { useEffect, useState } from 'react'
import CustomerPublishingStudio from './CustomerPublishingStudio'
import CustomerEnquiriesRoute from './CustomerEnquiriesRoute'
import EbayListingStudio from './EbayListingStudio'
import './customer-publishing.css'
import './customer-enquiries.css'

function readMode() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'customer' && parts[1] === 'enquiries') return 'enquiries'
  if (parts[0] === 'customer' && parts[1] === 'ebay') return 'ebay'
  return 'publishing'
}

type CustomerMode = 'publishing' | 'ebay' | 'enquiries'

export default function CustomerPublishingRoute() {
  const [mode, setMode] = useState<CustomerMode>(() => readMode())
  const [active, setActive] = useState(() => window.location.hash.replace(/^#\/?/, '').split('/')[0] === 'customer')

  useEffect(() => {
    const sync = () => {
      setMode(readMode())
      setActive(window.location.hash.replace(/^#\/?/, '').split('/')[0] === 'customer')
    }
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return <>
    {active && <nav className="customer-hub-nav" aria-label="Customer workspace">
      <button type="button" className={mode === 'publishing' ? 'active' : ''} onClick={() => { window.location.hash = '#/customer' }}>Publishing</button>
      <button type="button" className={mode === 'ebay' ? 'active' : ''} onClick={() => { window.location.hash = '#/customer/ebay' }}>eBay</button>
      <button type="button" className={mode === 'enquiries' ? 'active' : ''} onClick={() => { window.location.hash = '#/customer/enquiries' }}>Enquiries</button>
    </nav>}
    {mode === 'enquiries' ? <CustomerEnquiriesRoute /> : mode === 'ebay' ? <EbayListingStudio /> : <CustomerPublishingStudio />}
  </>
}
