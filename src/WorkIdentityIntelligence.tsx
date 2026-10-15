import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-identity-intelligence.css'

type IdentificationBasis = {
  type?: string
  status?: string
  note?: string
  candidate_label?: string
  confidence?: string
  score?: number
  reasons?: string[]
  source_count?: number
  evidence_grade?: string
  at?: string
}

type PassportIdentity = {
  movement_maker: string
  calibre: string
  calibre_family: string
  jewels: number | null
  beat_rate: number | null
  power_reserve_hours: number | null
  escapement: string
  movement_diameter_mm: number | null
  movement_type: string
  knowledge_movement_id: string | null
  movement_identification_status: string
  movement_identification_confidence: string
  movement_identification_basis: IdentificationBasis[]
}

type IntelligenceCheck = {
  id: string
  label: string
  description: string
  status: string
  answer_value: string
  result_text: string
  recommendation_why: string
  problem_finding_id: string | null
}

type Finding = {
  id: string
  title: string
  details: string
  severity: string
  status: string
}

function pretty(value: string) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Unknown'
}

function display(value: string | number | null | undefined, suffix = '') {
  if (value === null || value === undefined || value === '') return '—'
  return `${value}${suffix}`
}

export default function WorkIdentityIntelligence({
  workspaceId,
  itemId,
  workId,
  refreshKey = 0,
  onChanged,
}: {
  workspaceId: string
  itemId: string
  workId: string
  refreshKey?: number
  onChanged?: () => void | Promise<void>
}) {
  const [passport, setPassport] = useState<PassportIdentity | null>(null)
  const [checks, setChecks] = useState<IntelligenceCheck[]>([])
  const [findings, setFindings] = useState<Record<string, Finding>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    if (!workspaceId || !itemId || !workId) return
    setLoading(true)
    setMessage('')

    const [passportResult, checkResult] = await Promise.all([
      supabase.from('passports')
        .select('movement_maker,calibre,calibre_family,jewels,beat_rate,power_reserve_hours,escapement,movement_diameter_mm,movement_type,knowledge_movement_id,movement_identification_status,movement_identification_confidence,movement_identification_basis')
        .eq('workspace_id', workspaceId)
        .eq('item_id', itemId)
        .maybeSingle(),
      supabase.from('work_step_checks')
        .select('id,label,description,status,answer_value,result_text,recommendation_why,problem_finding_id')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .eq('origin_kind', 'movement_knowledge')
        .order('created_at', { ascending: true }),
    ])

    const error = passportResult.error ?? checkResult.error
    if (error) {
      setLoading(false)
      setMessage(`Identity intelligence could not load: ${error.message}`)
      return
    }

    const nextPassport = passportResult.data
      ? {
          ...(passportResult.data as Omit<PassportIdentity, 'movement_identification_basis'>),
          movement_identification_basis: Array.isArray(passportResult.data.movement_identification_basis)
            ? passportResult.data.movement_identification_basis as IdentificationBasis[]
            : [],
        }
      : null
    const nextChecks = (checkResult.data ?? []) as IntelligenceCheck[]
    setPassport(nextPassport)
    setChecks(nextChecks)

    const findingIds = [...new Set(nextChecks.map((row) => row.problem_finding_id).filter(Boolean))] as string[]
    if (findingIds.length) {
      const findingResult = await supabase.from('work_findings')
        .select('id,title,details,severity,status')
        .eq('workspace_id', workspaceId)
        .eq('work_id', workId)
        .in('id', findingIds)
      if (findingResult.error) {
        setMessage(`Identity findings could not load: ${findingResult.error.message}`)
        setFindings({})
      } else {
        setFindings(Object.fromEntries(((findingResult.data ?? []) as Finding[]).map((row) => [row.id, row])))
      }
    } else {
      setFindings({})
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, refreshKey])

  const latestBasis = useMemo(() => passport?.movement_identification_basis?.at(-1) ?? null, [passport])
  const canPromote = Boolean(passport?.knowledge_movement_id) && !['confirmed', 'rejected'].includes(passport?.movement_identification_status ?? '')
  const meaningfulChecks = useMemo(() => checks.filter((check) => check.status !== 'not_started' || check.answer_value || check.result_text || check.problem_finding_id), [checks])

  async function setIdentityStatus(status: 'probable' | 'confirmed') {
    if (!passport?.knowledge_movement_id || busy) return
    setBusy(true)
    setMessage(`Updating movement identity to ${status}…`)
    const { error } = await supabase.rpc('set_passport_movement_identification_state', {
      p_workspace_id: workspaceId,
      p_item_id: itemId,
      p_status: status,
      p_note: note.trim(),
    })
    setBusy(false)
    if (error) {
      setMessage(`Movement identity could not update: ${error.message}`)
      return
    }
    setNote('')
    setMessage(status === 'confirmed' ? 'Movement identity confirmed from the Job Card.' : 'Movement identity marked Probable from the Job Card.')
    await load()
    await onChanged?.()
  }

  if (!loading && !message && !passport && checks.length === 0) return null

  return (
    <section className="section-card job-identity-intelligence">
      <div className="job-identity-heading">
        <div>
          <p className="eyebrow">IDENTITY & CALIBRE INTELLIGENCE</p>
          <h3>{passport ? `${passport.movement_maker || 'Unknown maker'} ${passport.calibre || ''}`.trim() : 'Movement identity not recorded'}</h3>
          <p className="muted">Live Job Card view of Passport identity and sourced movement-specific workshop evidence. Changes here use the same underlying records as Passport and Bench Mode.</p>
        </div>
        {passport && <div className="job-identity-badges"><span>{pretty(passport.movement_identification_status)}</span><span>{pretty(passport.movement_identification_confidence)} confidence</span></div>}
      </div>

      {loading && <p className="muted">Loading identity intelligence…</p>}
      {message && <p className={`job-identity-message ${message.includes('could not') ? 'error' : ''}`}>{message}</p>}

      {!loading && passport && <>
        <div className="job-identity-facts">
          <div><span>Maker</span><strong>{display(passport.movement_maker)}</strong></div>
          <div><span>Calibre</span><strong>{display(passport.calibre)}</strong></div>
          <div><span>Family</span><strong>{display(passport.calibre_family)}</strong></div>
          <div><span>Type</span><strong>{display(passport.movement_type)}</strong></div>
          <div><span>Jewels</span><strong>{display(passport.jewels)}</strong></div>
          <div><span>Beat rate</span><strong>{display(passport.beat_rate, ' BPH')}</strong></div>
          <div><span>Diameter</span><strong>{display(passport.movement_diameter_mm, ' mm')}</strong></div>
          <div><span>Escapement</span><strong>{display(passport.escapement)}</strong></div>
        </div>

        {latestBasis && <div className="job-identity-basis">
          <strong>Latest identity evidence</strong>
          <p>{latestBasis.candidate_label || pretty(latestBasis.status || latestBasis.type || 'Recorded identity evidence')}</p>
          <div>{latestBasis.reasons?.map((reason) => <span key={reason}>{reason}</span>)}</div>
          <small>{[latestBasis.evidence_grade && pretty(latestBasis.evidence_grade), latestBasis.source_count !== undefined && `${latestBasis.source_count} source${latestBasis.source_count === 1 ? '' : 's'}`, latestBasis.note].filter(Boolean).join(' · ')}</small>
        </div>}

        {canPromote && <div className="job-identity-review">
          <label>Watchmaker identity note<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Independent clue you verified: marking, bridge layout, exact dimensions, trusted reference…" /></label>
          <div>
            {passport.movement_identification_status !== 'probable' && <button type="button" className="secondary" onClick={() => void setIdentityStatus('probable')} disabled={busy}>{busy ? 'Updating…' : 'Mark probable'}</button>}
            <button type="button" onClick={() => void setIdentityStatus('confirmed')} disabled={busy}>{busy ? 'Updating…' : 'Confirm identity'}</button>
          </div>
        </div>}
      </>}

      {!loading && checks.length > 0 && <div className="job-identity-evidence">
        <div className="job-identity-evidence-heading"><strong>Movement-specific job evidence</strong><span>{checks.length} check{checks.length === 1 ? '' : 's'}</span></div>
        {meaningfulChecks.length === 0 ? <p className="muted">Movement-specific checks are scheduled, but no results have been recorded yet.</p> : meaningfulChecks.map((check) => {
          const finding = check.problem_finding_id ? findings[check.problem_finding_id] : null
          const result = check.result_text || check.answer_value
          return <article key={check.id}>
            <div><strong>{check.label}</strong><span>{pretty(check.status)}</span></div>
            {check.description && <p>{check.description}</p>}
            {result && <p><b>Recorded result:</b> {result}</p>}
            {check.recommendation_why && <small>{check.recommendation_why}</small>}
            {finding && <div className="job-identity-finding"><span>Finding · {pretty(finding.severity)}</span><strong>{finding.title}</strong>{finding.details && <p>{finding.details}</p>}</div>}
          </article>
        })}
      </div>}
    </section>
  )
}
