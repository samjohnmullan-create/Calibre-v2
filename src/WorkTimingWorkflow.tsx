import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './work-timing-workflow.css'

type TimingCheckpoint = 'pre_service' | 'post_reassembly' | 'regulation' | 'final_qc' | 'standalone' | 'other'
type TimingRun = {
  id: string
  checkpoint: TimingCheckpoint
  bph: number
  rate_seconds_per_day: number
  beat_error_ms: number | null
  amplitude_deg: number | null
  lift_angle_deg: number | null
  position: string
  duration_seconds: number | null
  stability_score: number | null
  confidence: string
  device: string
  notes: string
  recorded_at: string
}

type CheckpointDef = { key: TimingCheckpoint; short: string; label: string; hint: string }

const checkpoints: CheckpointDef[] = [
  { key: 'pre_service', short: 'Before', label: 'Pre-service', hint: 'Baseline before dismantling or intervention' },
  { key: 'post_reassembly', short: 'Reassembly', label: 'Post-reassembly', hint: 'First stable run after reassembly' },
  { key: 'regulation', short: 'Regulation', label: 'Regulation', hint: 'Adjustment and positional regulation runs' },
  { key: 'final_qc', short: 'Final', label: 'Final QC', hint: 'Final timing evidence before completion' },
]

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function when(value: string) {
  return new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}`
}

function checkpointLabel(value: TimingCheckpoint) {
  return checkpoints.find((entry) => entry.key === value)?.label ?? titleCase(value)
}

function latestByCheckpoint(runs: TimingRun[]) {
  const result = new Map<TimingCheckpoint, TimingRun>()
  for (const run of runs) if (!result.has(run.checkpoint)) result.set(run.checkpoint, run)
  return result
}

function positionalSpread(runs: TimingRun[], checkpoint: TimingCheckpoint) {
  const relevant = runs.filter((run) => run.checkpoint === checkpoint && run.position && run.position !== 'other')
  const latestByPosition = new Map<string, TimingRun>()
  for (const run of relevant) if (!latestByPosition.has(run.position)) latestByPosition.set(run.position, run)
  const values = [...latestByPosition.values()].map((run) => Number(run.rate_seconds_per_day))
  if (values.length < 2) return null
  return {
    positions: values.length,
    spread: Math.max(...values) - Math.min(...values),
  }
}

function TimingComparison({ runs }: { runs: TimingRun[] }) {
  const latest = useMemo(() => latestByCheckpoint(runs), [runs])
  const plotted = checkpoints.map((entry, index) => {
    const run = latest.get(entry.key)
    return run ? { index, entry, run, rate: Number(run.rate_seconds_per_day) } : null
  }).filter(Boolean) as { index: number; entry: CheckpointDef; run: TimingRun; rate: number }[]

  const chart = useMemo(() => {
    if (plotted.length < 2) return null
    const rates = plotted.map((point) => point.rate)
    const min = Math.min(...rates)
    const max = Math.max(...rates)
    const padding = Math.max(5, (max - min) * .18)
    const low = min - padding
    const high = max + padding
    const range = Math.max(1, high - low)
    const points = plotted.map((point) => {
      const x = 10 + (point.index / Math.max(1, checkpoints.length - 1)) * 80
      const y = 86 - ((point.rate - low) / range) * 72
      return { ...point, x, y }
    })
    return { points, polyline: points.map((point) => `${point.x},${point.y}`).join(' ') }
  }, [plotted])

  if (runs.length === 0) return null

  return (
    <div className="timing-workflow-comparison">
      <div className="timing-workflow-checkpoints">
        {checkpoints.map((entry) => {
          const run = latest.get(entry.key)
          const spread = positionalSpread(runs, entry.key)
          return (
            <div className={`timing-checkpoint-card ${run ? 'has-run' : ''}`} key={entry.key}>
              <span>{entry.short}</span>
              {run ? (
                <>
                  <strong>{signed(Number(run.rate_seconds_per_day))} s/d</strong>
                  <small>{run.beat_error_ms == null ? 'Beat error —' : `${Number(run.beat_error_ms)} ms`} · {titleCase(run.position || 'unspecified')}</small>
                  {spread && <em>{Number(spread.spread.toFixed(1))} s/d spread · {spread.positions} positions</em>}
                </>
              ) : <p>{entry.hint}</p>}
            </div>
          )
        })}
      </div>

      {chart && (
        <div className="timing-workflow-chart" aria-label="Timing rate comparison across service checkpoints">
          <svg viewBox="0 0 100 100" role="img">
            <line x1="8" y1="50" x2="92" y2="50" className="zero-guide" />
            <polyline points={chart.polyline} className="rate-line" />
            {chart.points.map((point) => <circle key={point.entry.key} cx={point.x} cy={point.y} r="2.7" />)}
          </svg>
          <div>{checkpoints.map((entry) => <span key={entry.key}>{entry.short}</span>)}</div>
        </div>
      )}

      {plotted.length >= 2 && (() => {
        const first = plotted[0].run
        const last = plotted[plotted.length - 1].run
        const rateChange = Math.abs(Number(first.rate_seconds_per_day)) - Math.abs(Number(last.rate_seconds_per_day))
        const beatChange = first.beat_error_ms != null && last.beat_error_ms != null ? Number(first.beat_error_ms) - Number(last.beat_error_ms) : null
        return (
          <div className="timing-workflow-delta">
            <div><span>Absolute rate change</span><strong>{rateChange > 0 ? `${Number(rateChange.toFixed(1))} s/d better` : rateChange < 0 ? `${Number(Math.abs(rateChange).toFixed(1))} s/d worse` : 'No change'}</strong></div>
            <div><span>Beat error change</span><strong>{beatChange == null ? 'Not comparable' : beatChange > 0 ? `${Number(beatChange.toFixed(2))} ms better` : beatChange < 0 ? `${Number(Math.abs(beatChange).toFixed(2))} ms worse` : 'No change'}</strong></div>
          </div>
        )
      })()}
    </div>
  )
}

export default function WorkTimingWorkflow({ workspaceId, itemId, workId }: { workspaceId: string; itemId: string; workId: string }) {
  const [runs, setRuns] = useState<TimingRun[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [checkpoint, setCheckpoint] = useState<TimingCheckpoint>('pre_service')
  const [bph, setBph] = useState('18000')
  const [rate, setRate] = useState('')
  const [beatError, setBeatError] = useState('')
  const [position, setPosition] = useState('dial_up')
  const [duration, setDuration] = useState('')
  const [confidence, setConfidence] = useState('confirmed')
  const [device, setDevice] = useState('manual')
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    const result = await supabase.from('timing_runs')
      .select('id,checkpoint,bph,rate_seconds_per_day,beat_error_ms,amplitude_deg,lift_angle_deg,position,duration_seconds,stability_score,confidence,device,notes,recorded_at')
      .eq('workspace_id', workspaceId)
      .eq('work_id', workId)
      .order('recorded_at', { ascending: false })
      .limit(80)
    setLoading(false)
    if (result.error) {
      setMessage(`Timing could not be loaded: ${result.error.message}`)
      return
    }
    setRuns((result.data ?? []) as TimingRun[])
    setMessage('')
  }

  useEffect(() => { void load() }, [workspaceId, itemId, workId])

  async function addRun(event: FormEvent) {
    event.preventDefault()
    const parsedBph = Number(bph)
    const parsedRate = Number(rate)
    const parsedBeat = beatError.trim() ? Number(beatError) : null
    const parsedDuration = duration.trim() ? Number(duration) : null
    if (!Number.isFinite(parsedBph) || !Number.isFinite(parsedRate) || (parsedBeat != null && !Number.isFinite(parsedBeat)) || (parsedDuration != null && (!Number.isFinite(parsedDuration) || parsedDuration < 0))) return

    setSaving(true)
    const result = await supabase.from('timing_runs').insert({
      workspace_id: workspaceId,
      item_id: itemId,
      work_id: workId,
      checkpoint,
      bph: parsedBph,
      rate_seconds_per_day: parsedRate,
      beat_error_ms: parsedBeat,
      amplitude_deg: null,
      lift_angle_deg: null,
      position,
      duration_seconds: parsedDuration,
      confidence,
      device: device.trim() || 'manual',
      notes: notes.trim(),
    })
    setSaving(false)
    if (result.error) {
      setMessage(`Timing run could not be saved: ${result.error.message}`)
      return
    }
    setRate('')
    setBeatError('')
    setDuration('')
    setNotes('')
    setMessage(`${checkpointLabel(checkpoint)} timing run saved.`)
    await load()
  }

  return (
    <section className="section-card timing-workflow-card">
      <div className="work-ops-heading"><div><p className="eyebrow">TIMING</p><h3>Timing workflow</h3></div><span>{runs.length}</span></div>
      <p className="timing-workflow-intro">Record why a run exists, not just its numbers. Amplitude remains intentionally blank until the hardware path is validated.</p>

      <TimingComparison runs={runs} />

      <form className="timing-workflow-form" onSubmit={addRun}>
        <label>Checkpoint<select value={checkpoint} onChange={(event) => setCheckpoint(event.target.value as TimingCheckpoint)}>{checkpoints.map((entry) => <option value={entry.key} key={entry.key}>{entry.label}</option>)}<option value="other">Other</option></select></label>
        <label>BPH<input inputMode="numeric" value={bph} onChange={(event) => setBph(event.target.value)} /></label>
        <label>Rate s/day<input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="+12" /></label>
        <label>Beat error ms<input inputMode="decimal" value={beatError} onChange={(event) => setBeatError(event.target.value)} placeholder="0.6" /></label>
        <label>Position<select value={position} onChange={(event) => setPosition(event.target.value)}><option value="dial_up">Dial up</option><option value="dial_down">Dial down</option><option value="crown_up">Crown up</option><option value="crown_down">Crown down</option><option value="crown_left">Crown left</option><option value="crown_right">Crown right</option><option value="other">Other</option></select></label>
        <label>Sample seconds<input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="30" /></label>
        <label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value)}><option value="confirmed">Confirmed</option><option value="strong">Strong</option><option value="probable">Probable</option><option value="possible">Possible</option><option value="unknown">Unknown</option></select></label>
        <label>Device<input value={device} onChange={(event) => setDevice(event.target.value)} placeholder="manual / mic profile" /></label>
        <label className="span-all">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Power state, positional sequence, signal note or observation…" /></label>
        <div className="span-all timing-workflow-form-actions"><button disabled={saving || !rate.trim()}>{saving ? 'Saving…' : 'Add timing run'}</button></div>
      </form>

      {message && <p className="work-ops-message">{message}</p>}
      {loading ? <p className="muted">Loading timing history…</p> : runs.length === 0 ? <p className="muted">No timing evidence recorded for this Work yet.</p> : (
        <div className="timing-workflow-history">
          {runs.map((run) => {
            const weakSignal = run.confidence === 'possible' || run.confidence === 'unknown'
            return (
              <div className="timing-workflow-row" key={run.id}>
                <div><span>{checkpointLabel(run.checkpoint)}</span><strong>{titleCase(run.position || 'unspecified')} · {run.bph} BPH</strong><small>{run.notes || `${titleCase(run.confidence)} · ${run.device || 'Unknown device'}`}</small></div>
                <div><strong>{signed(Number(run.rate_seconds_per_day))} s/d</strong><span>{run.beat_error_ms == null ? 'Beat error —' : `${Number(run.beat_error_ms)} ms`}{run.duration_seconds != null ? ` · ${run.duration_seconds}s` : ''}</span><small>{when(run.recorded_at)}</small>{weakSignal && <em>Low recorded confidence</em>}</div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
