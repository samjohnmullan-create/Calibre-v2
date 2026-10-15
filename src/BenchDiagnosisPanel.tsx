import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-guided-job.css'

type Finding = { id: string; title: string; details: string; severity: string; status: string; finding_type: string }
type Hypothesis = { id: string; finding_id: string | null; title: string; rationale: string; confidence: string; status: 'possible' | 'confirmed' | 'ruled_out'; source_kind: string; source_ref: string }
type Check = { id: string; hypothesis_id: string; label: string; instructions: string; sequence: number; status: 'suggested' | 'approved' | 'complete' | 'not_applicable'; result: string; source_ref: string }
type Seed = { title: string; rationale: string; confidence: 'probable' | 'possible'; checks: { label: string; instructions: string }[] }

function norm(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function titleCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }

function seedsFor(finding: Finding): Seed[] {
  const text = norm(`${finding.title} ${finding.details}`)
  const seeds: Seed[] = []
  const add = (seed: Seed) => { if (!seeds.some((row) => row.title === seed.title)) seeds.push(seed) }

  if (/(low amplitude|weak amplitude|poor amplitude|low power|weak timing)/.test(text)) {
    add({ title: 'Excess resistance in the train', rationale: 'Low delivered energy can come from train friction, endshake or damaged pivots/jewels. This is a possibility, not a diagnosis.', confidence: 'probable', checks: [
      { label: 'Check train freedom', instructions: 'With power safely removed and the escapement appropriately isolated, check wheel-train freedom and look for binding or abnormal endshake.' },
      { label: 'Inspect pivots and jewels', instructions: 'Inspect accessible pivots and jewels for contamination, wear, damage or incorrect seating.' },
    ] })
    add({ title: 'Barrel or mainspring energy problem', rationale: 'A tired, slipping, damaged or poorly lubricated mainspring/barrel can reduce energy available to the escapement.', confidence: 'possible', checks: [
      { label: 'Assess barrel and mainspring', instructions: 'Inspect barrel condition, arbor engagement, mainspring condition and appropriate lubrication during service.' },
    ] })
    add({ title: 'Balance or hairspring interference', rationale: 'Balance pivots, hairspring clearance, centring or contact can reduce amplitude and positional consistency.', confidence: 'possible', checks: [
      { label: 'Inspect balance freedom', instructions: 'Check balance pivot condition, endshake and freedom without forcing the assembly.' },
      { label: 'Inspect hairspring clearance', instructions: 'Check for touching coils, regulator contact, magnetism, deformation or contact with surrounding parts.' },
    ] })
  }

  if (/(rotor|automatic).*(noise|scrap|rub|grind)|noise.*rotor|scraping.*rotor/.test(text)) {
    add({ title: 'Rotor clearance or bearing wear', rationale: 'Rotor contact can result from excessive play, bearing/bushing wear, looseness or case/movement clearance issues.', confidence: 'probable', checks: [
      { label: 'Check rotor play and clearance', instructions: 'Inspect axial/radial play and look for witness marks on the rotor, bridges or case back.' },
      { label: 'Check rotor fixing', instructions: 'Confirm rotor screw/fixing and associated bearing or bushing condition before deeper automatic-work inspection.' },
    ] })
    add({ title: 'Automatic winding train resistance', rationale: 'Noise can originate in reversers, reduction wheels or automatic-work pivots rather than the rotor itself.', confidence: 'possible', checks: [
      { label: 'Inspect automatic winding train', instructions: 'Check freedom, wear, contamination and engagement of the automatic winding train according to the movement construction.' },
    ] })
  }

  if (/(winds|wind).*(not run|does not run|won t run|stops)|not running|won t run|does not run|movement stops|stops intermittently/.test(text)) {
    add({ title: 'Power is not reaching the train', rationale: 'The watch may wind without useful barrel torque reaching the train. Barrel, mainspring or transmission faults remain possible.', confidence: 'probable', checks: [
      { label: 'Confirm power transmission', instructions: 'Determine whether stored barrel power is reaching the centre wheel/train before disturbing the escapement.' },
    ] })
    add({ title: 'Train obstruction or excessive friction', rationale: 'A blocked or damaged train can prevent a wound movement from running.', confidence: 'possible', checks: [
      { label: 'Check train freedom', instructions: 'Inspect for debris, damaged teeth, pivot/jewel damage, incorrect endshake or binding.' },
    ] })
    add({ title: 'Escapement or balance cannot sustain oscillation', rationale: 'Faults at the pallet, escape wheel, impulse interface, balance pivots or hairspring can prevent starting or sustained running.', confidence: 'possible', checks: [
      { label: 'Observe balance response', instructions: 'Observe whether the balance starts freely and whether oscillation decays immediately; do not force the balance.' },
      { label: 'Inspect escapement condition', instructions: 'Inspect pallet/escape-wheel interaction, obvious damage and freedom before making adjustments.' },
    ] })
  }

  if (/(beat error|out of beat|beat).*(high|large|bad|poor)|high beat error/.test(text)) {
    add({ title: 'Beat relationship needs correction', rationale: 'High beat error indicates unequal tick/tock timing, but the mechanical cause must be established before adjustment.', confidence: 'probable', checks: [
      { label: 'Confirm repeatable beat error', instructions: 'Recheck on a stable signal and more than one position before treating the reading as mechanical truth.' },
      { label: 'Inspect hairspring and impulse relationship', instructions: 'Inspect centring, collet/stud relationship, impulse jewel and surrounding clearances before adjustment.' },
    ] })
  }

  if (/(positional|position).*(spread|variation|difference)|large spread|rate varies/.test(text)) {
    add({ title: 'Balance/pivot positional sensitivity', rationale: 'Large positional differences can come from pivot/jewel condition, endshake, poise or hairspring geometry.', confidence: 'possible', checks: [
      { label: 'Inspect balance pivots and jewels', instructions: 'Check pivot condition, jewel cleanliness/alignment and appropriate endshake.' },
      { label: 'Inspect hairspring centring and flatness', instructions: 'Check centring, flatness and clearance in horizontal and vertical orientations.' },
    ] })
  }

  if (seeds.length === 0) {
    add({ title: 'Further mechanical diagnosis required', rationale: 'This finding does not yet match a narrow deterministic rule. Record discriminating observations and request research for movement-specific evidence.', confidence: 'possible', checks: [
      { label: 'Describe the symptom precisely', instructions: 'Record when the symptom occurs, what changes it, and any related sound, feel, measurement or timing result.' },
      { label: 'Request fault-specific research', instructions: 'Use Request Research so Calibre can check your Drive library, movement references, parts evidence and the live web.' },
    ] })
  }

  return seeds.slice(0, 5)
}

export default function BenchDiagnosisPanel({ workspaceId, itemId, workId, refreshKey = 0, onChanged }: { workspaceId: string; itemId: string; workId: string; refreshKey?: number; onChanged?: () => void | Promise<void> }) {
  const [findings, setFindings] = useState<Finding[]>([])
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [checks, setChecks] = useState<Check[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    const [findingResult, hypothesisResult, checkResult] = await Promise.all([
      supabase.from('work_findings').select('id,title,details,severity,status,finding_type').eq('workspace_id', workspaceId).eq('work_id', workId).order('created_at'),
      supabase.from('work_diagnostic_hypotheses').select('id,finding_id,title,rationale,confidence,status,source_kind,source_ref').eq('workspace_id', workspaceId).eq('work_id', workId).order('created_at'),
      supabase.from('work_diagnostic_checks').select('id,hypothesis_id,label,instructions,sequence,status,result,source_ref').eq('workspace_id', workspaceId).eq('work_id', workId).order('sequence'),
    ])
    const error = findingResult.error ?? hypothesisResult.error ?? checkResult.error
    if (error) return setMessage(`Diagnosis could not load: ${error.message}`)
    setFindings((findingResult.data ?? []) as Finding[])
    setHypotheses((hypothesisResult.data ?? []) as Hypothesis[])
    setChecks((checkResult.data ?? []) as Check[])
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId, refreshKey])

  async function suggest(finding: Finding) {
    if (busy || hypotheses.some((row) => row.finding_id === finding.id)) return
    setBusy(true); setMessage('Creating possible causes and discriminating checks…')
    const seeds = seedsFor(finding)
    for (const seed of seeds) {
      const inserted = await supabase.from('work_diagnostic_hypotheses').insert({ workspace_id: workspaceId, work_id: workId, item_id: itemId, finding_id: finding.id, title: seed.title, rationale: seed.rationale, confidence: seed.confidence, status: 'possible', source_kind: 'calibre_rule', source_ref: 'Calibre deterministic diagnostic rule v1 — verify against movement-specific evidence.' }).select('id').single()
      if (inserted.error || !inserted.data) { setBusy(false); setMessage(`Suggestion could not be saved: ${inserted.error?.message ?? 'No hypothesis returned.'}`); return }
      if (seed.checks.length) {
        const checkRows = seed.checks.map((check, index) => ({ workspace_id: workspaceId, work_id: workId, item_id: itemId, hypothesis_id: inserted.data.id, label: check.label, instructions: check.instructions, sequence: (index + 1) * 10, status: 'suggested', source_ref: 'Calibre deterministic diagnostic rule v1' }))
        const checksInsert = await supabase.from('work_diagnostic_checks').insert(checkRows)
        if (checksInsert.error) { setBusy(false); setMessage(`Checks could not be saved: ${checksInsert.error.message}`); return }
      }
    }
    setBusy(false); setMessage('Possible causes added. They remain unconfirmed until you verify them.'); await load(); await onChanged?.()
  }

  async function setHypothesisStatus(row: Hypothesis, status: Hypothesis['status']) {
    setBusy(true)
    const result = await supabase.from('work_diagnostic_hypotheses').update({ status, updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('id', row.id)
    setBusy(false)
    if (result.error) return setMessage(`Diagnosis could not be updated: ${result.error.message}`)
    await load(); await onChanged?.()
  }

  async function setCheckStatus(row: Check, status: Check['status']) {
    setBusy(true)
    const patch = status === 'complete' ? { status, completed_at: new Date().toISOString(), completed_by: (await supabase.auth.getUser()).data.user?.id ?? null, updated_at: new Date().toISOString() } : { status, completed_at: null, completed_by: null, updated_at: new Date().toISOString() }
    const result = await supabase.from('work_diagnostic_checks').update(patch).eq('workspace_id', workspaceId).eq('id', row.id)
    setBusy(false)
    if (result.error) return setMessage(`Diagnostic check could not be updated: ${result.error.message}`)
    await load(); await onChanged?.()
  }

  const openFindings = findings.filter((row) => !['resolved', 'not_actioned'].includes(row.status))
  const grouped = useMemo(() => new Map(openFindings.map((finding) => [finding.id, hypotheses.filter((row) => row.finding_id === finding.id)])), [openFindings, hypotheses])

  return <section className="bench-guided-panel bench-diagnosis-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">DIAGNOSIS</p><strong>Findings → possible causes → checks</strong></div><span>{openFindings.length} open</span></div>
    <p className="bench-guided-help">Calibre can suggest avenues to investigate, but a suggestion is not a diagnosis. Confirm or rule out causes only when the bench evidence supports it.</p>
    {openFindings.length === 0 && <p className="muted">No open findings yet. Problems recorded during induction or Bench capture will appear here.</p>}
    <div className="bench-diagnosis-findings">{openFindings.map((finding) => {
      const rows = grouped.get(finding.id) ?? []
      return <article className="bench-diagnosis-finding" key={finding.id}>
        <div className="bench-diagnosis-finding-head"><div><span>{titleCase(finding.finding_type)} · {titleCase(finding.severity)}</span><strong>{finding.title}</strong></div>{rows.length === 0 && <button type="button" disabled={busy} onClick={() => void suggest(finding)}>Suggest investigation</button>}</div>
        {finding.details && <p>{finding.details}</p>}
        {rows.length > 0 && <div className="bench-hypothesis-list">{rows.map((row) => {
          const rowChecks = checks.filter((check) => check.hypothesis_id === row.id)
          return <div className={`bench-hypothesis status-${row.status}`} key={row.id}>
            <div className="bench-hypothesis-head"><div><span>{row.status === 'possible' ? 'POSSIBLE — NOT CONFIRMED' : titleCase(row.status)}</span><strong>{row.title}</strong></div><em>{titleCase(row.confidence)}</em></div>
            <p>{row.rationale}</p>
            {rowChecks.length > 0 && <div className="bench-diagnostic-checks">{rowChecks.map((check) => <div className={`bench-diagnostic-check status-${check.status}`} key={check.id}><div><strong>{check.label}</strong><p>{check.instructions}</p></div><div className="bench-diagnostic-check-actions"><button type="button" className={check.status === 'complete' ? 'selected' : 'secondary'} disabled={busy} onClick={() => void setCheckStatus(check, check.status === 'complete' ? 'suggested' : 'complete')}>{check.status === 'complete' ? 'Completed' : 'Mark checked'}</button><button type="button" className={check.status === 'not_applicable' ? 'selected' : 'secondary'} disabled={busy} onClick={() => void setCheckStatus(check, check.status === 'not_applicable' ? 'suggested' : 'not_applicable')}>N/A</button></div></div>)}</div>}
            <div className="bench-hypothesis-actions"><button type="button" disabled={busy || row.status === 'confirmed'} onClick={() => void setHypothesisStatus(row, 'confirmed')}>Confirm cause</button><button type="button" className="secondary" disabled={busy || row.status === 'ruled_out'} onClick={() => void setHypothesisStatus(row, 'ruled_out')}>Rule out</button>{row.status !== 'possible' && <button type="button" className="secondary" disabled={busy} onClick={() => void setHypothesisStatus(row, 'possible')}>Reopen</button>}</div>
          </div>
        })}</div>}
      </article>
    })}</div>
    {message && <p className="bench-guided-message">{message}</p>}
  </section>
}
