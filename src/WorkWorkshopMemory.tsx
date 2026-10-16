import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-workshop-memory.css'

type MemoryRow = {
  memory_kind: 'repair_outcome' | 'timing_outcome' | 'part_fit' | 'recurring_finding' | string
  title: string
  summary: string
  detail: string
  evidence_label: string
  evidence_strength: number
  source_work_id: string
  source_item_id: string
  source_work_number: number
  source_item_number: number
  recorded_at: string | null
}

type PassportState = {
  movement_maker: string
  calibre: string
  knowledge_movement_id: string | null
  movement_identification_status: string
}

function pretty(value: string) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown'
}

export default function WorkWorkshopMemory({
  workspaceId,
  itemId,
  workId,
  refreshKey = 0,
}: {
  workspaceId: string
  itemId: string
  workId: string
  refreshKey?: number
}) {
  const [rows, setRows] = useState<MemoryRow[]>([])
  const [passport, setPassport] = useState<PassportState | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isTest, setIsTest] = useState(false)

  async function load() {
    if (!workspaceId || !itemId || !workId) return
    setLoading(true)
    setMessage('')

    const [workResult, passportResult] = await Promise.all([
      supabase.from('work_records').select('data_mode').eq('workspace_id', workspaceId).eq('id', workId).maybeSingle(),
      supabase.from('passports')
        .select('movement_maker,calibre,knowledge_movement_id,movement_identification_status')
        .eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
    ])

    const firstError = workResult.error ?? passportResult.error
    if (firstError) {
      setLoading(false)
      setMessage(`Workshop Memory could not load: ${firstError.message}`)
      return
    }

    const testMode = workResult.data?.data_mode === 'test'
    setIsTest(testMode)
    setPassport((passportResult.data ?? null) as PassportState | null)
    if (testMode) {
      setRows([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase.rpc('get_workshop_memory', {
      p_workspace_id: workspaceId,
      p_item_id: itemId,
      p_work_id: workId,
      p_limit: 20,
    })
    setLoading(false)
    if (error) {
      setRows([])
      setMessage(`Workshop Memory could not load: ${error.message}`)
      return
    }
    setRows((data ?? []) as MemoryRow[])
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, refreshKey])

  const grouped = useMemo(() => ({
    repair: rows.filter((row) => row.memory_kind === 'repair_outcome'),
    fit: rows.filter((row) => row.memory_kind === 'part_fit'),
    timing: rows.filter((row) => row.memory_kind === 'timing_outcome'),
    recurring: rows.filter((row) => row.memory_kind === 'recurring_finding'),
  }), [rows])

  if (isTest) return null

  const movementLabel = passport ? [passport.movement_maker, passport.calibre].filter(Boolean).join(' ') : ''

  return <section className="section-card workshop-memory-card">
    <div className="workshop-memory-heading">
      <div>
        <p className="eyebrow">WORKSHOP MEMORY</p>
        <h3>{movementLabel ? `What Calibre remembers about ${movementLabel}` : 'What Calibre has learned before'}</h3>
        <p className="muted">Only proven Real Work history is surfaced here. The current job never teaches itself.</p>
      </div>
      {rows.length > 0 && <span>{rows.length} memory {rows.length === 1 ? 'signal' : 'signals'}</span>}
    </div>

    {loading && <p className="workshop-memory-message">Checking prior verified workshop history…</p>}
    {message && <p className="workshop-memory-message error">{message}</p>}

    {!loading && !passport?.knowledge_movement_id && <div className="workshop-memory-empty">
      <strong>Movement identity needed</strong>
      <p>Link a Knowledge movement and mark it Probable or Confirmed before Calibre can compare workshop history.</p>
    </div>}

    {!loading && passport?.knowledge_movement_id && !['probable','confirmed'].includes(passport.movement_identification_status) && <div className="workshop-memory-empty">
      <strong>Identity still needs verification</strong>
      <p>Workshop Memory waits until the movement identity is Probable or Confirmed.</p>
    </div>}

    {!loading && passport?.knowledge_movement_id && ['probable','confirmed'].includes(passport.movement_identification_status) && rows.length === 0 && <div className="workshop-memory-empty">
      <strong>No proven history yet</strong>
      <p>This is expected early on. Completed Real jobs and confirmed fit evidence will begin building memory automatically.</p>
    </div>}

    {!loading && rows.length > 0 && <div className="workshop-memory-list">
      {rows.map((row) => <article key={`${row.memory_kind}-${row.source_work_id}-${row.recorded_at ?? row.title}`} className={`memory-${row.memory_kind}`}>
        <div className="workshop-memory-row-head">
          <div><span>{pretty(row.memory_kind)}</span><strong>{row.title}</strong></div>
          <em>{row.evidence_strength}%</em>
        </div>
        {row.summary && <p>{row.summary}</p>}
        {row.detail && <small>{row.detail}</small>}
        <div className="workshop-memory-evidence">
          <strong>{row.evidence_label}</strong>
          <span>Work #{row.source_work_number} · Item #{row.source_item_number}</span>
          {row.recorded_at && <span>{new Date(row.recorded_at).toLocaleDateString('en-AU')}</span>}
        </div>
      </article>)}
    </div>}

    {!loading && rows.length > 0 && <div className="workshop-memory-summary">
      <span>{grouped.repair.length} repair outcome{grouped.repair.length === 1 ? '' : 's'}</span>
      <span>{grouped.fit.length} fit result{grouped.fit.length === 1 ? '' : 's'}</span>
      <span>{grouped.timing.length} timing result{grouped.timing.length === 1 ? '' : 's'}</span>
      <span>{grouped.recurring.length} recurring pattern{grouped.recurring.length === 1 ? '' : 's'}</span>
    </div>}
  </section>
}
