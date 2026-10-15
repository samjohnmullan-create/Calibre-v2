import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-knowledge-v2.css'

type PassportRow = {
  movement_maker: string
  calibre: string
  calibre_family: string
  knowledge_movement_id: string | null
  movement_identification_status: string
}
type WorkRow = { blocker: string; diagnosis: string }
type NeedRow = { id: string; part_type: string; description: string; status: string }
type MovementRow = {
  id: string
  maker: string
  calibre: string
  calibre_family: string
  diameter_mm: number | null
  height_mm: number | null
  jewels: number | null
  bph: number | null
  escapement: string
  winding: string
  power_reserve_hours: number | null
  lift_angle_deg: number | null
  layout: string
  notes: string
  primary_source_id: string | null
  origin_kind: string
  verification_status: string
  evidence_grade: string
}
type MovementSourceRow = { source_id: string; evidence_class: string; reference_text: string; notes: string }
type SourceRow = { id: string; title: string; source_type: string; publisher: string; url: string; reference_text: string; reliability: string; verification_status: string; origin_kind: string }
type DocRow = { id: string; title: string; document_type: string; url: string; reference_text: string; source_id: string | null; notes: string; verification_status: string; origin_kind: string }
type ApplicationRow = { id: string; part_ref_id: string; evidence_class: string; source_id: string | null; notes: string; confidence: number | null; condition_text: string; verification_status: string; origin_kind: string }
type PartRefRow = { id: string; manufacturer: string; part_type: string; part_reference: string; description: string; source_id: string | null; notes: string; verification_status: string; evidence_grade: string; origin_kind: string }

type Suggestion = {
  key: string
  kind: 'movement' | 'document' | 'part'
  level: string
  title: string
  detail: string
  relation: string
  source?: SourceRow | null
  url?: string
}

const text = (value: unknown) => String(value ?? '').trim()
const norm = (value: unknown) => text(value).toLowerCase().replace(/[\s._/\-]+/g, '')
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function evidenceLabel(grade: string, verification: string, linked = false) {
  if (linked) return 'Linked movement record'
  if (grade) return titleCase(grade)
  if (verification) return titleCase(verification)
  return 'Knowledge record'
}

function movementSpecs(row: MovementRow) {
  return [
    row.bph ? `${row.bph} BPH` : '',
    row.jewels != null ? `${row.jewels} jewels` : '',
    row.lift_angle_deg != null ? `${Number(row.lift_angle_deg)}° lift` : '',
    row.power_reserve_hours != null ? `${Number(row.power_reserve_hours)} h reserve` : '',
    row.diameter_mm != null ? `${Number(row.diameter_mm)} mm diameter` : '',
    row.height_mm != null ? `${Number(row.height_mm)} mm height` : '',
    row.escapement,
    row.winding,
  ].filter(Boolean).join(' · ')
}

function matchesNeed(part: PartRefRow, need: NeedRow) {
  const needle = norm(need.part_type || need.description)
  if (!needle) return true
  const hay = [part.part_type, part.description, part.part_reference].map(norm).filter(Boolean)
  return hay.some((value) => value.includes(needle) || needle.includes(value))
}

export default function BenchKnowledgePanel({ workspaceId, itemId, workId, refreshKey = 0 }: { workspaceId: string; itemId: string; workId: string; refreshKey?: number }) {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [passport, setPassport] = useState<PassportRow | null>(null)
  const [work, setWork] = useState<WorkRow | null>(null)
  const [movement, setMovement] = useState<MovementRow | null>(null)
  const [movementLinked, setMovementLinked] = useState(false)
  const [needs, setNeeds] = useState<NeedRow[]>([])
  const [movementSources, setMovementSources] = useState<MovementSourceRow[]>([])
  const [sources, setSources] = useState<Map<string, SourceRow>>(new Map())
  const [documents, setDocuments] = useState<DocRow[]>([])
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [partRefs, setPartRefs] = useState<Map<string, PartRefRow>>(new Map())

  async function load() {
    if (!workspaceId || !itemId || !workId) return
    setLoading(true)
    setMessage('')

    const [passportResult, workResult, needsResult] = await Promise.all([
      supabase.from('passports').select('movement_maker,calibre,calibre_family,knowledge_movement_id,movement_identification_status').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle(),
      supabase.from('work_records').select('blocker,diagnosis').eq('workspace_id', workspaceId).eq('id', workId).maybeSingle(),
      supabase.from('work_part_needs').select('id,part_type,description,status').eq('workspace_id', workspaceId).eq('work_record_id', workId),
    ])
    const baseError = passportResult.error ?? workResult.error ?? needsResult.error
    if (baseError) {
      setLoading(false)
      setMessage(`Bench Knowledge could not load: ${baseError.message}`)
      return
    }

    const nextPassport = (passportResult.data ?? null) as PassportRow | null
    const nextWork = (workResult.data ?? null) as WorkRow | null
    const nextNeeds = ((needsResult.data ?? []) as NeedRow[]).filter((need) => ['open', 'reserved'].includes(String(need.status).toLowerCase()))
    setPassport(nextPassport)
    setWork(nextWork)
    setNeeds(nextNeeds)

    if (!nextPassport?.calibre && !nextPassport?.knowledge_movement_id) {
      setMovement(null)
      setMovementLinked(false)
      setMovementSources([])
      setSources(new Map())
      setDocuments([])
      setApplications([])
      setPartRefs(new Map())
      setLoading(false)
      setMessage('Record a movement calibre in the Passport to unlock sourced Bench Knowledge.')
      return
    }

    let movementResult
    let linked = false
    if (nextPassport.knowledge_movement_id) {
      movementResult = await supabase.from('knowledge_movements').select('id,maker,calibre,calibre_family,diameter_mm,height_mm,jewels,bph,escapement,winding,power_reserve_hours,lift_angle_deg,layout,notes,primary_source_id,origin_kind,verification_status,evidence_grade').eq('id', nextPassport.knowledge_movement_id).maybeSingle()
      linked = Boolean(movementResult.data)
    } else {
      let query = supabase.from('knowledge_movements').select('id,maker,calibre,calibre_family,diameter_mm,height_mm,jewels,bph,escapement,winding,power_reserve_hours,lift_angle_deg,layout,notes,primary_source_id,origin_kind,verification_status,evidence_grade').ilike('calibre', nextPassport.calibre).limit(8)
      if (nextPassport.movement_maker) query = query.ilike('maker', nextPassport.movement_maker)
      const result = await query
      const rows = ((result.data ?? []) as MovementRow[]).sort((a, b) => {
        const score = (row: MovementRow) => (row.evidence_grade === 'documented' ? 20 : 0) + (row.verification_status === 'reviewed' ? 10 : 0)
        return score(b) - score(a)
      })
      movementResult = { data: rows[0] ?? null, error: result.error }
    }

    if (movementResult.error) {
      setLoading(false)
      setMessage(`Movement Knowledge could not load: ${movementResult.error.message}`)
      return
    }

    const nextMovement = (movementResult.data ?? null) as MovementRow | null
    setMovement(nextMovement)
    setMovementLinked(linked)
    if (!nextMovement) {
      setMovementSources([])
      setSources(new Map())
      setDocuments([])
      setApplications([])
      setPartRefs(new Map())
      setLoading(false)
      setMessage('No exact sourced movement record matched the Passport maker/calibre.')
      return
    }

    const [movementSourceResult, docResult, applicationResult] = await Promise.all([
      supabase.from('knowledge_movement_sources').select('source_id,evidence_class,reference_text,notes').eq('movement_id', nextMovement.id),
      supabase.from('knowledge_technical_documents').select('id,title,document_type,url,reference_text,source_id,notes,verification_status,origin_kind').eq('movement_id', nextMovement.id).limit(8),
      supabase.from('knowledge_part_applications').select('id,part_ref_id,evidence_class,source_id,notes,confidence,condition_text,verification_status,origin_kind').eq('movement_id', nextMovement.id).limit(100),
    ])
    const knowledgeError = movementSourceResult.error ?? docResult.error ?? applicationResult.error
    if (knowledgeError) {
      setLoading(false)
      setMessage(`Related Knowledge could not load: ${knowledgeError.message}`)
      return
    }

    const nextMovementSources = (movementSourceResult.data ?? []) as MovementSourceRow[]
    const nextDocuments = (docResult.data ?? []) as DocRow[]
    const nextApplications = (applicationResult.data ?? []) as ApplicationRow[]
    setMovementSources(nextMovementSources)
    setDocuments(nextDocuments)
    setApplications(nextApplications)

    const partIds = [...new Set(nextApplications.map((row) => row.part_ref_id).filter(Boolean))]
    let nextParts: PartRefRow[] = []
    if (partIds.length) {
      const partResult = await supabase.from('knowledge_part_refs').select('id,manufacturer,part_type,part_reference,description,source_id,notes,verification_status,evidence_grade,origin_kind').in('id', partIds)
      if (partResult.error) {
        setLoading(false)
        setMessage(`Part references could not load: ${partResult.error.message}`)
        return
      }
      nextParts = (partResult.data ?? []) as PartRefRow[]
    }
    setPartRefs(new Map(nextParts.map((part) => [part.id, part])))

    const sourceIds = [...new Set([
      nextMovement.primary_source_id,
      ...nextMovementSources.map((row) => row.source_id),
      ...nextDocuments.map((row) => row.source_id),
      ...nextApplications.map((row) => row.source_id),
      ...nextParts.map((row) => row.source_id),
    ].filter(Boolean) as string[])]
    let nextSources: SourceRow[] = []
    if (sourceIds.length) {
      const sourceResult = await supabase.from('knowledge_sources').select('id,title,source_type,publisher,url,reference_text,reliability,verification_status,origin_kind').in('id', sourceIds)
      if (sourceResult.error) {
        setLoading(false)
        setMessage(`Knowledge provenance could not load: ${sourceResult.error.message}`)
        return
      }
      nextSources = (sourceResult.data ?? []) as SourceRow[]
    }
    setSources(new Map(nextSources.map((source) => [source.id, source])))
    setLoading(false)
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, refreshKey])

  const suggestions = useMemo(() => {
    if (!movement) return [] as Suggestion[]
    const rows: Suggestion[] = []
    const primarySource = movement.primary_source_id ? sources.get(movement.primary_source_id) ?? null : null
    const contextTrigger = text(work?.blocker || work?.diagnosis)
    rows.push({
      key: `movement-${movement.id}`,
      kind: 'movement',
      level: evidenceLabel(movement.evidence_grade, movement.verification_status, movementLinked),
      title: `${movement.maker} ${movement.calibre}`.trim(),
      detail: [movementSpecs(movement), movement.notes].filter(Boolean).join(' — '),
      relation: contextTrigger ? `Exact movement reference surfaced alongside the current workshop finding. It is reference evidence, not a diagnosis of “${contextTrigger}”.` : movementLinked ? 'The Passport is explicitly linked to this Knowledge movement record.' : 'Exact maker + calibre Knowledge match from the Passport.',
      source: primarySource,
      url: primarySource?.url,
    })

    for (const doc of documents.slice(0, 4)) {
      const source = doc.source_id ? sources.get(doc.source_id) ?? null : null
      rows.push({
        key: `doc-${doc.id}`,
        kind: 'document',
        level: doc.verification_status ? `${titleCase(doc.verification_status)} document` : 'Technical document',
        title: doc.title || `${movement.maker} ${movement.calibre} technical document`,
        detail: [titleCase(doc.document_type || ''), doc.reference_text, doc.notes].filter(Boolean).join(' · '),
        relation: contextTrigger ? 'Relevant exact-calibre document. Relevance does not prove the cause of the current workshop finding.' : 'Technical document attached to the exact movement record.',
        source,
        url: doc.url || source?.url,
      })
    }

    for (const need of needs.slice(0, 3)) {
      const matches = applications
        .map((application) => ({ application, part: partRefs.get(application.part_ref_id) ?? null }))
        .filter((entry): entry is { application: ApplicationRow; part: PartRefRow } => Boolean(entry.part && matchesNeed(entry.part, need)))
        .sort((a, b) => Number(b.application.confidence ?? 0) - Number(a.application.confidence ?? 0))
        .slice(0, 3)
      for (const { application, part } of matches) {
        const sourceId = application.source_id || part.source_id
        const source = sourceId ? sources.get(sourceId) ?? null : null
        rows.push({
          key: `part-${need.id}-${part.id}`,
          kind: 'part',
          level: evidenceLabel(part.evidence_grade, application.verification_status || part.verification_status),
          title: `${part.part_type || need.part_type || 'Part'} · ${part.part_reference || 'reference'}`,
          detail: [part.manufacturer, part.description, application.condition_text, application.notes || part.notes, application.confidence != null ? `${Math.round(Number(application.confidence) * 100)}% recorded confidence` : ''].filter(Boolean).join(' · '),
          relation: `Knowledge application is tied to ${movement.maker} ${movement.calibre} and matches current Part Need: ${need.part_type || need.description || 'part'}. Confirm dimensions/serial conditions before fitting.`,
          source,
          url: source?.url,
        })
      }
    }

    return rows.slice(0, 8)
  }, [movement, movementLinked, documents, needs, applications, partRefs, sources, work])

  if (loading) return <section className="bench-knowledge"><p className="muted">Checking sourced Knowledge…</p></section>

  return (
    <section className="bench-knowledge">
      <div className="bench-knowledge-heading">
        <div><p className="eyebrow">BENCH KNOWLEDGE</p><strong>Sourced references for this movement</strong></div>
        {movement && <span>{movementLinked ? 'Passport linked' : 'Exact calibre'}</span>}
      </div>
      {message && suggestions.length === 0 && <p className="bench-knowledge-message">{message}</p>}
      {suggestions.length > 0 && <div className="bench-knowledge-list">
        {suggestions.map((row) => <article className={`bench-knowledge-card kind-${row.kind}`} key={row.key}>
          <div className="bench-knowledge-card-top"><span>{row.level}</span><small>{titleCase(row.kind)}</small></div>
          <strong>{row.title}</strong>
          {row.detail && <p>{row.detail}</p>}
          <p className="bench-knowledge-relation">{row.relation}</p>
          {(row.source || row.url) && <div className="bench-knowledge-source">
            <span>Source</span>
            <strong>{row.source?.title || row.source?.reference_text || 'Technical reference'}</strong>
            {row.source && <small>{[row.source.publisher, row.source.reliability && `${titleCase(row.source.reliability)} reliability`, row.source.verification_status && titleCase(row.source.verification_status)].filter(Boolean).join(' · ')}</small>}
            {row.url && <a href={row.url} target="_blank" rel="noreferrer">Open source ↗</a>}
          </div>}
        </article>)}
      </div>}
      {movement && movementSources.length > 0 && <p className="bench-knowledge-footnote">{movementSources.length} additional movement source link{movementSources.length === 1 ? '' : 's'} recorded in Knowledge. Suggestions are references only; workshop diagnosis still requires direct evidence from this Item.</p>}
    </section>
  )
}
