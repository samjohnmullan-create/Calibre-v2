import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type HealthLevel = 'good' | 'attention' | 'unknown'
type HealthRow = { label: string; value: string; detail: string; level: HealthLevel }

type Props = {
  workspaceId: string
  lastStructuredExport: string
  lastStorageExport: string
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

export default function SystemHealthPanel({ workspaceId, lastStructuredExport, lastStorageExport }: Props) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [databaseOk, setDatabaseOk] = useState(false)
  const [latestAudit, setLatestAudit] = useState('')
  const [activeSessions, setActiveSessions] = useState(0)
  const [openReceivingExceptions, setOpenReceivingExceptions] = useState(0)
  const [waitingWork, setWaitingWork] = useState(0)
  const [unassigned, setUnassigned] = useState({ items: 0, parts: 0, tools: 0, consumables: 0 })

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setMessage('')

    const [
      workspaceResult,
      auditResult,
      sessionResult,
      exceptionResult,
      waitingResult,
      itemsResult,
      partsResult,
      toolsResult,
      consumablesResult,
    ] = await Promise.all([
      supabase.from('workspaces').select('id').eq('id', workspaceId).maybeSingle(),
      supabase.from('audit_events').select('created_at').eq('workspace_id', workspaceId).order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('work_sessions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('ended_at', null),
      supabase.from('purchase_receiving_exceptions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'open'),
      supabase.from('work_records').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'waiting'),
      supabase.from('items').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
      supabase.from('parts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
      supabase.from('tools').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
      supabase.from('consumables').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('archived_at', null).is('storage_location_id', null),
    ])

    setLoading(false)
    const error = workspaceResult.error ?? auditResult.error ?? sessionResult.error ?? exceptionResult.error ?? waitingResult.error ?? itemsResult.error ?? partsResult.error ?? toolsResult.error ?? consumablesResult.error
    if (error) {
      setDatabaseOk(Boolean(workspaceResult.data && !workspaceResult.error))
      setMessage(`System health could not be fully verified: ${error.message}`)
      return
    }

    setDatabaseOk(Boolean(workspaceResult.data))
    setLatestAudit(auditResult.data?.created_at ?? '')
    setActiveSessions(sessionResult.count ?? 0)
    setOpenReceivingExceptions(exceptionResult.count ?? 0)
    setWaitingWork(waitingResult.count ?? 0)
    setUnassigned({
      items: itemsResult.count ?? 0,
      parts: partsResult.count ?? 0,
      tools: toolsResult.count ?? 0,
      consumables: consumablesResult.count ?? 0,
    })
  }

  useEffect(() => { void load() }, [workspaceId])

  const structuredBackup = useMemo(() => backupAgeLabel(lastStructuredExport), [lastStructuredExport])
  const storageBackup = useMemo(() => backupAgeLabel(lastStorageExport), [lastStorageExport])
  const totalUnassigned = unassigned.items + unassigned.parts + unassigned.tools + unassigned.consumables

  const rows: HealthRow[] = [
    {
      label: 'Database & workspace',
      value: databaseOk ? 'Connected' : 'Not verified',
      detail: databaseOk ? 'Current workspace is reachable under the signed-in user.' : 'Connection could not be confirmed.',
      level: databaseOk ? 'good' : 'unknown',
    },
    {
      label: 'Audit trail',
      value: latestAudit ? `Latest ${new Date(latestAudit).toLocaleString('en-AU')}` : 'No event recorded',
      detail: latestAudit ? 'Database-level audit history is readable.' : 'No audit event is currently visible for this workspace.',
      level: latestAudit ? 'good' : 'attention',
    },
    {
      label: 'Active Bench sessions',
      value: String(activeSessions),
      detail: activeSessions ? 'A hands-on Bench session is currently open.' : 'No active Bench session.',
      level: activeSessions > 1 ? 'attention' : 'good',
    },
    {
      label: 'Receiving exceptions',
      value: String(openReceivingExceptions),
      detail: openReceivingExceptions ? 'Open Purchase receiving exceptions need a decision.' : 'No open receiving exceptions.',
      level: openReceivingExceptions ? 'attention' : 'good',
    },
    {
      label: 'Waiting Work',
      value: String(waitingWork),
      detail: waitingWork ? 'Work is intentionally blocked or waiting for something.' : 'No Work records are waiting.',
      level: waitingWork ? 'attention' : 'good',
    },
    {
      label: 'Needs put-away',
      value: String(totalUnassigned),
      detail: `${unassigned.items} Items · ${unassigned.parts} Parts · ${unassigned.tools} Tools · ${unassigned.consumables} Consumables`,
      level: totalUnassigned ? 'attention' : 'good',
    },
    {
      label: 'Structured backup',
      value: structuredBackup.value,
      detail: structuredBackup.detail,
      level: structuredBackup.level,
    },
    {
      label: 'Storage archive',
      value: storageBackup.value,
      detail: storageBackup.detail,
      level: storageBackup.level,
    },
  ]

  return (
    <article className="settings-v2-card settings-v2-card-primary system-health-card">
      <div className="system-health-heading">
        <div><p className="eyebrow">SYSTEM HEALTH</p><h2>What Calibre can verify right now</h2><p className="muted">Live checks only. Attention means something needs review; it does not automatically mean the system is broken.</p></div>
        <button type="button" className="secondary" disabled={loading || !workspaceId} onClick={() => void load()}>{loading ? 'Checking…' : 'Run checks'}</button>
      </div>
      {message && <p className="settings-v2-message">{message}</p>}
      <div className="system-health-grid">
        {rows.map((row) => <div className={`system-health-row health-${row.level}`} key={row.label}><span>{row.label}</span><strong>{row.value}</strong><small>{row.detail}</small></div>)}
      </div>
      <p className="system-health-note">Security lint and migration-history acceptance are tracked separately because the browser cannot honestly verify them.</p>
    </article>
  )
}
