import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './bench-exceptions-v2.css'

type Severity = 'critical' | 'warning' | 'success' | 'info'
type ExceptionCard = { code: string; severity: Severity; title: string; detail: string; action?: 'timing' }
type WorkRow = { status: string; blocker: string; type: string; completion_summary: string }
type ItemRow = { type: string }
type StepRow = { id: string; label: string; description: string; section_key: string; sequence: number; required: boolean; status: string }
type NeedRow = { id: string; status: string }
type QcRow = { id: string; label: string; check_key: string; required: boolean; status: string }
type TimingRow = { id: string; checkpoint: string; rate_seconds_per_day: number; beat_error_ms: number | null; confidence: string; stability_score: number | null; recorded_at: string }

const terminal = (status: string) => ['done', 'na', 'not_applicable'].includes(String(status || '').toLowerCase())
const qcLike = (step: StepRow) => /\b(qc|quality|final check|final inspection)\b/i.test([step.section_key, step.label, step.description].filter(Boolean).join(' '))
const confidenceScore = (run: TimingRow) => {
  const stability = Number(run.stability_score)
  if (Number.isFinite(stability) && stability > 0) return stability
  return ({ confirmed: 1, strong: .9, probable: .75, possible: .55, unknown: 0 } as Record<string, number>)[String(run.confidence || '').toLowerCase()] ?? 0
}
const usableTiming = (run: TimingRow) => Number.isFinite(Number(run.rate_seconds_per_day)) && confidenceScore(run) >= .6
const byNewest = (a: TimingRow, b: TimingRow) => Date.parse(b.recorded_at || '') - Date.parse(a.recorded_at || '')
const signed = (value: number) => `${value >= 0 ? '+' : ''}${Number(value).toFixed(1)} s/day`

function timingRegression(runs: TimingRow[]) {
  const ordered = [...runs].sort(byNewest)
  const before = ordered.find((run) => run.checkpoint === 'pre_service' && usableTiming(run))
  const after = ordered.find((run) => ['final_qc', 'regulation', 'post_reassembly'].includes(run.checkpoint) && usableTiming(run))
  if (!before || !after) return null
  const beforeRate = Number(before.rate_seconds_per_day), afterRate = Number(after.rate_seconds_per_day)
  const rateDelta = Math.abs(afterRate) - Math.abs(beforeRate)
  const beforeBeat = before.beat_error_ms == null ? null : Number(before.beat_error_ms)
  const afterBeat = after.beat_error_ms == null ? null : Number(after.beat_error_ms)
  const beatDelta = beforeBeat != null && afterBeat != null ? afterBeat - beforeBeat : null
  if (rateDelta < 10 && (beatDelta == null || beatDelta < .4)) return null
  const detail: string[] = []
  if (rateDelta >= 10) detail.push(`rate moved from ${signed(beforeRate)} to ${signed(afterRate)}`)
  if (beatDelta != null && beatDelta >= .4) detail.push(`beat error increased from ${beforeBeat?.toFixed(2)} ms to ${afterBeat?.toFixed(2)} ms`)
  return detail.join('; ')
}

function deriveExceptions(work: WorkRow | null, item: ItemRow | null, steps: StepRow[], needs: NeedRow[], qc: QcRow[], timing: TimingRow[]): ExceptionCard[] {
  if (!work) return []
  const out: ExceptionCard[] = []
  const unresolvedNeeds = needs.filter((need) => ['open', 'reserved'].includes(String(need.status).toLowerCase()))
  const reservedNeeds = unresolvedNeeds.filter((need) => String(need.status).toLowerCase() === 'reserved')
  const blockedSteps = steps.filter((step) => String(step.status).toLowerCase() === 'blocked')
  const failedQc = qc.filter((check) => String(check.status).toLowerCase() === 'failed')

  if (work.blocker) out.push({ code: 'work-blocker', severity: 'critical', title: 'Work is blocked', detail: work.blocker })
  if (blockedSteps.length) out.push({ code: 'blocked-step', severity: 'critical', title: `${blockedSteps.length} checklist step${blockedSteps.length === 1 ? ' is' : 's are'} blocked`, detail: blockedSteps.slice(0, 2).map((step) => step.label || step.description || 'Checklist step').join(' · ') })
  if (unresolvedNeeds.length) out.push({ code: 'parts-open', severity: 'warning', title: `${unresolvedNeeds.length} unresolved Part Need${unresolvedNeeds.length === 1 ? '' : 's'}`, detail: reservedNeeds.length ? `${reservedNeeds.length} reserved · confirm fit/usage before continuing.` : 'Source or reserve a suitable stock or donor candidate before continuing.' })
  if (failedQc.length) out.push({ code: 'qc-failed', severity: 'critical', title: `Final QC has ${failedQc.length} failed check${failedQc.length === 1 ? '' : 's'}`, detail: failedQc.slice(0, 2).map((check) => check.label || check.check_key || 'QC check').join(' · ') })

  const regression = timingRegression(timing)
  if (regression) out.push({ code: 'timing-regression', severity: 'warning', title: 'Timing is worse than the pre-service baseline', detail: regression, action: 'timing' })

  const qcStep = steps.find(qcLike)
  const requiredBeforeQc = qcStep ? steps.filter((step) => step.required && Number(step.sequence) < Number(qcStep.sequence)) : steps.filter((step) => step.required && !qcLike(step))
  const prepComplete = requiredBeforeQc.every((step) => terminal(step.status))
  const clear = !work.blocker && blockedSteps.length === 0 && unresolvedNeeds.length === 0 && failedQc.length === 0
  const finalTiming = timing.find((run) => run.checkpoint === 'final_qc' && usableTiming(run))
  const watchLike = ['watch', 'clock', 'pocket_watch', 'wristwatch'].includes(String(item?.type || '').toLowerCase())
  const atQc = String(work.status).toLowerCase() === 'qc' || Boolean(qcStep && prepComplete && !terminal(qcStep.status))
  if (watchLike && atQc && !finalTiming) out.push({ code: 'final-timing-missing', severity: 'warning', title: 'Final timing run is still missing', detail: 'Capture a reliable Final QC timing run before releasing the job.', action: 'timing' })
  if (prepComplete && clear && String(work.status).toLowerCase() !== 'qc' && String(work.status).toLowerCase() !== 'complete') out.push({ code: 'ready-final-qc', severity: 'success', title: 'Ready for Final QC', detail: 'Required pre-QC work is complete and there are no unresolved blockers or Part Needs.' })

  const requiredChecks = qc.filter((check) => check.required)
  const qcPassed = requiredChecks.length > 0 && requiredChecks.every((check) => ['passed', 'na'].includes(String(check.status).toLowerCase()))
  const allRequired = steps.filter((step) => step.required).every((step) => terminal(step.status))
  const summaryReady = Boolean(work.completion_summary?.trim())
  if (allRequired && clear && qcPassed && summaryReady && String(work.status).toLowerCase() !== 'complete') out.push({ code: 'ready-complete', severity: 'success', title: 'Ready to complete Work', detail: 'Required workflow, QC, parts and completion summary are all clear.' })

  return out.sort((a, b) => ({ critical: 0, warning: 1, success: 2, info: 3 }[a.severity] - { critical: 0, warning: 1, success: 2, info: 3 }[b.severity]))
}

export default function BenchExceptionsPanel({ workspaceId, itemId, workId, refreshKey = 0 }: { workspaceId: string; itemId: string; workId: string; refreshKey?: number }) {
  const [work, setWork] = useState<WorkRow | null>(null), [item, setItem] = useState<ItemRow | null>(null), [steps, setSteps] = useState<StepRow[]>([]), [needs, setNeeds] = useState<NeedRow[]>([]), [qc, setQc] = useState<QcRow[]>([]), [timing, setTiming] = useState<TimingRow[]>([]), [loading, setLoading] = useState(true), [message, setMessage] = useState('')

  useEffect(() => {
    if (!workspaceId || !workId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [workResult, itemResult, stepResult, needResult, qcResult, timingResult] = await Promise.all([
        supabase.from('work_records').select('status,blocker,type,completion_summary').eq('workspace_id', workspaceId).eq('id', workId).single(),
        supabase.from('items').select('type').eq('workspace_id', workspaceId).eq('id', itemId).single(),
        supabase.from('work_checklist_steps').select('id,label,description,section_key,sequence,required,status').eq('workspace_id', workspaceId).eq('work_id', workId).order('sequence', { ascending: true }),
        supabase.from('work_part_needs').select('id,status').eq('workspace_id', workspaceId).eq('work_record_id', workId),
        supabase.from('work_qc_checks').select('id,label,check_key,required,status').eq('workspace_id', workspaceId).eq('work_id', workId),
        supabase.from('timing_runs').select('id,checkpoint,rate_seconds_per_day,beat_error_ms,confidence,stability_score,recorded_at').eq('workspace_id', workspaceId).eq('work_id', workId).order('recorded_at', { ascending: false }).limit(40),
      ])
      if (cancelled) return
      setLoading(false)
      const error = workResult.error ?? itemResult.error ?? stepResult.error ?? needResult.error ?? qcResult.error ?? timingResult.error
      if (error) { setMessage(`Bench intelligence could not load: ${error.message}`); return }
      setWork(workResult.data as WorkRow); setItem(itemResult.data as ItemRow); setSteps((stepResult.data ?? []) as StepRow[]); setNeeds((needResult.data ?? []) as NeedRow[]); setQc((qcResult.data ?? []) as QcRow[]); setTiming((timingResult.data ?? []) as TimingRow[]); setMessage('')
    })()
    return () => { cancelled = true }
  }, [workspaceId, itemId, workId, refreshKey])

  const exceptions = useMemo(() => deriveExceptions(work, item, steps, needs, qc, timing), [work, item, steps, needs, qc, timing])
  if (loading) return <section className="bench-exceptions-card"><span>Checking workshop evidence…</span></section>
  if (message) return <section className="bench-exceptions-card"><span>{message}</span></section>
  if (!exceptions.length) return <section className="bench-exceptions-card clear"><div><span className="bench-exception-icon">✓</span><div><strong>No active workshop exceptions</strong><p>Current Work evidence does not expose a blocker, unresolved part, failed QC or timing warning.</p></div></div></section>

  return <section className="bench-exceptions-card"><div className="bench-exceptions-heading"><div><p className="eyebrow">SMART CHECK</p><h3>Bench exceptions</h3></div><span>{exceptions.length}</span></div><div className="bench-exceptions-list">{exceptions.map((exception) => <article key={exception.code} className={`bench-exception ${exception.severity}`}><span className="bench-exception-icon">{exception.severity === 'critical' ? '!' : exception.severity === 'warning' ? '△' : '✓'}</span><div><strong>{exception.title}</strong><p>{exception.detail}</p>{exception.action === 'timing' && <button type="button" className="secondary small" onClick={() => { window.location.hash = `#/timegrapher/${encodeURIComponent(workId)}` }}>Open Timegrapher</button>}</div></article>)}</div></section>
}
