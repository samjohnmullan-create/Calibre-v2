import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import InvoiceIntakeServer from './InvoiceIntakeServer'

type IntakeTab = 'inbox' | 'review' | 'completed'

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

  return (
    <main className="intake-page">
      <header className="intake-heading">
        <div>
          <p className="eyebrow">INTAKE</p>
          <h1>Incoming</h1>
          <p className="muted">Turn purchases and incoming documents into clean Calibre records before they enter Inventory.</p>
        </div>
      </header>

      <nav className="intake-tabs" aria-label="Intake views">
        <button type="button" className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>Inbox</button>
        <button type="button" className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Ready to Review</button>
        <button type="button" className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>Completed</button>
        <button type="button" disabled title="Purchase intake is coming next">Purchases</button>
      </nav>

      {message && <p className="intake-message">{message}</p>}
      {workspaceId && <InvoiceIntakeServer workspaceId={workspaceId} queue={tab} />}
    </main>
  )
}
