import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

export type MovementCandidate = {
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
  evidence_grade: string
  verification_status: string
  score: number
  reasons: string[]
}

type FinderClues = {
  markings?: string
  maker?: string
  diameter?: number | null
  height?: number | null
  jewels?: number | null
  bph?: number | null
  winding?: string
}

type MovementFinderProps = {
  initialClues?: FinderClues
  onSelectCandidate?: (candidate: MovementCandidate) => void
  selectLabel?: string
  compact?: boolean
}

function n(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function evidenceLabel(value: string) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Unknown'
}

export default function MovementFinder({ initialClues, onSelectCandidate, selectLabel = 'Use candidate', compact = false }: MovementFinderProps = {}) {
  const [markings, setMarkings] = useState(initialClues?.markings ?? '')
  const [maker, setMaker] = useState(initialClues?.maker ?? '')
  const [diameter, setDiameter] = useState(initialClues?.diameter != null ? String(initialClues.diameter) : '')
  const [height, setHeight] = useState(initialClues?.height != null ? String(initialClues.height) : '')
  const [jewels, setJewels] = useState(initialClues?.jewels != null ? String(initialClues.jewels) : '')
  const [bph, setBph] = useState(initialClues?.bph != null ? String(initialClues.bph) : '')
  const [winding, setWinding] = useState(initialClues?.winding ?? '')
  const [results, setResults] = useState<MovementCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Enter any clues you know. Unknown fields can stay blank.')

  useEffect(() => {
    if (!initialClues) return
    setMarkings(initialClues.markings ?? '')
    setMaker(initialClues.maker ?? '')
    setDiameter(initialClues.diameter != null ? String(initialClues.diameter) : '')
    setHeight(initialClues.height != null ? String(initialClues.height) : '')
    setJewels(initialClues.jewels != null ? String(initialClues.jewels) : '')
    setBph(initialClues.bph != null ? String(initialClues.bph) : '')
    setWinding(initialClues.winding ?? '')
    setResults([])
    setMessage('Passport clues loaded. Adjust anything you know before searching.')
  }, [initialClues?.markings, initialClues?.maker, initialClues?.diameter, initialClues?.height, initialClues?.jewels, initialClues?.bph, initialClues?.winding])

  const hasClue = useMemo(() => [markings, maker, diameter, height, jewels, bph, winding].some((value) => value.trim()), [markings, maker, diameter, height, jewels, bph, winding])

  async function find(event: FormEvent) {
    event.preventDefault()
    if (!hasClue || busy) return
    setBusy(true)
    setMessage('Ranking movement candidates…')
    setResults([])

    const { data, error } = await supabase.rpc('find_movement_candidates', {
      p_markings: markings.trim(),
      p_maker: maker.trim(),
      p_diameter_mm: n(diameter),
      p_height_mm: n(height),
      p_jewels: jewels.trim() ? Math.round(Number(jewels)) : null,
      p_bph: bph.trim() ? Math.round(Number(bph)) : null,
      p_winding: winding,
      p_limit: 25,
    })

    setBusy(false)
    if (error) {
      setMessage(`Finder failed: ${error.message}`)
      return
    }

    const next = (data ?? []) as MovementCandidate[]
    setResults(next)
    setMessage(next.length ? `${next.length} ranked candidate${next.length === 1 ? '' : 's'}. A high score is a lead, not proof of identity.` : 'No candidates matched those clues. Try removing one constraint or checking the measurement.')
  }

  function clear() {
    setMarkings('')
    setMaker('')
    setDiameter('')
    setHeight('')
    setJewels('')
    setBph('')
    setWinding('')
    setResults([])
    setMessage('Enter any clues you know. Unknown fields can stay blank.')
  }

  return (
    <section className={`movement-finder-card ${compact ? 'movement-finder-compact' : ''}`}>
      <div className="movement-finder-heading">
        <div>
          <p className="eyebrow">MOVEMENT FINDER</p>
          <h2>{compact ? 'Find from this Passport' : 'Identify from bench clues'}</h2>
          <p className="muted">Rank likely movements from markings and measurements. Missing source data does not count against a candidate.</p>
        </div>
      </div>

      <form className="movement-finder-form" onSubmit={find}>
        <label className="finder-wide">Visible marking / calibre clue<input value={markings} onChange={(e) => setMarkings(e.target.value)} placeholder="e.g. 25-652, 215, FHF 96" /></label>
        <label>Maker, if known<input value={maker} onChange={(e) => setMaker(e.target.value)} placeholder="e.g. Certina" /></label>
        <label>Diameter mm<input inputMode="decimal" value={diameter} onChange={(e) => setDiameter(e.target.value)} placeholder="25.60" /></label>
        <label>Height mm<input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="3.60" /></label>
        <label>Jewels<input inputMode="numeric" value={jewels} onChange={(e) => setJewels(e.target.value.replace(/\D/g, ''))} placeholder="17" /></label>
        <label>BPH<input inputMode="numeric" value={bph} onChange={(e) => setBph(e.target.value.replace(/\D/g, ''))} placeholder="18000" /></label>
        <label>Winding<select value={winding} onChange={(e) => setWinding(e.target.value)}><option value="">Unknown / any</option><option value="manual">Manual</option><option value="automatic">Automatic</option><option value="quartz">Quartz</option></select></label>
        <div className="movement-finder-actions"><button type="submit" disabled={!hasClue || busy}>{busy ? 'Finding…' : 'Find movements'}</button><button type="button" className="secondary" onClick={clear} disabled={busy}>Clear</button></div>
      </form>

      <p className={`movement-finder-message ${message.startsWith('Finder failed') ? 'error' : ''}`}>{message}</p>

      {results.length > 0 && (
        <div className="movement-finder-results">
          {results.map((candidate, index) => (
            <article className="movement-candidate" key={candidate.id}>
              <div className="movement-candidate-top">
                <div><span className="candidate-rank">#{index + 1}</span><h3>{candidate.maker} {candidate.calibre}</h3>{candidate.calibre_family && <p>{candidate.calibre_family}</p>}</div>
                <div className="candidate-score"><strong>{Number(candidate.score).toFixed(0)}</strong><span>score</span></div>
              </div>
              <div className="candidate-badges"><span className={`evidence-badge evidence-${candidate.evidence_grade || 'unknown'}`}>{evidenceLabel(candidate.evidence_grade)}</span><span className="verification-badge">{evidenceLabel(candidate.verification_status)}</span></div>
              <dl className="candidate-specs">
                <div><dt>Diameter</dt><dd>{candidate.diameter_mm ?? '—'}{candidate.diameter_mm != null ? ' mm' : ''}</dd></div>
                <div><dt>Height</dt><dd>{candidate.height_mm ?? '—'}{candidate.height_mm != null ? ' mm' : ''}</dd></div>
                <div><dt>BPH</dt><dd>{candidate.bph ?? '—'}</dd></div>
                <div><dt>Winding</dt><dd>{candidate.winding || '—'}</dd></div>
                <div><dt>Jewels</dt><dd>{candidate.jewels ?? '—'}</dd></div>
                <div><dt>Reserve</dt><dd>{candidate.power_reserve_hours ?? '—'}{candidate.power_reserve_hours != null ? ' h' : ''}</dd></div>
              </dl>
              <div className="candidate-reasons">{candidate.reasons?.length ? candidate.reasons.map((reason) => <span key={reason}>{reason}</span>) : <span>No positive clue recorded</span>}</div>
              <p className="candidate-warning">Candidate only until confirmed by markings, architecture, dimensions or a trusted technical source.</p>
              {onSelectCandidate && <button type="button" className="candidate-select" onClick={() => onSelectCandidate(candidate)}>{selectLabel}</button>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
