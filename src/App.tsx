import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, SUPABASE_URL } from './lib/supabase'

type Workspace = {
  id: string
  name: string
  slug: string
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('Checking session…')
  const [busy, setBusy] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [connection, setConnection] = useState<'checking' | 'ok' | 'error'>('checking')

  const redirectTo = useMemo(
    () => `${window.location.origin}${import.meta.env.BASE_URL}`,
    [],
  )

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
        .select('id,name,slug')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!active) return
      if (error) {
        setConnection('error')
        setMessage(`Database connection failed: ${error.message}`)
        return
      }

      setWorkspace(data)
      setConnection('ok')
      setMessage(data ? 'Calibre v2 is connected.' : 'Connected. Workspace setup is ready.')
    })()

    return () => {
      active = false
    }
  }, [session])

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
      .insert({
        owner_id: session.user.id,
        name: 'Calibre & Co.',
        slug: 'calibre-co',
      })
      .select('id,name,slug')
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
    if (memberError) {
      setMessage(`Workspace created, but owner membership needs retry: ${memberError.message}`)
      return
    }

    setWorkspace(created)
    setConnection('ok')
    setMessage('Calibre & Co. workspace initialized successfully.')
  }

  async function signOut() {
    setBusy(true)
    const { error } = await supabase.auth.signOut()
    setBusy(false)
    setMessage(error ? error.message : 'Signed out.')
  }

  return (
    <main className="shell">
      <section className="brand-panel">
        <div className="mark" aria-hidden="true">
          <span className="moon" />
          <span className="star">✦</span>
        </div>
        <p className="eyebrow">CALIBRE & CO.</p>
        <h1>Clean foundation.</h1>
        <p className="lead">
          Calibre v2 is starting with one source of truth, explicit records, and no legacy job state.
        </p>
        <div className="status-row">
          <span className={`dot ${connection}`} />
          <span>{connection === 'ok' ? 'Supabase connected' : connection === 'error' ? 'Connection error' : 'Checking database'}</span>
        </div>
      </section>

      <section className="auth-panel">
        {!session ? (
          <form className="auth-card" onSubmit={signIn}>
            <div>
              <p className="eyebrow">PHASE 0C</p>
              <h2>Sign in to Calibre</h2>
              <p className="muted">We’ll use a secure email link for the first authenticated acceptance test.</p>
            </div>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button>
            <p className="message">{message}</p>
          </form>
        ) : (
          <div className="auth-card">
            <div>
              <p className="eyebrow">AUTHENTICATED</p>
              <h2>{workspace ? workspace.name : 'Workspace setup'}</h2>
              <p className="muted">{session.user.email}</p>
            </div>

            <dl className="checks">
              <div><dt>Auth session</dt><dd>Passed</dd></div>
              <div><dt>Database</dt><dd>{connection === 'ok' ? 'Passed' : 'Checking'}</dd></div>
              <div><dt>Workspace</dt><dd>{workspace ? 'Ready' : 'Not initialized'}</dd></div>
            </dl>

            {!workspace && connection === 'ok' && (
              <button onClick={initializeWorkspace} disabled={busy}>
                {busy ? 'Creating…' : 'Initialize Calibre & Co.'}
              </button>
            )}

            <button className="secondary" onClick={signOut} disabled={busy}>Sign out</button>
            <p className="message">{message}</p>
          </div>
        )}

        <footer>
          <span>Project</span>
          <code>{new URL(SUPABASE_URL).hostname.split('.')[0]}</code>
        </footer>
      </section>
    </main>
  )
}
