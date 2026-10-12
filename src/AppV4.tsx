import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import ItemMedia from './ItemMedia'

type Workspace = { id: string; name: string; slug: string; owner_id: string }
type Item = { id: string; item_number: number; type: string; purpose: string; status: string; title: string; notes: string; created_at: string }
type Identity = { maker: string; model: string; reference: string; serial: string; year_from: number | null; year_to: number | null; era: string; country: string; materials: string; dimensions_text: string; dial_markings: string; case_markings: string; movement_markings: string; notes: string }
type WorkStatus = 'queued' | 'ready' | 'on_bench' | 'waiting' | 'qc' | 'complete' | 'cancelled'
type WaitingReason = 'parts' | 'research' | 'external_service' | 'customer' | 'tool_equipment' | 'other'
type WorkRecord = {
  id: string
  item_id: string
  work_number: number
  type: string
  title: string
  status: WorkStatus
  waiting_reason: WaitingReason | null
  priority: number
  next_action: string
  blocker: string
  diagnosis: string
  notes: string
}
type Valuation = { low_value: number | null; expected_value: number | null; high_value: number | null; target_value: number | null; minimum_value: number | null; currency: string; confidence: string; basis: string }
type CostEntry = { category: string; amount: number; currency: string; notes: string }
type DetailData = { identity: Identity | null; work: WorkRecord[]; valuation: Valuation | null; costs: CostEntry[] }
type Section = 'home' | 'items' | 'workbench' | 'business' | 'calibre'
type ItemTab = 'work' | 'item' | 'commerce'
type WorkLane = { status: WorkStatus; label: string; hint: string }
type WorkDetailsPatch = Pick<WorkRecord, 'priority' | 'next_action' | 'waiting_reason' | 'blocker'>
type ItemPatch = Pick<Item, 'title' | 'status' | 'purpose' | 'notes'>
type IdentityPatch = Pick<Identity, 'maker' | 'model' | 'reference' | 'serial' | 'era' | 'country' | 'materials' | 'dimensions_text' | 'dial_markings' | 'case_markings' | 'movement_markings' | 'notes'>

const emptyDetail: DetailData = { identity: null, work: [], valuation: null, costs: [] }
const workLanes: WorkLane[] = [
  { status: 'queued', label: 'Queue', hint: 'Captured, not yet scheduled' },
  { status: 'ready', label: 'Ready', hint: 'Ready to be picked up' },
  { status: 'on_bench', label: 'On bench', hint: 'Actively being worked' },
  { status: 'waiting', label: 'Waiting', hint: 'Blocked or awaiting parts' },
  { status: 'qc', label: 'QC', hint: 'Final checks and validation' },
  { status: 'complete', label: 'Complete', hint: 'Work finished' },
]
const waitingReasons: { value: WaitingReason; label: string }[] = [
  { value: 'parts', label: 'Parts' },
  { value: 'research', label: 'Research' },
  { value: 'external_service', label: 'External service' },
  { value: 'customer', label: 'Customer' },
  { value: 'tool_equipment', label: 'Tool / equipment' },
  { value: 'other', label: 'Other' },
]
const itemStatuses = ['acquired', 'researching', 'preparing', 'ready_for_sale', 'listed', 'sold', 'archived']
const itemPurposes = ['resale', 'collection', 'repair', 'donor', 'client', 'reference', 'other']

function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function workStatusLabel(status: WorkStatus) {
  return workLanes.find((lane) => lane.status === status)?.label ?? titleCase(status)
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [message, setMessage] = useState('Checking session…')
  const [busy, setBusy] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [connection, setConnection] = useState<'checking' | 'ok' | 'error'>('checking')
  const [section, setSection] = useState<Section>('items')
  const [items, setItems] = useState<Item[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailData>(emptyDetail)
  const [detailLoading, setDetailLoading] = useState(false)
  const [itemTab, setItemTab] = useState<ItemTab>('work')
  const [allWork, setAllWork] = useState<WorkRecord[]>([])
  const [workLoading, setWorkLoading] = useState(false)
  const [savingWorkId, setSavingWorkId] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)

  const selectedItem = items.find((item) => item.id === selectedId) ?? null
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message)
      setSession(data.session)
      setMessage(data.session ? 'Signed in.' : 'Ready to sign in.')
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setWorkspace(null)
      setConnection('checking')
      return
    }
    let active = true
    ;(async () => {
      setConnection('checking')
      const { data, error } = await supabase.from('workspaces').select('id,name,slug,owner_id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active) return
      if (error) {
        setConnection('error')
        setMessage(`Database connection failed: ${error.message}`)
        return
      }
      if (data && data.owner_id === session.user.id) {
        const { data: membership, error: membershipReadError } = await supabase.from('workspace_members').select('workspace_id,user_id,role').eq('workspace_id', data.id).eq('user_id', session.user.id).maybeSingle()
        if (!active) return
        if (membershipReadError) {
          setConnection('error')
          setMessage(`Membership check failed: ${membershipReadError.message}`)
          return
        }
        if (!membership) {
          const { error: repairError } = await supabase.from('workspace_members').insert({ workspace_id: data.id, user_id: session.user.id, role: 'owner' })
          if (!active) return
          if (repairError) {
            setConnection('error')
            setMessage(`Owner membership repair failed: ${repairError.message}`)
            return
          }
        }
      }
      setWorkspace(data)
      setConnection('ok')
      setMessage(data ? 'Calibre v2 is connected.' : 'Connected. Workspace setup is ready.')
    })()
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!workspace) return
    let active = true
    ;(async () => {
      setItemsLoading(true)
      const { data, error } = await supabase.from('items').select('id,item_number,type,purpose,status,title,notes,created_at').eq('workspace_id', workspace.id).is('archived_at', null).order('item_number', { ascending: false })
      if (!active) return
      setItemsLoading(false)
      if (error) {
        setMessage(`Items failed to load: ${error.message}`)
        return
      }
      const nextItems = (data ?? []) as Item[]
      setItems(nextItems)
      if (!selectedId && nextItems.length > 0) setSelectedId(nextItems[0].id)
    })()
    return () => { active = false }
  }, [workspace, selectedId])

  useEffect(() => {
    if (!workspace) return
    let active = true
    ;(async () => {
      setWorkLoading(true)
      const { data, error } = await supabase.from('work_records')
        .select('id,item_id,work_number,type,title,status,waiting_reason,priority,next_action,blocker,diagnosis,notes')
        .eq('workspace_id', workspace.id)
        .order('priority', { ascending: false })
        .order('work_number', { ascending: true })
      if (!active) return
      setWorkLoading(false)
      if (error) {
        setMessage(`Workbench failed to load: ${error.message}`)
        return
      }
      setAllWork((data ?? []) as WorkRecord[])
    })()
    return () => { active = false }
  }, [workspace])

  useEffect(() => {
    if (!workspace || !selectedId) {
      setDetail(emptyDetail)
      return
    }
    let active = true
    ;(async () => {
      setDetailLoading(true)
      const [identityResult, workResult, valuationResult, costsResult] = await Promise.all([
        supabase.from('item_identity').select('maker,model,reference,serial,year_from,year_to,era,country,materials,dimensions_text,dial_markings,case_markings,movement_markings,notes').eq('workspace_id', workspace.id).eq('item_id', selectedId).maybeSingle(),
        supabase.from('work_records').select('id,item_id,work_number,type,title,status,waiting_reason,priority,next_action,blocker,diagnosis,notes').eq('workspace_id', workspace.id).eq('item_id', selectedId).order('work_number', { ascending: false }),
        supabase.from('valuations').select('low_value,expected_value,high_value,target_value,minimum_value,currency,confidence,basis').eq('workspace_id', workspace.id).eq('item_id', selectedId).order('valued_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('cost_entries').select('category,amount,currency,notes').eq('workspace_id', workspace.id).eq('item_id', selectedId).order('incurred_at', { ascending: false }),
      ])
      if (!active) return
      setDetailLoading(false)
      const error = identityResult.error ?? workResult.error ?? valuationResult.error ?? costsResult.error
      if (error) {
        setMessage(`Item detail failed to load: ${error.message}`)
        return
      }
      setDetail({ identity: identityResult.data as Identity | null, work: (workResult.data ?? []) as WorkRecord[], valuation: valuationResult.data as Valuation | null, costs: (costsResult.data ?? []) as CostEntry[] })
    })()
    return () => { active = false }
  }, [workspace, selectedId])

  async function sendOtp(event: FormEvent) {
    event.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setMessage('Sending verification code…')
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setOtpSent(true)
    setMessage('Check your email for the 8-digit Calibre code.')
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault()
    const token = otp.replace(/\D/g, '').slice(0, 8)
    if (!email.trim() || token.length !== 8) {
      setMessage('Enter the 8-digit code from your email.')
      return
    }
    setBusy(true)
    setMessage('Verifying code…')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setOtp('')
    setOtpSent(false)
    setMessage('Signed in.')
  }

  async function initializeWorkspace() {
    if (!session?.user) return
    setBusy(true)
    setMessage('Creating Calibre workspace…')
    const { data: created, error: workspaceError } = await supabase.from('workspaces').insert({ owner_id: session.user.id, name: 'Calibre & Co.', slug: 'calibre-co' }).select('id,name,slug,owner_id').single()
    if (workspaceError || !created) {
      setBusy(false)
      setMessage(workspaceError?.message ?? 'Workspace creation failed.')
      return
    }
    const { error: memberError } = await supabase.from('workspace_members').insert({ workspace_id: created.id, user_id: session.user.id, role: 'owner' })
    setBusy(false)
    setWorkspace(created)
    setConnection('ok')
    setMessage(memberError ? `Workspace created; membership retry needed: ${memberError.message}` : 'Calibre & Co. workspace initialized.')
  }

  async function signOut() {
    setBusy(true)
    const { error } = await supabase.auth.signOut()
    setBusy(false)
    setOtp('')
    setOtpSent(false)
    setMessage(error ? error.message : 'Signed out.')
  }

  function replaceWorkRecord(updated: WorkRecord) {
    setAllWork((current) => current.map((record) => record.id === updated.id ? updated : record))
    setDetail((current) => ({ ...current, work: current.work.map((record) => record.id === updated.id ? updated : record) }))
  }

  async function updateWorkStatus(work: WorkRecord, status: WorkStatus) {
    if (!workspace || status === work.status) return
    setSavingWorkId(work.id)
    const patch = status === 'waiting' ? { status } : { status, waiting_reason: null }
    const { data, error } = await supabase.from('work_records')
      .update(patch)
      .eq('workspace_id', workspace.id)
      .eq('id', work.id)
      .select('id,item_id,work_number,type,title,status,waiting_reason,priority,next_action,blocker,diagnosis,notes')
      .single()
    setSavingWorkId(null)
    if (error || !data) {
      setMessage(`Could not move Work #${work.work_number}: ${error?.message ?? 'No record returned.'}`)
      return
    }
    replaceWorkRecord(data as WorkRecord)
    setMessage(`Work #${work.work_number} moved to ${workStatusLabel(status)}.`)
  }

  async function updateWorkDetails(work: WorkRecord, patch: WorkDetailsPatch) {
    if (!workspace) return false
    setSavingWorkId(work.id)
    const { data, error } = await supabase.from('work_records')
      .update(patch)
      .eq('workspace_id', workspace.id)
      .eq('id', work.id)
      .select('id,item_id,work_number,type,title,status,waiting_reason,priority,next_action,blocker,diagnosis,notes')
      .single()
    setSavingWorkId(null)
    if (error || !data) {
      setMessage(`Could not update Work #${work.work_number}: ${error?.message ?? 'No record returned.'}`)
      return false
    }
    replaceWorkRecord(data as WorkRecord)
    setMessage(`Work #${work.work_number} updated.`)
    return true
  }

  async function updateItemDetails(item: Item, itemPatch: ItemPatch, identityPatch: IdentityPatch) {
    if (!workspace) return false
    setSavingItemId(item.id)

    const { data: updatedItem, error: itemError } = await supabase.from('items')
      .update(itemPatch)
      .eq('workspace_id', workspace.id)
      .eq('id', item.id)
      .select('id,item_number,type,purpose,status,title,notes,created_at')
      .single()

    if (itemError || !updatedItem) {
      setSavingItemId(null)
      setMessage(`Could not update Item #${item.item_number}: ${itemError?.message ?? 'No item returned.'}`)
      return false
    }

    let identityResult
    if (detail.identity) {
      identityResult = await supabase.from('item_identity')
        .update(identityPatch)
        .eq('workspace_id', workspace.id)
        .eq('item_id', item.id)
        .select('maker,model,reference,serial,year_from,year_to,era,country,materials,dimensions_text,dial_markings,case_markings,movement_markings,notes')
        .single()
    } else {
      identityResult = await supabase.from('item_identity')
        .insert({ workspace_id: workspace.id, item_id: item.id, ...identityPatch })
        .select('maker,model,reference,serial,year_from,year_to,era,country,materials,dimensions_text,dial_markings,case_markings,movement_markings,notes')
        .single()
    }

    setSavingItemId(null)
    if (identityResult.error || !identityResult.data) {
      setItems((current) => current.map((record) => record.id === item.id ? updatedItem as Item : record))
      setMessage(`Item saved, but identity details failed: ${identityResult.error?.message ?? 'No identity returned.'}`)
      return false
    }

    setItems((current) => current.map((record) => record.id === item.id ? updatedItem as Item : record))
    setDetail((current) => ({ ...current, identity: identityResult.data as Identity }))
    setMessage(`Item #${item.item_number} updated.`)
    return true
  }

  function openWorkItem(work: WorkRecord) {
    setSelectedId(work.item_id)
    setItemTab('work')
    setSection('items')
  }

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-brand">
          <BrandMark />
          <p className="eyebrow">CALIBRE & CO.</p>
          <h1>Workshop intelligence.</h1>
          <p className="lead">One place for the object, the work, the evidence and the sale.</p>
        </section>
        <section className="login-panel">
          {!otpSent ? (
            <form className="auth-card" onSubmit={sendOtp}>
              <div><p className="eyebrow">SECURE ACCESS</p><h2>Sign in to Calibre</h2><p className="muted">We’ll email you an 8-digit verification code.</p></div>
              <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
              <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send verification code'}</button>
              <p className="message">{message}</p>
            </form>
          ) : (
            <form className="auth-card" onSubmit={verifyOtp}>
              <div><p className="eyebrow">CHECK YOUR EMAIL</p><h2>Enter your code</h2><p className="muted">We sent an 8-digit code to {email}.</p></div>
              <label>Verification code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="12345678" required /></label>
              <button type="submit" disabled={busy || otp.length !== 8}>{busy ? 'Verifying…' : 'Verify and sign in'}</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => { setOtpSent(false); setOtp(''); setMessage('Ready to send a new code.') }}>Use a different email</button>
              <p className="message">{message}</p>
            </form>
          )}
        </section>
      </main>
    )
  }

  if (!workspace) {
    return (
      <main className="setup-shell">
        <BrandMark />
        <p className="eyebrow">CALIBRE & CO.</p>
        <h2>Workspace setup</h2>
        <p className="muted">{message}</p>
        {connection === 'ok' && <button onClick={initializeWorkspace} disabled={busy}>{busy ? 'Creating…' : 'Initialize Calibre & Co.'}</button>}
        <button className="secondary" onClick={signOut}>Sign out</button>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => setSection('home')} aria-label="Calibre home"><BrandMark compact /><span>Calibre & Co.</span></button>
        <nav className="topnav" aria-label="Main navigation">
          {(['home', 'items', 'workbench', 'business', 'calibre'] as Section[]).map((key) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>{titleCase(key)}</button>)}
        </nav>
        <button className="profile-chip" onClick={signOut} title="Sign out">SM</button>
      </header>

      {section === 'items' && (
        <main className="items-layout">
          <aside className="items-pane">
            <div className="pane-heading"><div><p className="eyebrow">INVENTORY</p><h2>Items</h2></div><span className="count-chip">{items.length}</span></div>
            <div className="items-tools"><input className="search" placeholder="Search items" aria-label="Search items" /><button className="icon-button" title="Create item" aria-label="Create item">＋</button></div>
            <div className="item-list">
              {itemsLoading && <p className="empty-state">Loading items…</p>}
              {!itemsLoading && items.length === 0 && <p className="empty-state">No items yet.</p>}
              {items.map((item) => (
                <button key={item.id} className={`item-row ${selectedId === item.id ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); setItemTab('work') }}>
                  <div className="item-number">#{item.item_number}</div>
                  <div className="item-row-main"><strong>{item.title}</strong><span>{titleCase(item.type)} · {titleCase(item.purpose)}</span></div>
                  <StatusPill value={item.status} />
                </button>
              ))}
            </div>
          </aside>

          <section className="item-workspace">
            {!selectedItem ? (
              <div className="empty-detail"><p className="eyebrow">ITEM WORKSPACE</p><h2>Select an item</h2><p className="muted">Identity, work and commerce stay attached to one physical object.</p></div>
            ) : (
              <>
                <div className="item-header">
                  <div><div className="item-kicker"><span>Item #{selectedItem.item_number}</span><StatusPill value={selectedItem.status} /></div><h1>{selectedItem.title}</h1><p className="subtitle">{detail.identity?.maker || titleCase(selectedItem.type)}{detail.identity?.era ? ` · ${detail.identity.era}` : ''}</p></div>
                  <div className="header-actions"><button className="secondary small" onClick={() => setItemTab('item')}>Edit item</button></div>
                </div>
                <div className="item-tabs" role="tablist">{(['work', 'item', 'commerce'] as ItemTab[]).map((tab) => <button key={tab} className={itemTab === tab ? 'active' : ''} onClick={() => setItemTab(tab)}>{titleCase(tab)}</button>)}</div>
                {detailLoading ? <div className="loading-card">Loading item…</div> : <div className="tab-content">{itemTab === 'work' && <WorkTab work={detail.work} />}{itemTab === 'item' && <ItemTabView item={selectedItem} identity={detail.identity} workspaceId={workspace.id} saving={savingItemId === selectedItem.id} onSave={updateItemDetails} />}{itemTab === 'commerce' && <CommerceTab valuation={detail.valuation} costs={detail.costs} />}</div>}
              </>
            )}
          </section>
        </main>
      )}

      {section === 'workbench' && (
        <Workbench work={allWork} itemsById={itemsById} loading={workLoading} savingWorkId={savingWorkId} onStatusChange={updateWorkStatus} onSaveDetails={updateWorkDetails} onOpenItem={openWorkItem} />
      )}

      {!['items', 'workbench'].includes(section) && (
        <main className="placeholder-page">
          <p className="eyebrow">{titleCase(section)}</p>
          <h2>{section === 'home' ? 'Calibre v2' : `${titleCase(section)} is next.`}</h2>
          <p className="muted">The operating system is being built around one object lifecycle: acquisition, identity, work, commerce and permanent history.</p>
          <button onClick={() => setSection('items')}>Open Items</button>
        </main>
      )}
    </div>
  )
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`mark ${compact ? 'compact' : ''}`} aria-hidden="true"><span className="moon" /><span className="star">✦</span></span>
}

function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill status-${value}`}>{value === 'queued' ? 'Queue' : titleCase(value)}</span>
}

function Workbench({ work, itemsById, loading, savingWorkId, onStatusChange, onSaveDetails, onOpenItem }: {
  work: WorkRecord[]
  itemsById: Map<string, Item>
  loading: boolean
  savingWorkId: string | null
  onStatusChange: (work: WorkRecord, status: WorkStatus) => void
  onSaveDetails: (work: WorkRecord, patch: WorkDetailsPatch) => Promise<boolean>
  onOpenItem: (work: WorkRecord) => void
}) {
  const activeCount = work.filter((record) => !['complete', 'cancelled'].includes(record.status)).length
  const cancelled = work.filter((record) => record.status === 'cancelled')

  return (
    <main className="workbench-page">
      <div className="workbench-heading">
        <div><p className="eyebrow">WORKFLOW</p><h1>Workbench</h1><p className="muted">{activeCount} active work {activeCount === 1 ? 'record' : 'records'} · move work as the job progresses.</p></div>
      </div>
      {loading ? <div className="loading-card">Loading workbench…</div> : (
        <div className="workbench-board">
          {workLanes.map((lane) => {
            const laneWork = work.filter((record) => record.status === lane.status)
            return (
              <section className="work-lane" key={lane.status}>
                <div className="work-lane-heading"><div><h3>{lane.label}</h3><p>{lane.hint}</p></div><span className="count-chip">{laneWork.length}</span></div>
                <div className="work-lane-list">
                  {laneWork.length === 0 && <div className="lane-empty">Nothing here</div>}
                  {laneWork.map((record) => <WorkbenchCard key={record.id} record={record} item={itemsById.get(record.item_id)} saving={savingWorkId === record.id} onStatusChange={onStatusChange} onSaveDetails={onSaveDetails} onOpenItem={onOpenItem} />)}
                </div>
              </section>
            )
          })}
          {cancelled.length > 0 && (
            <section className="work-lane cancelled-lane">
              <div className="work-lane-heading"><div><h3>Cancelled</h3><p>Closed without completion</p></div><span className="count-chip">{cancelled.length}</span></div>
              <div className="work-lane-list">{cancelled.map((record) => <WorkbenchCard key={record.id} record={record} item={itemsById.get(record.item_id)} saving={savingWorkId === record.id} onStatusChange={onStatusChange} onSaveDetails={onSaveDetails} onOpenItem={onOpenItem} />)}</div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

function WorkbenchCard({ record, item, saving, onStatusChange, onSaveDetails, onOpenItem }: {
  record: WorkRecord
  item?: Item
  saving: boolean
  onStatusChange: (work: WorkRecord, status: WorkStatus) => void
  onSaveDetails: (work: WorkRecord, patch: WorkDetailsPatch) => Promise<boolean>
  onOpenItem: (work: WorkRecord) => void
}) {
  const [editing, setEditing] = useState(false)
  const [priority, setPriority] = useState(record.priority)
  const [nextAction, setNextAction] = useState(record.next_action)
  const [waitingReason, setWaitingReason] = useState<WaitingReason | ''>(record.waiting_reason ?? '')
  const [blocker, setBlocker] = useState(record.blocker)

  useEffect(() => {
    if (editing) return
    setPriority(record.priority)
    setNextAction(record.next_action)
    setWaitingReason(record.waiting_reason ?? '')
    setBlocker(record.blocker)
  }, [record, editing])

  async function save() {
    const ok = await onSaveDetails(record, {
      priority,
      next_action: nextAction.trim(),
      waiting_reason: record.status === 'waiting' ? (waitingReason || null) : null,
      blocker: blocker.trim(),
    })
    if (ok) setEditing(false)
  }

  return (
    <article className={`work-card ${record.blocker ? 'has-blocker' : ''}`}>
      <div className="work-card-top"><span>Work #{record.work_number}</span><span className="priority-chip">P{record.priority}</span></div>
      <button className="work-card-title" onClick={() => onOpenItem(record)}>{item?.title || record.title}</button>
      <p className="work-card-subtitle">{record.title}</p>
      <div className="work-next"><span>Next action</span><strong>{record.next_action || 'No next action set'}</strong></div>
      {record.status === 'waiting' && <div className="work-blocker-summary"><span>{record.waiting_reason ? titleCase(record.waiting_reason) : 'Waiting'}</span><strong>{record.blocker || 'No blocker detail recorded'}</strong></div>}
      <div className="work-card-actions">
        <label className="status-control">Move to<select value={record.status} disabled={saving} onChange={(event) => onStatusChange(record, event.target.value as WorkStatus)}>{[...workLanes, { status: 'cancelled' as WorkStatus, label: 'Cancelled', hint: '' }].map((option) => <option value={option.status} key={option.status}>{option.label}</option>)}</select></label>
        <button type="button" className="secondary work-edit-button" disabled={saving} onClick={() => setEditing((value) => !value)}>{editing ? 'Close' : 'Edit'}</button>
      </div>
      {editing && (
        <div className="work-edit-panel">
          <div className="work-edit-row">
            <label>Priority<select value={priority} onChange={(event) => setPriority(Number(event.target.value))}>{[5,4,3,2,1,0].map((value) => <option key={value} value={value}>P{value}</option>)}</select></label>
            {record.status === 'waiting' && <label>Waiting for<select value={waitingReason} onChange={(event) => setWaitingReason(event.target.value as WaitingReason | '')}><option value="">Choose…</option>{waitingReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label>}
          </div>
          <label>Next action<input value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="What should happen next?" /></label>
          {(record.status === 'waiting' || blocker) && <label>Blocker<textarea value={blocker} onChange={(event) => setBlocker(event.target.value)} placeholder="What is stopping this work?" rows={3} /></label>}
          <button type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save work details'}</button>
        </div>
      )}
    </article>
  )
}

function WorkTab({ work }: { work: WorkRecord[] }) {
  const primary = work[0]
  if (!primary) return <div className="section-card"><p className="muted">No work has been opened for this item.</p><button>Start work</button></div>
  const currentIndex = Math.max(0, workLanes.findIndex((lane) => lane.status === primary.status))
  return (
    <div className="content-grid">
      <section className="section-card feature-card">
        <div className="card-heading"><div><p className="eyebrow">WORK #{primary.work_number}</p><h3>{primary.title}</h3></div><StatusPill value={primary.status} /></div>
        <div className="next-action"><span>Next action</span><strong>{primary.next_action || 'No next action set'}</strong></div>
        {primary.status === 'waiting' && <div className="next-action"><span>Blocked by {primary.waiting_reason ? titleCase(primary.waiting_reason) : 'unspecified reason'}</span><strong>{primary.blocker || 'No blocker detail recorded'}</strong></div>}
        <dl className="fact-list compact-facts"><div><dt>Type</dt><dd>{titleCase(primary.type)}</dd></div><div><dt>Priority</dt><dd>P{primary.priority}</dd></div><div><dt>Diagnosis</dt><dd>{primary.diagnosis || 'Pending inspection'}</dd></div></dl>
      </section>
      <section className="section-card"><p className="eyebrow">WORKFLOW</p><div className="stage-strip">{workLanes.map((lane, index) => <span key={lane.status} className={index === currentIndex ? 'current' : ''}>{lane.label}</span>)}</div></section>
    </div>
  )
}

function ItemTabView({ item, identity, workspaceId, saving, onSave }: { item: Item; identity: Identity | null; workspaceId: string; saving: boolean; onSave: (item: Item, itemPatch: ItemPatch, identityPatch: IdentityPatch) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [status, setStatus] = useState(item.status)
  const [purpose, setPurpose] = useState(item.purpose)
  const [itemNotes, setItemNotes] = useState(item.notes || '')
  const [maker, setMaker] = useState(identity?.maker || '')
  const [model, setModel] = useState(identity?.model || '')
  const [era, setEra] = useState(identity?.era || '')
  const [country, setCountry] = useState(identity?.country || '')
  const [reference, setReference] = useState(identity?.reference || '')
  const [serial, setSerial] = useState(identity?.serial || '')
  const [materials, setMaterials] = useState(identity?.materials || '')
  const [dimensions, setDimensions] = useState(identity?.dimensions_text || '')
  const [dial, setDial] = useState(identity?.dial_markings || '')
  const [caseMarkings, setCaseMarkings] = useState(identity?.case_markings || '')
  const [movement, setMovement] = useState(identity?.movement_markings || '')
  const [identityNotes, setIdentityNotes] = useState(identity?.notes || '')

  useEffect(() => {
    if (editing) return
    setTitle(item.title)
    setStatus(item.status)
    setPurpose(item.purpose)
    setItemNotes(item.notes || '')
    setMaker(identity?.maker || '')
    setModel(identity?.model || '')
    setEra(identity?.era || '')
    setCountry(identity?.country || '')
    setReference(identity?.reference || '')
    setSerial(identity?.serial || '')
    setMaterials(identity?.materials || '')
    setDimensions(identity?.dimensions_text || '')
    setDial(identity?.dial_markings || '')
    setCaseMarkings(identity?.case_markings || '')
    setMovement(identity?.movement_markings || '')
    setIdentityNotes(identity?.notes || '')
  }, [item, identity, editing])

  async function save() {
    const ok = await onSave(item,
      { title: title.trim(), status, purpose, notes: itemNotes.trim() },
      {
        maker: maker.trim(), model: model.trim(), reference: reference.trim(), serial: serial.trim(), era: era.trim(), country: country.trim(), materials: materials.trim(), dimensions_text: dimensions.trim(),
        dial_markings: dial.trim(), case_markings: caseMarkings.trim(), movement_markings: movement.trim(), notes: identityNotes.trim(),
      },
    )
    if (ok) setEditing(false)
  }

  if (editing) {
    return (
      <div className="item-edit-form">
        <div className="item-edit-toolbar"><div><p className="eyebrow">ITEM DETAILS</p><h3>Edit Item #{item.item_number}</h3></div><button className="secondary small" onClick={() => setEditing(false)} disabled={saving}>Cancel</button></div>
        <section className="section-card item-edit-section">
          <p className="eyebrow">CORE</p>
          <div className="item-edit-grid">
            <label className="span-2">Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{itemStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label>Purpose<select value={purpose} onChange={(event) => setPurpose(event.target.value)}>{itemPurposes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
            <label className="span-2">Item notes<textarea rows={4} value={itemNotes} onChange={(event) => setItemNotes(event.target.value)} /></label>
          </div>
        </section>
        <section className="section-card item-edit-section">
          <p className="eyebrow">IDENTITY</p>
          <div className="item-edit-grid">
            <label>Maker<input value={maker} onChange={(event) => setMaker(event.target.value)} /></label>
            <label>Model<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
            <label>Era<input value={era} onChange={(event) => setEra(event.target.value)} placeholder="e.g. 1960s" /></label>
            <label>Country<input value={country} onChange={(event) => setCountry(event.target.value)} /></label>
            <label>Reference<input value={reference} onChange={(event) => setReference(event.target.value)} /></label>
            <label>Serial<input value={serial} onChange={(event) => setSerial(event.target.value)} /></label>
            <label>Materials<input value={materials} onChange={(event) => setMaterials(event.target.value)} /></label>
            <label>Dimensions<input value={dimensions} onChange={(event) => setDimensions(event.target.value)} /></label>
          </div>
        </section>
        <section className="section-card item-edit-section">
          <p className="eyebrow">OBSERVATIONS</p>
          <div className="item-edit-grid">
            <label className="span-2">Dial markings<textarea rows={3} value={dial} onChange={(event) => setDial(event.target.value)} /></label>
            <label className="span-2">Case markings<textarea rows={3} value={caseMarkings} onChange={(event) => setCaseMarkings(event.target.value)} /></label>
            <label className="span-2">Movement markings<textarea rows={3} value={movement} onChange={(event) => setMovement(event.target.value)} /></label>
            <label className="span-2">Identity / research notes<textarea rows={4} value={identityNotes} onChange={(event) => setIdentityNotes(event.target.value)} /></label>
          </div>
        </section>
        <div className="item-edit-savebar"><button onClick={save} disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save item'}</button></div>
      </div>
    )
  }

  return (
    <div className="item-tab-stack">
      <div className="content-grid two-column">
        <section className="section-card"><div className="card-heading"><div><p className="eyebrow">IDENTITY</p><h3>Object details</h3></div><button className="secondary small" onClick={() => setEditing(true)}>Edit</button></div><dl className="fact-list"><div><dt>Maker</dt><dd>{identity?.maker || '—'}</dd></div><div><dt>Model</dt><dd>{identity?.model || 'Unresolved'}</dd></div><div><dt>Era</dt><dd>{identity?.era || '—'}</dd></div><div><dt>Country</dt><dd>{identity?.country || '—'}</dd></div><div><dt>Reference</dt><dd>{identity?.reference || '—'}</dd></div><div><dt>Serial</dt><dd>{identity?.serial || '—'}</dd></div><div><dt>Materials</dt><dd>{identity?.materials || '—'}</dd></div><div><dt>Dimensions</dt><dd>{identity?.dimensions_text || '—'}</dd></div></dl></section>
        <section className="section-card"><p className="eyebrow">OBSERVATIONS</p><div className="prose-data"><span>Dial</span><p>{identity?.dial_markings || 'No dial markings recorded.'}</p><span>Case</span><p>{identity?.case_markings || 'No case markings recorded.'}</p><span>Movement</span><p>{identity?.movement_markings || 'Movement not yet identified.'}</p><span>Item notes</span><p>{item.notes || 'No item notes yet.'}</p><span>Identity notes</span><p>{identity?.notes || 'No identity notes yet.'}</p></div></section>
      </div>
      <ItemMedia workspaceId={workspaceId} itemId={item.id} />
    </div>
  )
}

function CommerceTab({ valuation, costs }: { valuation: Valuation | null; costs: CostEntry[] }) {
  const purchaseCost = costs.filter((cost) => cost.category === 'purchase').reduce((sum, cost) => sum + Number(cost.amount), 0)
  const totalCost = costs.reduce((sum, cost) => sum + Number(cost.amount), 0)
  const target = valuation?.target_value ?? null
  const potential = target == null ? null : target - totalCost
  const currency = valuation?.currency || costs[0]?.currency || 'AUD'
  return (
    <div className="content-grid commerce-grid">
      <section className="metric-card"><span>Buy-in</span><strong>{money(purchaseCost, currency)}</strong></section><section className="metric-card"><span>Target</span><strong>{money(target, currency)}</strong></section><section className="metric-card"><span>Minimum</span><strong>{money(valuation?.minimum_value, currency)}</strong></section><section className="metric-card"><span>Potential gross</span><strong>{money(potential, currency)}</strong></section>
      <section className="section-card wide-card"><div className="card-heading"><div><p className="eyebrow">VALUATION</p><h3>Current sales position</h3></div><span className="confidence">{titleCase(valuation?.confidence || 'unknown')}</span></div><dl className="fact-list compact-facts"><div><dt>Market low</dt><dd>{money(valuation?.low_value, currency)}</dd></div><div><dt>Expected</dt><dd>{money(valuation?.expected_value, currency)}</dd></div><div><dt>Market high</dt><dd>{money(valuation?.high_value, currency)}</dd></div><div><dt>Total recorded cost</dt><dd>{money(totalCost, currency)}</dd></div></dl>{valuation?.basis && <p className="valuation-basis">{valuation.basis}</p>}</section>
    </div>
  )
}
