import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-movement-guidance.css'

type GuidanceRow = {
  id: string
  movement_id: string
  step_key: string
  guidance_type: string
  title: string
  instruction: string
  inject_as_check: boolean
  source_id: string
  reference_text: string
  evidence_grade: string
  verification_status: string
  sequence: number
}

type SourceRow = {
  id: string
  title: string
  publisher: string
  url: string
  reliability: string
  reference_text: string
}

type PassportState = {
  knowledge_movement_id: string | null
  movement_identification_status: string
  movement_identification_confidence: string
}

function pretty(value: string) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Unknown'
}

export default function BenchMovementGuidance({
  workspaceId,
  itemId,
  workId,
  checklistStepId,
  refreshKey = 0,
  onChanged,
}: {
  workspaceId: string
  itemId: string
  workId: string
  checklistStepId: string
  refreshKey?: number
  onChanged?: () => void | Promise<void>
}) {
  const [passport, setPassport] = useState<PassportState | null>(null)
  const [movementLabel, setMovementLabel] = useState('')
  const [guidance, setGuidance] = useState<GuidanceRow[]>([])
  const [sources, setSources] = useState<Record<string, SourceRow>>({})
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!workspaceId || !itemId || !workId || !checklistStepId) return
    setLoading(true)
    setMessage('')

    const [passportResult, stepResult, addedResult] = await Promise.all([
      supabase.from('passports')
        .select('knowledge_movement_id,movement_identification_status,movement_identification_confidence')
        .eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('work_checklist_steps')
        .select('step_key')
        .eq('workspace_id', workspaceId).eq('work_id', workId).eq('id', checklistStepId).maybeSingle(),
      supabase.from('work_step_checks')
        .select('source_movement_guidance_id')
        .eq('workspace_id', workspaceId).eq('work_id', workId)
        .not('source_movement_guidance_id', 'is', null),
    ])

    const firstError = passportResult.error ?? stepResult.error ?? addedResult.error
    if (firstError) {
      setLoading(false)
      setMessage(`Movement guidance could not load: ${firstError.message}`)
      return
    }

    const nextPassport = passportResult.data as PassportState | null
    setPassport(nextPassport)
    setAddedIds(new Set((addedResult.data ?? []).map((row) => String(row.source_movement_guidance_id ?? '')).filter(Boolean)))

    if (!nextPassport?.knowledge_movement_id || !stepResult.data?.step_key) {
      setGuidance([])
      setMovementLabel('')
      setSources({})
      setLoading(false)
      return
    }

    const [movementResult, guidanceResult] = await Promise.all([
      supabase.from('knowledge_movements').select('maker,calibre').eq('id', nextPassport.knowledge_movement_id).maybeSingle(),
      supabase.from('knowledge_movement_guidance')
        .select('id,movement_id,step_key,guidance_type,title,instruction,inject_as_check,source_id,reference_text,evidence_grade,verification_status,sequence')
        .eq('movement_id', nextPassport.knowledge_movement_id)
        .eq('step_key', stepResult.data.step_key)
        .eq('active', true)
        .order('sequence', { ascending: true }),
    ])

    if (movementResult.error || guidanceResult.error) {
      setLoading(false)
      setMessage(`Movement guidance could not load: ${movementResult.error?.message ?? guidanceResult.error?.message}`)
      return
    }

    const rows = (guidanceResult.data ?? []) as GuidanceRow[]
    setMovementLabel(movementResult.data ? `${movementResult.data.maker} ${movementResult.data.calibre}`.trim() : '')
    setGuidance(rows)

    const sourceIds = [...new Set(rows.map((row) => row.source_id).filter(Boolean))]
    if (sourceIds.length) {
      const { data: sourceData, error: sourceError } = await supabase.from('knowledge_sources')
        .select('id,title,publisher,url,reliability,reference_text')
        .in('id', sourceIds)
      if (!sourceError) {
        const map: Record<string, SourceRow> = {}
        for (const row of (sourceData ?? []) as SourceRow[]) map[row.id] = row
        setSources(map)
      }
    } else {
      setSources({})
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, checklistStepId, refreshKey])

  const canInject = passport?.movement_identification_status === 'probable' || passport?.movement_identification_status === 'confirmed'
  const visible = useMemo(() => guidance, [guidance])

  async function addCheck(row: GuidanceRow) {
    if (!canInject || busyId) return
    setBusyId(row.id)
    setMessage('Adding sourced movement check to this job…')
    const { error } = await supabase.rpc('schedule_movement_guidance_check', {
      p_workspace_id: workspaceId,
      p_work_id: workId,
      p_guidance_id: row.id,
    })
    setBusyId('')
    if (error) {
      setMessage(`Movement check could not be added: ${error.message}`)
      return
    }
    setMessage('Movement-specific check added to the guided procedure.')
    await load()
    await onChanged?.()
  }

  if (!loading && !message && visible.length === 0) return null

  return <section className="bench-movement-guidance">
    <div className="bench-movement-guidance-heading">
      <div><p className="eyebrow">MOVEMENT INTELLIGENCE</p><strong>{movementLabel || 'Current movement'} · current-stage guidance</strong></div>
      {passport && <span>{pretty(passport.movement_identification_status)} · {pretty(passport.movement_identification_confidence)} confidence</span>}
    </div>

    {loading && <p className="bench-movement-guidance-message">Checking sourced guidance for this stage…</p>}
    {message && <p className={`bench-movement-guidance-message ${message.includes('could not') ? 'error' : ''}`}>{message}</p>}

    {!loading && visible.length > 0 && <div className="bench-movement-guidance-list">
      {visible.map((row) => {
        const source = sources[row.source_id]
        const added = addedIds.has(row.id)
        return <article key={row.id}>
          <header>
            <div><span>{pretty(row.guidance_type)}</span><strong>{row.title}</strong></div>
            <em>{pretty(row.evidence_grade)}</em>
          </header>
          <p>{row.instruction}</p>
          <div className="bench-movement-guidance-source">
            <span>Source</span>
            <strong>{source?.title || 'Knowledge source'}</strong>
            {(row.reference_text || source?.reference_text) && <small>{row.reference_text || source?.reference_text}</small>}
            {source?.publisher && <small>{source.publisher}</small>}
            {source?.url && <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>}
          </div>
          {row.inject_as_check && <div className="bench-movement-guidance-action">
            {added ? <span>Added to job</span> : <button type="button" onClick={() => void addCheck(row)} disabled={!canInject || busyId === row.id}>{busyId === row.id ? 'Adding…' : 'Add to job'}</button>}
            {!canInject && <small>Promote the linked movement to Probable or Confirmed before this movement-specific check can affect the job.</small>}
          </div>}
        </article>
      })}
    </div>}
  </section>
}
