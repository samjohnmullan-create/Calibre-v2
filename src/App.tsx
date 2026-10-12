import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Workspace = {
  id: string
  name: string
  slug: string
  owner_id: string
}

type Item = {
  id: string
  item_number: number
  type: string
  purpose: string
  status: string
  title: string
  notes: string
  created_at: string
}

type Identity = {
  maker: string
  model: string
  reference: string
  serial: string
  year_from: number | null
  year_to: number | null
  era: string
  country: string
  materials: string
  dimensions_text: string
  dial_markings: string
  case_markings: string
  movement_markings: string
  notes: string
}

type WorkRecord = {
  id: string
  work_number: number
  type: string
  title: string
  status: string
  priority: number
  next_action: string
  diagnosis: string
  notes: string
}

type Valuation = {
  low_value: number | null
  expected_value: number | null
  high_value: number | null
  target_value: number | null
  minimum_value: number | null
  currency: string
  confidence: string
  basis: string
}

type CostEntry = {
  category: string
  amount: number
  currency: string
  notes: string
}

type DetailData = {
  identity: Identity | null
  work: WorkRecord[]
  valuation: Valuation | null
  costs: CostEntry[]
}

type Section = 'home' | 'items' | 'workbench' | 'business' | 'calibre'
type ItemTab = 'work' | 'item' | 'commerce'

const emptyDetail: DetailData = { identity: null, work: [], valuation: null, costs: [] }

function money(value: number | null | undefined, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
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

  const redirectTo = useMemo(
    () => `${window.location.origin}${import.meta.env.BASE_URL}`,
    [],
  )

  const selectedItem = items.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message)
      setSession(data.session)
      setMessage(data.session ? 'Signed in.' : 'Ready to sign in.')
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

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
      const { data, error } = await supabase
        .from('workspaces')
        .select('id,name,slug,owner_id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!active) return
      if (error) {
        setConnection('error')
        setMessage(`Database connection failed: ${error.message}`)
        return
      }

      if (data && data.owner_id === session.user.id) {
        const { data: membership, error: membershipReadError } = await supabase
          .from('workspace_members')
          .select('workspace_id,user_id,role')
          .eq('workspace_id', data.id)
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (!active) return
        if (membershipReadError) {
          setConnection('error')
          setMessage(`Membership check failed: ${membershipReadError.message}`)
          return
        }

        if (!membership) {
          const { error: membershipRepairError } = await supabase
            .from('workspace_members')
            .insert({ workspace_id: data.id, user_id: session.user.id, role: 'owner' })

          if (!active) return
          if (membershipRepairError) {
            setConnection('error')
            setMessage(`Workspace found, but owner membership repair failed: ${membershipRepairError.message}`)
            return
          }
        }
      }

      setWorkspace(data)
      setConnection('ok')
      setMessage(data ? 'Calibre v2 is connected.' : 'Connected. Workspace setup is ready.')
    })()

    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    if (!workspace) return
    let active = true
    ;(async () => {
      setItemsLoading(true)
      const { data, error } = await supabase
        .from('items')
        .select('id,item_number,type,purpose,status,title,notes,created_at')
        .eq('workspace_id', workspace.id)
        .is('archived_at', null)
        .order('item_number', { ascending: false })

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
    return () => {
      active = false
    }
  }, [workspace, selectedId])

  useEffect(() => {
    if (!workspace || !selectedId) {
      setDetail(emptyDetail)
      return
    }

    let active = true
    ;(async () => {
      setDetailLoading(true)
      const [identityResult, workResult, valuationResult, costsResult] = await Promise.all([
        supabase
          .from('item_identity')
          .select('maker,model,reference,serial,year_from,year_to,era,country,materials,dimensions_text,dial_markings,case_markings,movement_markings,notes')
          .eq('workspace_id', workspace.id)
          .eq('item_id', selectedId)
          .maybeSingle(),
        supabase
          .from('work_records')
          .select('id,work_number,type,title,status,priority,next_action,diagnosis,notes')
          .eq('workspace_id', workspace.id)
          .eq('item_id', selectedId)
          .order('work_number', { ascending: false }),
        supabase
          .from('valuations')
          .select('low_value,expected_value,high_value,target_value,minimum_value,currency,confidence,basis')
          .eq('workspace_id', workspace.id)
          .eq('item_id', selectedId)
          .order('valued_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('cost_entries')
          .select('category,amount,currency,notes')
          .eq('workspace_id', workspace.id)
          .eq('item_id', selectedId)
          .order('incurred_at', { ascending: false }),
      ])

      if (!active) return
      setDetailLoading(false)

      const error = identityResult.error ?? workResult.error ?? valuationResult.error ?? costsResult.error
      if (error) {
        setMessage(`Item detail failed to load: ${error.message}`)
        return
      }

      setDetail({
        identity: identityResult.data as Identity | null,
        work: (workResult.data ?? []) as WorkRecord[],
        valuation: valuationResult.data as Valuation | null,
        costs: (costsResult.data ?? []) as CostEntry[],
      })
    })()

    return () => {
      active = false
    }
  }, [workspace, selectedId])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setMessage('Sending sign-in link…')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setBusy(false)
    setMessage(error ? error.message : 'Check your email for the Calibre sign-in link.')
  }

  async function initializeWorkspace() {
    if (!session?.user) return
    setBusy(true)
    setMessage('Creating Calibre workspace…')

    const { data: created, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({ owner_id: session.user.id, name: 'Calibre & Co.', slug: 'calibre-co' })
      .select('id,name,slug,owner_id')
      .single()

    if (workspaceError || !created) {
      setBusy(false)
      setMessage(workspaceError?.message ?? 'Workspace creation failed.')
      return
    }

    const { error: memberError } = await supabase.from('workspace_members').insert({
      workspace_id: created.id,
      user_id: session.user.id,
      role: 'owner',
    })

    setBusy(false)
    setWorkspace(created)
    setConnection('ok')
    setMessage(memberError ? `Workspace created; membership retry needed: ${memberError.message}` : 'Calibre & Co. workspace initialized.')
  }

  async function signOut() {
    setBusy(true)
    const { error } = await supabase.auth.signOut()
    setBusy(false)
    setMessage(error ? error.message : 'Signed out.')
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
          <form className="auth-card" onSubmit={signIn}>
            <div>
              <p className="eyebrow">SECURE ACCESS</p>
              <h2>Sign in to Calibre</h2>
              <p className="muted">Use your email link to open the workshop.</p>
            </div>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </label>
            <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button>
            <p className="message">{message}</p>
          </form>
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
        <button className="brand-button" onClick={() => setSection('home')} aria-label="Calibre home">
          <BrandMark compact />
          <span>Calibre & Co.</span>
        </button>
        <nav className="topnav" aria-label="Main navigation">
          {(['home', 'items', 'workbench', 'business', 'calibre'] as Section[]).map((key) => (
            <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>{titleCase(key)}</button>
          ))}
        </nav>
        <button className="profile-chip" onClick={signOut} title="Sign out">SM</button>
      </header>

      {section !== 'items' ? (
        <main className="placeholder-page">
          <p className="eyebrow">{titleCase(section)}</p>
          <h2>{section === 'home' ? 'Calibre v2' : `${titleCase(section)} is next.`}</h2>
          <p className="muted">The data foundation is live. Items is the first working module while we build the rest of the operating system around it.</p>
          <button onClick={() => setSection('items')}>Open Items</button>
        </main>
      ) : (
        <main className="items-layout">
          <aside className="items-pane">
            <div className="pane-heading">
              <div>
                <p className="eyebrow">INVENTORY</p>
                <h2>Items</h2>
              </div>
              <span className="count-chip">{items.length}</span>
            </div>
            <div className="items-tools">
              <input className="search" placeholder="Search items" aria-label="Search items" />
              <button className="icon-button" title="Create item" aria-label="Create item">＋</button>
            </div>
            <div className="item-list">
              {itemsLoading && <p className="empty-state">Loading items…</p>}
              {!itemsLoading && items.length === 0 && <p className="empty-state">No items yet.</p>}
              {items.map((item) => (
                <button key={item.id} className={`item-row ${selectedId === item.id ? 'selected' : ''}`} onClick={() => { setSelectedId(item.id); setItemTab('work') }}>
                  <div className="item-number">#{item.item_number}</div>
                  <div className="item-row-main">
                    <strong>{item.title}</strong>
                    <span>{titleCase(item.type)} · {titleCase(item.purpose)}</span>
                  </div>
                  <StatusPill value={item.status} />
                </button>
              ))}
            </div>
          </aside>

          <section className="item-workspace">
            {!selectedItem ? (
              <div className="empty-detail">
                <p className="eyebrow">ITEM WORKSPACE</p>
                <h2>Select an item</h2>
                <p className="muted">Identity, work and commerce stay attached to one physical object.</p>
              </div>
            ) : (
              <>
                <div className="item-header">
                  <div>
                    <div className="item-kicker"><span>Item #{selectedItem.item_number}</span><StatusPill value={selectedItem.status} /></div>
                    <h1>{selectedItem.title}</h1>
                    <p className="subtitle">{detail.identity?.maker || titleCase(selectedItem.type)}{detail.identity?.era ? ` · ${detail.identity.era}` : ''}</p>
                  </div>
                  <div className="header-actions">
                    <button className="secondary small">•••</button>
                  </div>
                </div>

                <div className="item-tabs" role="tablist">
                  {(['work', 'item', 'commerce'] as ItemTab[]).map((tab) => (
                    <button key={tab} className={itemTab === tab ? 'active' : ''} onClick={() => setItemTab(tab)}>{titleCase(tab)}</button>
                  ))}
                </div>

                {detailLoading ? <div className="loading-card">Loading item…</div> : (
                  <div className="tab-content">
                    {itemTab === 'work' && <WorkTab work={detail.work} />}
                    {itemTab === 'item' && <ItemTabView item={selectedItem} identity={detail.identity} />}
                    {itemTab === 'commerce' && <CommerceTab valuation={detail.valuation} costs={detail.costs} />}
                  </div>
                )}
              </>
            )}
          </section>
        </main>
      )}
    </div>
  )
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`mark ${compact ? 'compact' : ''}`} aria-hidden="true">
      <span className="moon" />
      <span className="star">✦</span>
    </span>
  )
}

function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill status-${value}`}>{titleCase(value)}</span>
}

function WorkTab({ work }: { work: WorkRecord[] }) {
  const primary = work[0]
  if (!primary) return <div className="section-card"><p className="muted">No work has been opened for this item.</p><button>Start work</button></div>
  return (
    <div className="content-grid">
      <section className="section-card feature-card">
        <div className="card-heading">
          <div><p className="eyebrow">WORK #{primary.work_number}</p><h3>{primary.title}</h3></div>
          <StatusPill value={primary.status} />
        </div>
        <div className="next-action">
          <span>Next action</span>
          <strong>{primary.next_action || 'No next action set'}</strong>
        </div>
        <dl className="fact-list compact-facts">
          <div><dt>Type</dt><dd>{titleCase(primary.type)}</dd></div>
          <div><dt>Priority</dt><dd>{primary.priority || 'Normal'}</dd></div>
          <div><dt>Diagnosis</dt><dd>{primary.diagnosis || 'Pending inspection'}</dd></div>
        </dl>
      </section>
      <section className="section-card">
        <p className="eyebrow">WORKFLOW</p>
        <div className="stage-strip">
          {['Queue', 'Ready', 'On bench', 'Waiting', 'QC', 'Complete'].map((stage, index) => <span key={stage} className={index === 0 ? 'current' : ''}>{stage}</span>)}
        </div>
      </section>
    </div>
  )
}

function ItemTabView({ item, identity }: { item: Item; identity: Identity | null }) {
  return (
    <div className="content-grid two-column">
      <section className="section-card">
        <p className="eyebrow">IDENTITY</p>
        <dl className="fact-list">
          <div><dt>Maker</dt><dd>{identity?.maker || '—'}</dd></div>
          <div><dt>Model</dt><dd>{identity?.model || 'Unresolved'}</dd></div>
          <div><dt>Era</dt><dd>{identity?.era || '—'}</dd></div>
          <div><dt>Country</dt><dd>{identity?.country || '—'}</dd></div>
          <div><dt>Reference</dt><dd>{identity?.reference || '—'}</dd></div>
          <div><dt>Serial</dt><dd>{identity?.serial || '—'}</dd></div>
        </dl>
      </section>
      <section className="section-card">
        <p className="eyebrow">OBSERVATIONS</p>
        <div className="prose-data">
          <span>Dial</span><p>{identity?.dial_markings || 'No dial markings recorded.'}</p>
          <span>Case</span><p>{identity?.case_markings || 'No case markings recorded.'}</p>
          <span>Movement</span><p>{identity?.movement_markings || 'Movement not yet identified.'}</p>
          <span>Notes</span><p>{identity?.notes || item.notes || 'No notes yet.'}</p>
        </div>
      </section>
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
      <section className="metric-card"><span>Buy-in</span><strong>{money(purchaseCost, currency)}</strong></section>
      <section className="metric-card"><span>Target</span><strong>{money(target, currency)}</strong></section>
      <section className="metric-card"><span>Minimum</span><strong>{money(valuation?.minimum_value, currency)}</strong></section>
      <section className="metric-card"><span>Potential gross</span><strong>{money(potential, currency)}</strong></section>
      <section className="section-card wide-card">
        <div className="card-heading"><div><p className="eyebrow">VALUATION</p><h3>Current sales position</h3></div><span className="confidence">{titleCase(valuation?.confidence || 'unknown')}</span></div>
        <dl className="fact-list compact-facts">
          <div><dt>Market low</dt><dd>{money(valuation?.low_value, currency)}</dd></div>
          <div><dt>Expected</dt><dd>{money(valuation?.expected_value, currency)}</dd></div>
          <div><dt>Market high</dt><dd>{money(valuation?.high_value, currency)}</dd></div>
          <div><dt>Total recorded cost</dt><dd>{money(totalCost, currency)}</dd></div>
        </dl>
        {valuation?.basis && <p className="valuation-basis">{valuation.basis}</p>}
      </section>
    </div>
  )
}
