import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type HealthLevel = 'good' | 'attention' | 'critical' | 'unknown'
type HealthRow = { label: string; value: string; detail: string; level: HealthLevel }
type DeployMeta = { app?: string; commit?: string; built_at?: string }

type CheckState = boolean | null

const browserBuildSha = String(import.meta.env.VITE_BUILD_SHA || '').toLowerCase()
const isProductionHost = window.location.hostname.toLowerCase() === 'app.calibreco.com.au'

function shortSha(value: string) {
  return value ? value.slice(0, 8) : 'Unknown'
}

function backupAgeLabel(value: string) {
  if (!value) return { value: 'Not recorded', level: 'attention' as const, detail: 'Create an owner-controlled backup.' }
  const ageMs = Date.now() - new Date(value).getTime()
  const days = Math.max(0, Math.floor(ageMs / 86_400_000))
  return {
    value: days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} ago`,
    level: days <= 30 ? 'good' as const : 'attention' as const,
    detail: new Date(value).toLocaleString('en-AU'),
  }
}

function stateLevel(value: CheckState): HealthLevel {
  if (value === true) return 'good'
  if (value === false) return 'critical'
  return 'unknown'
}

async function readLiveRelease(): Promise<DeployMeta> {
  const response = await fetch(`/deploy-meta.json?__calibre_health=${Date.now()}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', 'cache-control': 'no-cache', pragma: 'no-cache' },
  })
  if (!response.ok) throw new Error(`release fingerprint returned HTTP ${response.status}`)
  const metadata = await response.json() as DeployMeta
  if (!metadata.commit || !/^[0-9a-f]{40}$/i.test(metadata.commit)) throw new Error('release fingerprint did not contain a valid commit')
  return { ...metadata, commit: metadata.commit.toLowerCase() }
}

export default function SystemHealthPanel({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [lastCheckedAt, setLastCheckedAt] = useState('')
  const [liveRelease, setLiveRelease] = useState<DeployMeta | null>(null)
  const [releaseOk, setReleaseOk] = useState<CheckState>(null)
  const [databaseOk, setDatabaseOk] = useState<CheckState>(null)
  const [authOk, setAuthOk] = useState<CheckState>(null)
  const [storageOk, setStorageOk] = useState<CheckState>(null)
  const [latestAudit, setLatestAudit] = useState('')
  const [activeSessions, setActiveSessions] = useState(0)
  const [openReceivingExceptions, setOpenReceivingExceptions] = useState(0)
  const [waitingWork, setWaitingWork] = useState(0)
  const [unassigned, setUnassigned] = useState({ items: 0, parts: 0, tools: 0, consumables: 0 })
  const [lastStructuredExport, setLastStructuredExport] = useState('')
  const [lastStorageExport, setLastStorageExport] = useState('')

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setMessage('')
    setReleaseOk(isProductionHost ? null : true)
    setDatabaseOk(null)
    setAuthOk(null)
    setStorageOk(null)
    setLastStructuredExport(localStorage.getItem('calibre:last-structured-export') ?? '')
    setLastStorageExport(localStorage.getItem('calibre:last-storage-export') ?? '')

    const releasePromise = isProductionHost
      ? readLiveRelease().then((metadata) => ({ metadata, error: '' })).catch((error: unknown) => ({ metadata: null, error: error instanceof Error ? error.message : 'release fingerprint failed' }))
      : Promise.resolve({ metadata: null, error: '' })

    const [
      releaseResult,
      workspaceResult,
      userResult,
      storageResult,
      auditResult,
      sessionResult,
      exceptionResult,
      waitingResult,
      itemsResult,
      partsResult,
      toolsResult,
      consumablesResult,
    ] = await Promise.all([
      releasePromise,
      supabase.from('workspaces').select('id').eq('id', workspaceId).maybeSingle(),
      supabase.auth.getUser(),
      supabase.storage.from('calibre-media').list(workspaceId, { limit: 1 }),
      supabase.from('audit_events').select('created_at').eq('workspace_id', workspaceId).order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('work_sessions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('ended_at', null),
      supabase.from('purchase_receiving_exceptions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'open'),
      supabase.from('work_records').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'waiting'),
      supabase.from('items').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
      supabase.from('parts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
      supabase.from('tools').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
      supabase.from('consumables').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
    ])

    setLiveRelease(releaseResult.metadata)
    if (isProductionHost) setReleaseOk(Boolean(releaseResult.metadata) && !releaseResult.error)
    setDatabaseOk(Boolean(workspaceResult.data) && !workspaceResult.error)
    setAuthOk(Boolean(userResult.data.user) && !userResult.error)
    setStorageOk(!storageResult.error)

    if (!auditResult.error) setLatestAudit(auditResult.data?.created_at ?? '')
    if (!sessionResult.error) setActiveSessions(sessionResult.count ?? 0)
    if (!exceptionResult.error) setOpenReceivingExceptions(exceptionResult.count ?? 0)
    if (!waitingResult.error) setWaitingWork(waitingResult.count ?? 0)
    setUnassigned({
      items: itemsResult.error ? 0 : itemsResult.count ?? 0,
      parts: partsResult.error ? 0 : partsResult.count ?? 0,
      tools: toolsResult.error ? 0 : toolsResult.count ?? 0,
      consumables: consumablesResult.error ? 0 : consumablesResult.count ?? 0,
    })

    const errors = [
      releaseResult.error,
      workspaceResult.error?.message,
      userResult.error?.message,
      storageResult.error?.message,
      auditResult.error?.message,
      sessionResult.error?.message,
      exceptionResult.error?.message,
      waitingResult.error?.message,
      itemsResult.error?.message,
      partsResult.error?.message,
      toolsResult.error?.message,
      consumablesResult.error?.message,
    ].filter(Boolean)

    setMessage(errors.length ? `Some checks could not be completed: ${errors.join(' · ')}` : '')
    setLastCheckedAt(new Date().toISOString())
    setLoading(false)
  }

  useEffect(() => { void load() }, [workspaceId])

  const structuredBackup = useMemo(() => backupAgeLabel(lastStructuredExport), [lastStructuredExport])
  const storageBackup = useMemo(() => backupAgeLabel(lastStorageExport), [lastStorageExport])
  const totalUnassigned = unassigned.items + unassigned.parts + unassigned.tools + unassigned.consumables
  const versionMatches = browserBuildSha && liveRelease?.commit ? browserBuildSha === liveRelease.commit : null

  const coreFailed = [releaseOk, databaseOk, authOk, storageOk].some((value) => value === false)
  const coreUnknown = [releaseOk, databaseOk, authOk, storageOk].some((value) => value === null)
  const overallLevel: HealthLevel = coreFailed ? 'critical' : versionMatches === false ? 'attention' : coreUnknown ? 'unknown' : 'good'
  const overallTitle = overallLevel === 'good'
    ? 'Core systems healthy'
    : overallLevel === 'critical'
      ? 'Core system failure detected'
      : overallLevel === 'attention'
        ? 'Refresh recommended'
        : 'Health not fully verified'
  const overallDetail = overallLevel === 'good'
    ? 'Production, session, database and media storage checks passed.'
    : overallLevel === 'critical'
      ? 'One or more platform checks failed. Review the red cards below.'
      : overallLevel === 'attention'
        ? 'This browser is running a different Calibre build from the live release.'
        : 'Calibre is still checking, or this is a non-production build.'

  const platformRows: HealthRow[] = [
    {
      label: 'Production release',
      value: isProductionHost ? (liveRelease?.commit ? shortSha(liveRelease.commit) : 'Not verified') : 'Development',
      detail: isProductionHost
        ? (liveRelease?.built_at ? `Built ${new Date(liveRelease.built_at).toLocaleString('en-AU')}. Deployment fingerprint is live.` : 'Live deployment fingerprint could not be read.')
        : 'Release fingerprint is only authoritative on app.calibreco.com.au.',
      level: isProductionHost ? stateLevel(releaseOk) : 'unknown',
    },
    {
      label: 'This browser',
      value: browserBuildSha ? shortSha(browserBuildSha) : 'Development',
      detail: versionMatches === false
        ? `Live is ${shortSha(liveRelease?.commit ?? '')}. Refresh Calibre to load the current release.`
        : versionMatches === true
          ? 'Browser bundle matches the live production release.'
          : 'Build identity is unavailable outside a stamped production build.',
      level: versionMatches === false ? 'attention' : versionMatches === true ? 'good' : 'unknown',
    },
    {
      label: 'Authentication',
      value: authOk === true ? 'Verified' : authOk === false ? 'Failed' : 'Checking',
      detail: authOk === true ? 'The signed-in Calibre user was verified against Supabase Auth.' : 'The current user session could not be verified.',
      level: stateLevel(authOk),
    },
    {
      label: 'Database & workspace',
      value: databaseOk === true ? 'Connected' : databaseOk === false ? 'Failed' : 'Checking',
      detail: databaseOk === true ? 'Current workspace is readable under the signed-in user.' : 'Workspace database access could not be confirmed.',
      level: stateLevel(databaseOk),
    },
    {
      label: 'Media storage',
      value: storageOk === true ? 'Connected' : storageOk === false ? 'Failed' : 'Checking',
      detail: storageOk === true ? 'Private Calibre media storage is reachable with workspace permissions.' : 'Private media storage could not be reached.',
      level: stateLevel(storageOk),
    },
  ]

  const workshopRows: HealthRow[] = [
    { label: 'Audit trail', value: latestAudit ? `Latest ${new Date(latestAudit).toLocaleString('en-AU')}` : 'No event recorded', detail: latestAudit ? 'Database-level audit history is readable.' : 'No audit event is currently visible for this workspace.', level: latestAudit ? 'good' : 'attention' },
    { label: 'Active Bench sessions', value: String(activeSessions), detail: activeSessions ? 'A hands-on Bench session is currently open.' : 'No active Bench session.', level: activeSessions > 1 ? 'attention' : 'good' },
    { label: 'Receiving exceptions', value: String(openReceivingExceptions), detail: openReceivingExceptions ? 'Open Purchase receiving exceptions need a decision.' : 'No open receiving exceptions.', level: openReceivingExceptions ? 'attention' : 'good' },
    { label: 'Waiting Work', value: String(waitingWork), detail: waitingWork ? 'Work is intentionally blocked or waiting for something.' : 'No Work records are waiting.', level: waitingWork ? 'attention' : 'good' },
    { label: 'Needs put-away', value: String(totalUnassigned), detail: `${unassigned.items} Items · ${unassigned.parts} Parts · ${unassigned.tools} Tools · ${unassigned.consumables} Consumables`, level: totalUnassigned ? 'attention' : 'good' },
    { label: 'Structured backup', value: structuredBackup.value, detail: structuredBackup.detail, level: structuredBackup.level },
    { label: 'Storage archive', value: storageBackup.value, detail: storageBackup.detail, level: storageBackup.level },
  ]

  return (
    <article className="settings-v2-card settings-v2-card-primary system-health-card">
      <div className="system-health-heading">
        <div>
          <p className="eyebrow">SYSTEM HEALTH</p>
          <h2>Calibre control panel</h2>
          <p className="muted">Platform failures are separated from normal workshop attention so a waiting job does not make the app look broken.</p>
        </div>
        <button type="button" className="secondary" disabled={loading || !workspaceId} onClick={() => void load()}>{loading ? 'Checking…' : 'Run checks'}</button>
      </div>

      <div className={`system-health-summary health-${overallLevel}`}>
        <span className="system-health-pulse" aria-hidden="true" />
        <div><strong>{overallTitle}</strong><small>{overallDetail}</small></div>
        {lastCheckedAt && <time dateTime={lastCheckedAt}>Checked {new Date(lastCheckedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</time>}
      </div>

      {message && <p className="settings-v2-message">{message}</p>}

      <section className="system-health-section" aria-label="Platform health">
        <div className="system-health-section-heading"><span>PLATFORM</span><small>Failures here can stop Calibre working correctly.</small></div>
        <div className="system-health-grid system-health-grid-platform">
          {platformRows.map((row) => <div className={`system-health-row health-${row.level}`} key={row.label}><span>{row.label}</span><strong>{row.value}</strong><small>{row.detail}</small></div>)}
        </div>
      </section>

      <section className="system-health-section" aria-label="Workshop attention">
        <div className="system-health-section-heading"><span>WORKSHOP ATTENTION</span><small>Useful operational checks; amber does not mean the platform is unhealthy.</small></div>
        <div className="system-health-grid">
          {workshopRows.map((row) => <div className={`system-health-row health-${row.level}`} key={row.label}><span>{row.label}</span><strong>{row.value}</strong><small>{row.detail}</small></div>)}
        </div>
      </section>

      <p className="system-health-note">Security lint, migration-history acceptance and provider-level uptime remain deployment/admin checks because the browser cannot honestly verify them.</p>
    </article>
  )
}
