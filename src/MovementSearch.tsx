import { FormEvent, useState } from 'react'
import { supabase } from './lib/supabase'

type Movement = {
  id: string
  maker: string
  calibre: string
  calibre_family: string
  diameter_mm: number | null
  height_mm: number | null
  jewels: number | null
  bph: number | null
  winding: string
  power_reserve_hours: number | null
  escapement: string
  layout: string
  evidence_grade: string
  verification_status: string
  search_aliases: unknown
  common_brands: unknown
  primary_source_id: string | null
  notes: string
}

type Source = {
  id: string
  title: string
  publisher: string
  url: string
  source_type: string
  reliability: string
  evidenceClass?: string
  referenceText?: string
  notes?: string
}

function titleCase(value: string) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown'
}

function fmt(value: number | null | undefined, suffix = '') {
  return value == null ? '—' : `${value}${suffix}`
}

function evidenceClass(value: string) {
  return `movement-evidence movement-evidence-${(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`
}

export default function MovementSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movement[]>([])
  const [selected, setSelected] = useState<Movement | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [busy, setBusy] = useState(false)
  const [detailBusy, setDetailBusy] = useState(false)
  const [message, setMessage] = useState('Search maker, calibre, family or alias.')

  async function search(event?: FormEvent) {
    event?.preventDefault()
    const clean = query.trim()
    if (!clean) {
      setResults([])
      setSelected(null)
      setSources([])
      setMessage('Enter a maker, calibre, family or alias.')
      return
    }

    setBusy(true)
    setSelected(null)
    setSources([])
    setMessage('Searching movement library…')
    const { data, error } = await supabase.rpc('search_knowledge_movements', { p_query: clean, p_limit: 50 })
    setBusy(false)

    if (error) {
      setMessage(`Search failed: ${error.message}`)
      return
    }

    const next = (data ?? []) as Movement[]
    setResults(next)
    setMessage(next.length ? `${next.length} movement ${next.length === 1 ? 'match' : 'matches'} found.` : 'No movement matches found.')
  }

  async function openMovement(movement: Movement) {
    setSelected(movement)
    setSources([])
    setDetailBusy(true)

    const linked = await supabase
      .from('knowledge_movement_sources')
      .select('evidence_class,reference_text,notes,knowledge_sources(id,title,publisher,url,source_type,reliability)')
      .eq('movement_id', movement.id)

    const collected: Source[] = []
    if (!linked.error && linked.data) {
      for (const row of linked.data as any[]) {
        const source = Array.isArray(row.knowledge_sources) ? row.knowledge_sources[0] : row.knowledge_sources
        if (!source) continue
        collected.push({
          ...source,
          evidenceClass: row.evidence_class,
          referenceText: row.reference_text,
          notes: row.notes,
        })
      }
    }

    if (movement.primary_source_id && !collected.some((source) => source.id === movement.primary_source_id)) {
      const primary = await supabase
        .from('knowledge_sources')
        .select('id,title,publisher,url,source_type,reliability')
        .eq('id', movement.primary_source_id)
        .maybeSingle()
      if (!primary.error && primary.data) collected.unshift(primary.data as Source)
    }

    setSources(collected)
    setDetailBusy(false)
  }

  return (
    <section className="movement-library-card">
      <div className="movement-library-heading">
        <div>
          <p className="eyebrow">MOVEMENT LIBRARY</p>
          <h2>Search movements</h2>
          <p className="muted">Maker and evidence stay attached to every calibre result.</p>
        </div>
      </div>

      <form className="movement-search-form" onSubmit={search}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. Oris 652, ETA 2824, AS 1130"
          aria-label="Search movement library"
        />
        <button type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      <p className="movement-search-message">{message}</p>

      {results.length > 0 && (
        <div className="movement-search-layout">
          <div className="movement-results" aria-label="Movement search results">
            {results.map((movement) => (
              <button
                type="button"
                key={movement.id}
                className={`movement-result ${selected?.id === movement.id ? 'selected' : ''}`}
                onClick={() => openMovement(movement)}
              >
                <div className="movement-result-main">
                  <strong>{movement.maker} {movement.calibre}</strong>
                  <span>{movement.calibre_family || 'Family not recorded'}</span>
                </div>
                <div className="movement-result-meta">
                  <span>{fmt(movement.diameter_mm, ' mm')}</span>
                  <span>{fmt(movement.jewels, 'j')}</span>
                  <span>{fmt(movement.bph, ' bph')}</span>
                </div>
                <span className={evidenceClass(movement.evidence_grade)}>{titleCase(movement.evidence_grade || movement.verification_status)}</span>
              </button>
            ))}
          </div>

          <div className="movement-detail">
            {!selected ? (
              <div className="movement-detail-empty">Select a movement to inspect its technical data and evidence.</div>
            ) : (
              <>
                <div className="movement-detail-header">
                  <div><p className="eyebrow">MOVEMENT RECORD</p><h3>{selected.maker} {selected.calibre}</h3></div>
                  <span className={evidenceClass(selected.evidence_grade)}>{titleCase(selected.evidence_grade || selected.verification_status)}</span>
                </div>

                <dl className="movement-spec-grid">
                  <div><dt>Family</dt><dd>{selected.calibre_family || '—'}</dd></div>
                  <div><dt>Diameter</dt><dd>{fmt(selected.diameter_mm, ' mm')}</dd></div>
                  <div><dt>Height</dt><dd>{fmt(selected.height_mm, ' mm')}</dd></div>
                  <div><dt>Jewels</dt><dd>{fmt(selected.jewels)}</dd></div>
                  <div><dt>Beat rate</dt><dd>{fmt(selected.bph, ' bph')}</dd></div>
                  <div><dt>Winding</dt><dd>{selected.winding ? titleCase(selected.winding) : '—'}</dd></div>
                  <div><dt>Power reserve</dt><dd>{fmt(selected.power_reserve_hours, ' h')}</dd></div>
                  <div><dt>Escapement</dt><dd>{selected.escapement || '—'}</dd></div>
                  <div><dt>Layout</dt><dd>{selected.layout || '—'}</dd></div>
                  <div><dt>Verification</dt><dd>{titleCase(selected.verification_status || 'unknown')}</dd></div>
                </dl>

                {selected.notes && <div className="movement-notes"><strong>Notes</strong><p>{selected.notes}</p></div>}

                <div className="movement-sources">
                  <div className="movement-sources-heading"><strong>Evidence & sources</strong><span>{detailBusy ? 'Loading…' : `${sources.length} linked`}</span></div>
                  {!detailBusy && sources.length === 0 && <p className="muted">No direct source link is attached to this record yet. Treat the evidence grade shown above as the controlling confidence signal.</p>}
                  {sources.map((source) => (
                    <div className="movement-source" key={`${source.id}-${source.evidenceClass ?? ''}`}>
                      <div><strong>{source.title}</strong><span>{source.publisher || titleCase(source.source_type)}</span></div>
                      <div className="movement-source-meta">
                        {source.evidenceClass && <span>{titleCase(source.evidenceClass)}</span>}
                        {source.reliability && <span>{titleCase(source.reliability)}</span>}
                        {source.url && <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>}
                      </div>
                      {source.referenceText && <p>{source.referenceText}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
