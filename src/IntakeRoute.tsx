import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import InvoiceIntakeServer from './InvoiceIntakeServer'
import PurchaseIntake from './PurchaseIntake'

type IntakeTab = 'inbox' | 'review' | 'purchases' | 'completed'
type InvoiceQueue = Exclude<IntakeTab, 'purchases'>

function isIntakeRoute() {
  return window.location.hash.replace(/\/$/, '') === '#/intake'
}

export default function IntakeRoute() {
  const [active, setActive] = useState(isIntakeRoute)
  const [workspaceId, setWorkspaceId] = useState('')
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<IntakeTab>('inbox')

  useEffect(() => {
    const sync = () => setActive(isIntakeRoute())
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const result = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (cancelled) return
      if (result.error || !result.data) {
        setMessage(`Intake unavailable: ${result.error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(result.data.id)
      setMessage('')
    })()
    return () => { cancelled = true }
  }, [active])

  if (!active) return null

  const heading = tab === 'purchases' ? 'Purchases & receiving' : tab === 'completed' ? 'Completed intake' : 'Incoming'
  const description = tab === 'purchases'
    ? 'Track every acquisition from Purchase to Lot to physical stock. Completed invoice imports are handed into this queue automatically.'
    : tab === 'completed'
      ? 'Read-only source-document history. Imported invoices remain preserved here after their operational Purchase/Lot records are created.'
      : 'Upload and review source documents before anything becomes operational stock.'

  return (
    <main className="intake-page">
      <header className="intake-heading">
        <div>
          <p className="eyebrow">INTAKE</p>
          <h1>{heading}</h1>
          <p className="muted">{description}</p>
        </div>
      </header>

      <nav className="intake-tabs" aria-label="Intake views">
        <button type="button" className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>Inbox</button>
        <button type="button" className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Ready to Review</button>
        <button type="button" className={tab === 'purchases' ? 'active' : ''} onClick={() => setTab('purchases')}>Purchases & Receiving</button>
        <button type="button" className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>Completed Documents</button>
      </nav>

      {message && <p className="intake-message">{message}</p>}
      {workspaceId && tab === 'purchases' && <PurchaseIntake workspaceId={workspaceId} />}
      {workspaceId && tab !== 'purchases' && <InvoiceIntakeServer workspaceId={workspaceId} queue={tab as InvoiceQueue} />}
    </main>
  )
}
