import { FormEvent, ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Workspace = {
  id: string
  name: string
  slug: string
  owner_id: string
}

type WorkshopSessionContextValue = {
  session: Session
  workspace: Workspace
  signOut: () => Promise<void>
  refreshWorkspace: () => Promise<void>
}

const WorkshopSessionContext = createContext<WorkshopSessionContextValue | null>(null)

export function useWorkshopSession() {
  const value = useContext(WorkshopSessionContext)
  if (!value) throw new Error('useWorkshopSession must be used inside WorkshopSessionGate.')
  return value
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`mark ${compact ? 'compact' : ''}`} aria-hidden="true"><span className="moon" /><span className="star">✦</span></span>
}

export default function WorkshopSessionGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [message, setMessage] = useState('Checking session…')
  const [busy, setBusy] = useState(false)
  const [booting, setBooting] = useState(true)
  const [connection, setConnection] = useState<'checking' | 'ok' | 'error'>('checking')

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setMessage(error.message)
      setSession(data.session)
      setBooting(false)
      if (!error) setMessage(data.session ? 'Signed in.' : 'Ready to sign in.')
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setBooting(false)
      if (!nextSession) {
        setWorkspace(null)
        setConnection('checking')
      }
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  async function loadWorkspace(activeSession: Session = session as Session) {
    if (!activeSession) return
    setConnection('checking')
    const result = await supabase
      .from('workspaces')
      .select('id,name,slug,owner_id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (result.error) {
      setWorkspace(null)
      setConnection('error')
      setMessage(`Database connection failed: ${result.error.message}`)
      return
    }

    const nextWorkspace = result.data as Workspace | null
    if (nextWorkspace?.owner_id === activeSession.user.id) {
      const membership = await supabase
        .from('workspace_members')
        .select('workspace_id,user_id,role')
        .eq('workspace_id', nextWorkspace.id)
        .eq('user_id', activeSession.user.id)
        .maybeSingle()

      if (membership.error) {
        setWorkspace(null)
        setConnection('error')
        setMessage(`Membership check failed: ${membership.error.message}`)
        return
      }

      if (!membership.data) {
        const repair = await supabase.from('workspace_members').insert({
          workspace_id: nextWorkspace.id,
          user_id: activeSession.user.id,
          role: 'owner',
        })
        if (repair.error) {
          setWorkspace(null)
          setConnection('error')
          setMessage(`Owner membership repair failed: ${repair.error.message}`)
          return
        }
      }
    }

    setWorkspace(nextWorkspace)
    setConnection('ok')
    setMessage(nextWorkspace ? 'Calibre v2 is connected.' : 'Connected. Workspace setup is ready.')
  }

  useEffect(() => {
    if (!session) return
    let active = true
    ;(async () => {
      await loadWorkspace(session)
      if (!active) return
    })()
    return () => { active = false }
  }, [session?.user.id])

  async function sendOtp(event: FormEvent) {
    event.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setMessage('Sending verification code…')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
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
    if (!session?.user || busy) return
    setBusy(true)
    setMessage('Creating Calibre workspace…')
    const created = await supabase
      .from('workspaces')
      .insert({ owner_id: session.user.id, name: 'Calibre & Co.', slug: 'calibre-co' })
      .select('id,name,slug,owner_id')
      .single()

    if (created.error || !created.data) {
      setBusy(false)
      setMessage(created.error?.message ?? 'Workspace creation failed.')
      return
    }

    const member = await supabase.from('workspace_members').insert({
      workspace_id: created.data.id,
      user_id: session.user.id,
      role: 'owner',
    })
    setBusy(false)
    setWorkspace(created.data as Workspace)
    setConnection('ok')
    setMessage(member.error ? `Workspace created; membership retry needed: ${member.error.message}` : 'Calibre & Co. workspace initialized.')
  }

  async function signOut() {
    if (busy) return
    setBusy(true)
    const { error } = await supabase.auth.signOut()
    setBusy(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setOtp('')
    setOtpSent(false)
    setWorkspace(null)
    setMessage('Signed out.')
  }

  if (booting) {
    return <main className="setup-shell"><BrandMark /><p className="eyebrow">CALIBRE & CO.</p><h2>Opening workshop…</h2><p className="muted">Checking your secure session.</p></main>
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
        {connection === 'checking' && <p className="message">Checking workspace access…</p>}
        {connection === 'ok' && <button onClick={() => void initializeWorkspace()} disabled={busy}>{busy ? 'Creating…' : 'Initialize Calibre & Co.'}</button>}
        {connection === 'error' && <button className="secondary" onClick={() => void loadWorkspace(session)} disabled={busy}>Retry connection</button>}
        <button className="secondary" onClick={() => void signOut()} disabled={busy}>Sign out</button>
      </main>
    )
  }

  const contextValue = useMemo<WorkshopSessionContextValue>(() => ({
    session,
    workspace,
    signOut,
    refreshWorkspace: () => loadWorkspace(session),
  }), [session, workspace])

  return <WorkshopSessionContext.Provider value={contextValue}>{children}</WorkshopSessionContext.Provider>
}
