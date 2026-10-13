import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type ItemRow = { id: string; item_number: number; title: string; purpose: string; status: string }
type PassportRow = { item_id: string; movement_maker: string; calibre: string; calibre_family: string; knowledge_movement_id: string | null; movement_identification_status: string }
type MovementRow = { id: string; maker: string; calibre: string; calibre_family: string; evidence_grade: string; verification_status: string }

type Candidate = {
  candidate_kind: 'owned_part' | 'donor_item'
  candidate_id: string
  part_id: string | null
  donor_item_id: string | null
  label: string
  detail: string | null
  part_type: string
  quantity: number
  condition: string
  evidence_tier: 'confirmed' | 'documented' | 'candidate' | 'family_lead' | 'unverified'
  evidence_label: string
  score: number
  confidence: number | null
  source_kind: string
  modification_required: boolean
  donor_value: number | null
  donor_currency: string | null
  economic_note: string
  target_movement_id: string
  candidate_movement_id: string | null
  reasons: string[]
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function money(value: number | null, currency = 'AUD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

function tierLabel(tier: Candidate['evidence_tier']) {
  if (tier === 'family_lead') return 'Family lead only'
  return titleCase(tier)
}

export default function CompatibilityIntelligence() {
  const [workspaceId, setWorkspaceId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [passports, setPassports] = useState<PassportRow[]>([])
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [partType, setPartType] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('Choose an Item to compare against owned parts and donors.')

  const passportByItem = useMemo(() => new Map(passports.map((passport) => [passport.item_id, passport])), [passports])
  const movementById = useMemo(() => new Map(movements.map((movement) => [movement.id, movement])), [movements])
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const selectedPassport = selectedItemId ? passportByItem.get(selectedItemId) ?? null : null
  const selectedMovement = selectedPassport?.knowledge_movement_id ? movementById.get(selectedPassport.knowledge_movement_id) ?? null : null

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data, error } = await supabase.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (!active) return
      if (error || !data) {
        setLoading(false)
        setMessage(`Compatibility workspace unavailable: ${error?.message ?? 'No workspace found.'}`)
        return
      }
      setWorkspaceId(data.id)
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    ;(async () => {
      setLoading(true)
      const [itemResult, passportResult] = await Promise.all([
        supabase.from('items').select('id,item_number,title,purpose,status').eq('workspace_id', workspaceId).is('archived_at', null).order('item_number', { ascending: false }),
        supabase.from('passports').select('item_id,movement_maker,calibre,calibre_family,knowledge_movement_id,movement_identification_status').eq('workspace_id', workspaceId),
      ])
      if (!active) return
      const firstError = itemResult.error ?? passportResult.error
      if (firstError) {
        setLoading(false)
        setMessage(`Compatibility data failed to load: ${firstError.message}`)
        return
      }

      const nextItems = (itemResult.data ?? []) as ItemRow[]
      const nextPassports = (passportResult.data ?? []) as PassportRow[]
      const movementIds = [...new Set(nextPassports.map((passport) => passport.knowledge_movement_id).filter(Boolean))] as string[]
      let nextMovements: MovementRow[] = []
      if (movementIds.length > 0) {
        const movementResult = await supabase.from('knowledge_movements').select('id,maker,calibre,calibre_family,evidence_grade,verification_status').in('id', movementIds)
        if (!active) return
        if (movementResult.error) {
          setLoading(false)
          setMessage(`Movement evidence failed to load: ${movementResult.error.message}`)
          return
        }
        nextMovements = (movementResult.data ?? []) as MovementRow[]
      }

      setItems(nextItems)
      setPassports(nextPassports)
      setMovements(nextMovements)
      setLoading(false)
      setMessage('Choose an Item to compare against owned parts and donors.')
    })()
    return () => { active = false }
  }, [workspaceId])

  async function findMatches() {
    if (!selectedItemId || !selectedItem || !workspaceId) return
    setResults([])

    if (!selectedPassport?.knowledge_movement_id || !selectedMovement) {
      setMessage(`Item #${selectedItem.item_number} has no linked Knowledge movement yet. Identify the movement in Passport before Calibre makes compatibility suggestions.`)
      return
    }

    setSearching(true)
    setMessage(`Checking owned stock against ${selectedMovement.maker} ${selectedMovement.calibre}…`)
    const { data, error } = await supabase.rpc('find_owned_compatibility_candidates', {
      p_workspace_id: workspaceId,
      p_item_id: selectedItemId,
      p_part_type: partType.trim() || null,
      p_limit: 40,
    })
    setSearching(false)

    if (error) {
      setMessage(`Compatibility search failed: ${error.message}`)
      return
    }

    const supported = ((data ?? []) as Candidate[]).filter((candidate) => candidate.evidence_tier !== 'unverified')
    setResults(supported)
    setMessage(supported.length > 0
      ? `${supported.length} evidence-backed candidate${supported.length === 1 ? '' : 's'} found. Rank score orders evidence strength; it is not a fit probability.`
      : 'No evidence-backed owned part or donor match found. Calibre will not promote unrelated inventory as compatible.')
  }

  function chooseItem(itemId: string) {
    setSelectedItemId(itemId)
    setResults([])
    const item = items.find((row) => row.id === itemId)
    const passport = passportByItem.get(itemId)
    const movement = passport?.knowledge_movement_id ? movementById.get(passport.knowledge_movement_id) : null
    if (!itemId) setMessage('Choose an Item to compare against owned parts and donors.')
    else if (!passport?.knowledge_movement_id || !movement) setMessage(`Item #${item?.item_number ?? ''} is not linked to a Knowledge movement yet.`)
    else setMessage(`Ready to check ${movement.maker} ${movement.calibre} against owned parts and donors.`)
  }

  return (
    <section className="compatibility-panel">
      <div className="compatibility-heading">
        <div>
          <p className="eyebrow">COMPATIBILITY INTELLIGENCE</p>
          <h3>Find what you already own</h3>
          <p className="muted">Calibre ranks evidence, not guesses. Same-family relationships remain donor leads until exact fit is verified.</p>
        </div>
      </div>

      <div className="compatibility-controls">
        <label>Target Item
          <select value={selectedItemId} onChange={(event) => chooseItem(event.target.value)} disabled={loading}>
            <option value="">Choose Item…</option>
            {items.map((item) => {
              const passport = passportByItem.get(item.id)
              const linked = Boolean(passport?.knowledge_movement_id)
              return <option key={item.id} value={item.id}>#{item.item_number} · {item.title}{linked ? ' · movement linked' : ' · movement unresolved'}</option>
            })}
          </select>
        </label>
        <label>Part type <span>optional</span>
          <input value={partType} onChange={(event) => setPartType(event.target.value)} placeholder="e.g. balance staff" />
        </label>
        <button type="button" onClick={findMatches} disabled={!selectedItemId || searching || loading}>{searching ? 'Checking…' : 'Find compatible stock'}</button>
      </div>

      {selectedItem && (
        <div className={`compatibility-target ${selectedMovement ? 'linked' : 'unresolved'}`}>
          <div><span>Target</span><strong>#{selectedItem.item_number} · {selectedItem.title}</strong></div>
          <div><span>Movement</span><strong>{selectedMovement ? `${selectedMovement.maker} ${selectedMovement.calibre}` : 'Unresolved'}</strong></div>
          <div><span>Evidence</span><strong>{selectedMovement ? `${titleCase(selectedMovement.evidence_grade)} · ${titleCase(selectedPassport?.movement_identification_status || 'linked')}` : 'No compatibility claim'}</strong></div>
        </div>
      )}

      <p className="compatibility-message">{message}</p>

      <div className="compatibility-results">
        {results.map((candidate) => (
          <article className={`compatibility-result tier-${candidate.evidence_tier}`} key={`${candidate.candidate_kind}-${candidate.candidate_id}`}>
            <div className="compatibility-result-head">
              <div>
                <div className="compatibility-badges">
                  <span>{candidate.candidate_kind === 'donor_item' ? 'Donor Item' : titleCase(candidate.part_type)}</span>
                  <span className={`evidence-badge ${candidate.evidence_tier}`}>{tierLabel(candidate.evidence_tier)}</span>
                </div>
                <h4>{candidate.label}</h4>
                {candidate.detail && <p>{candidate.detail}</p>}
              </div>
              <div className="compatibility-score"><span>Rank</span><strong>{candidate.score}</strong></div>
            </div>

            <div className="compatibility-facts">
              <div><span>Evidence</span><strong>{candidate.evidence_label}</strong></div>
              <div><span>Condition</span><strong>{titleCase(candidate.condition)}</strong></div>
              {candidate.candidate_kind === 'owned_part' && <div><span>Quantity</span><strong>×{Number(candidate.quantity)}</strong></div>}
              {candidate.candidate_kind === 'donor_item' && <div><span>Recorded donor value</span><strong>{money(candidate.donor_value, candidate.donor_currency || 'AUD')}</strong></div>}
            </div>

            {candidate.reasons?.length > 0 && <ul className="compatibility-reasons">{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
            {candidate.modification_required && <p className="compatibility-warning">Modification may be required — verify dimensions and exact part before fitting.</p>}
            {candidate.economic_note && <p className="compatibility-economics">{candidate.economic_note}</p>}

            {candidate.donor_item_id && candidate.candidate_kind === 'donor_item' && <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/items/${encodeURIComponent(candidate.donor_item_id!)}` }}>Open donor Item</button>}
          </article>
        ))}
      </div>
    </section>
  )
}
