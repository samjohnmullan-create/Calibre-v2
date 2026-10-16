import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-resume-snapshot.css'

type SessionRow = { started_at: string; ended_at: string | null; paused_at: string | null; note: string }
type StepRow = { label: string; completed_at: string | null }
type FindingRow = { title: string; details: string; severity: string; status: string }
type PartNeedRow = { part_type: string; description: string; status: string }
type TimingRow = { bph: number; rate_seconds_per_day: number; beat_error_ms: number | null; position: string; checkpoint: string; recorded_at: string }
type DiagnosticCheckRow = { label: string; instructions: string; status: string }
type EventRow = { summary: string; created_at: string }
type ComponentRow = { component_key: string; component_label: string; state: string; location: string; notes: string; sequence: number }

type Snapshot = {
  session: SessionRow | null
  lastCompleted: StepRow | null
  findings: FindingRow[]
  parts: PartNeedRow[]
  timing: TimingRow | null
  diagnostic: DiagnosticCheckRow | null
  lastEvent: EventRow | null
  components: ComponentRow[]
}

function when(value: string | null) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function needsAttention(component: ComponentRow) {
  return !['installed', 'reassembled', 'not_applicable'].includes(component.state)
}

export default function WorkResumeSnapshot({
  workspaceId,
  workId,
  currentAction,
  blocker,
  refreshKey = 0,
}: {
  workspaceId: string
  workId: string
  currentAction: string
  blocker?: string
  refreshKey?: number
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ session: null, lastCompleted: null, findings: [], parts: [], timing: null, diagnostic: null, lastEvent: null, components: [] })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    if (!workspaceId || !workId) return
    setLoading(true)
    const [sessionResult, stepResult, findingResult, partResult, timingResult, diagnosticResult, eventResult, componentResult] = await Promise.all([
      supabase.from('work_sessions').select('started_at,ended_at,paused_at,note').eq('workspace_id', workspaceId).eq('work_id', workId).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('work_checklist_steps').select('label,completed_at').eq('workspace_id', workspaceId).eq('work_id', workId).in('status', ['done', 'na']).not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('work_findings').select('title,details,severity,status').eq('workspace_id', workspaceId).eq('work_id', workId).in('status', ['open', 'accepted']).order('created_at', { ascending: false }).limit(4),
      supabase.from('work_part_needs').select('part_type,description,status').eq('workspace_id', workspaceId).eq('work_record_id', workId).in('status', ['open', 'reserved']).order('created_at', { ascending: false }).limit(4),
      supabase.from('timing_runs').select('bph,rate_seconds_per_day,beat_error_ms,position,checkpoint,recorded_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('work_diagnostic_checks').select('label,instructions,status').eq('workspace_id', workspaceId).eq('work_id', workId).in('status', ['suggested', 'approved']).order('sequence', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('work_events').select('summary,created_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('work_component_states').select('component_key,component_label,state,location,notes,sequence').eq('workspace_id', workspaceId).eq('work_id', workId).order('sequence', { ascending: true }),
    ])
    setLoading(false)
    const error = sessionResult.error ?? stepResult.error ?? findingResult.error ?? partResult.error ?? timingResult.error ?? diagnosticResult.error ?? eventResult.error ?? componentResult.error
    if (error) {
      setMessage(`Resume Snapshot could not load: ${error.message}`)
      return
    }
    setSnapshot({
      session: (sessionResult.data ?? null) as SessionRow | null,
      lastCompleted: (stepResult.data ?? null) as StepRow | null,
      findings: (findingResult.data ?? []) as FindingRow[],
      parts: (partResult.data ?? []) as PartNeedRow[],
      timing: (timingResult.data ?? null) as TimingRow | null,
      diagnostic: (diagnosticResult.data ?? null) as DiagnosticCheckRow | null,
      lastEvent: (eventResult.data ?? null) as EventRow | null,
      components: (componentResult.data ?? []) as ComponentRow[],
    })
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, workId, refreshKey])

  const sessionState = useMemo(() => {
    const session = snapshot.session
    if (!session) return 'No bench session recorded yet'
    if (!session.ended_at && session.paused_at) return `Paused since ${when(session.paused_at)}`
    if (!session.ended_at) return `Active since ${when(session.started_at)}`
    return `Last session ended ${when(session.ended_at)}`
  }, [snapshot.session])

  const physicalState = useMemo(() => snapshot.components.filter(needsAttention), [snapshot.components])

  if (loading) return <section className="work-resume-snapshot loading"><span>RESUME SNAPSHOT</span><strong>Rebuilding bench context…</strong></section>

  return (
    <section className="work-resume-snapshot" aria-label="Resume Snapshot">
      <div className="work-resume-heading">
        <div><p className="eyebrow">RESUME SNAPSHOT</p><h3>Pick up where you left off</h3></div>
        <span>{sessionState}</span>
      </div>

      {message && <p className="work-resume-message">{message}</p>}

      <div className="work-resume-primary">
        <div><span>NEXT WORKSHOP ACTION</span><strong>{currentAction || 'Review the current job state'}</strong></div>
        {blocker && <div className="blocked"><span>BLOCKER</span><strong>{blocker}</strong></div>}
      </div>

      <div className="work-resume-grid">
        <article><span>LAST COMPLETED</span><strong>{snapshot.lastCompleted?.label || 'Nothing completed yet'}</strong><small>{snapshot.lastCompleted?.completed_at ? when(snapshot.lastCompleted.completed_at) : '—'}</small></article>
        <article><span>LAST ACTIVITY</span><strong>{snapshot.lastEvent?.summary || snapshot.session?.note || 'No workshop activity recorded'}</strong><small>{snapshot.lastEvent ? when(snapshot.lastEvent.created_at) : snapshot.session ? when(snapshot.session.started_at) : '—'}</small></article>
        <article><span>OPEN FINDINGS</span><strong>{snapshot.findings.length}</strong><small>{snapshot.findings[0] ? `${titleCase(snapshot.findings[0].severity)} · ${snapshot.findings[0].title}` : 'None open'}</small></article>
        <article><span>PARTS WAITING</span><strong>{snapshot.parts.length}</strong><small>{snapshot.parts[0] ? `${snapshot.parts[0].part_type || 'Part'} · ${titleCase(snapshot.parts[0].status)}` : 'No open part needs'}</small></article>
        <article><span>LATEST TIMING</span><strong>{snapshot.timing ? `${Number(snapshot.timing.rate_seconds_per_day) >= 0 ? '+' : ''}${Number(snapshot.timing.rate_seconds_per_day)} s/day` : 'No timing run'}</strong><small>{snapshot.timing ? `${snapshot.timing.bph} BPH · ${snapshot.timing.beat_error_ms ?? '—'} ms · ${titleCase(snapshot.timing.checkpoint)}` : '—'}</small></article>
        <article><span>QUEUED DIAGNOSTIC</span><strong>{snapshot.diagnostic?.label || 'None queued'}</strong><small>{snapshot.diagnostic?.instructions || '—'}</small></article>
      </div>

      <div className="work-resume-physical">
        <div className="work-resume-physical-heading"><span>PHYSICAL STATE</span><strong>{snapshot.components.length ? `${physicalState.length} component${physicalState.length === 1 ? '' : 's'} out / open` : 'Not recorded yet'}</strong></div>
        {physicalState.length > 0 ? (
          <div className="work-resume-physical-list">
            {physicalState.map((component) => <span key={component.component_key}><strong>{component.component_label}</strong> · {titleCase(component.state)}{component.location ? ` · ${component.location}` : ''}</span>)}
          </div>
        ) : snapshot.components.length > 0 ? <small>Recorded components are installed, reassembled or not applicable.</small> : <small>Use Components & trays below to record removals, open assemblies and tray locations.</small>}
      </div>
    </section>
  )
}
