export const STANDARD_BPH = [14400, 18000, 19800, 21600, 25200, 28800, 36000] as const

export type BeatSample = { t: number; strength?: number; crest?: number }
export type TimingResult = {
  ready: boolean
  reliable: boolean
  stage: string
  bph?: number
  rateSecondsPerDay?: number
  beatErrorMs?: number | null
  beatErrorTrusted?: boolean
  stability?: string
  stabilityLabel?: string
  confidence?: number
  status?: 'poor' | 'good' | 'attention' | 'adjust'
  beats?: number
  samples?: number
  directSamples?: number
  missedBeatRatio?: number
  beatErrorRunSamples?: number
  jitterMs?: number
  nominalIntervalMs?: number
  measuredIntervalMs?: number
  measuredAt?: string
}

export type AudioLevel = {
  rms?: number
  pk?: number
  noise?: number
  hfNoise?: number
  threshold?: number
  diffRms?: number
  diffPk?: number
  crest?: number
  strength?: number
  handling?: boolean
  clipping?: boolean
  clippedSamples?: number
  sampleRate?: number
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const clamp01 = (n: number) => clamp(n, 0, 1)
function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
function mad(values: number[], centre = median(values)) { return median(values.map((value) => Math.abs(value - centre))) }
function intervalsFor(beats: BeatSample[]) {
  const out: number[] = []
  for (let i = 1; i < beats.length; i += 1) {
    const gap = (beats[i].t - beats[i - 1].t) * 1000
    if (gap > 65 && gap < 950) out.push(gap)
  }
  return out
}
function scoreBph(intervals: number[], bph: number) {
  const nominal = 3600000 / bph
  const residuals: number[] = [], normalised: number[] = []
  let direct = 0
  for (const gap of intervals) {
    const multiple = Math.round(gap / nominal)
    if (multiple < 1 || multiple > 4) continue
    const expected = nominal * multiple, rel = Math.abs(gap - expected) / expected
    if (rel <= .12) {
      residuals.push(rel); normalised.push(gap / multiple)
      if (multiple === 1) direct += 1
    }
  }
  if (normalised.length < 4) return null
  const residual = median(residuals), coverage = normalised.length / Math.max(intervals.length, 1), directRatio = direct / normalised.length
  return { bph, residual, coverage, score: residual * 2.5 + (1 - coverage) * .55 + (1 - directRatio) * .06 }
}
function bestStandard(intervals: number[]) {
  const scored = STANDARD_BPH.map((bph) => scoreBph(intervals, bph)).filter(Boolean).sort((a, b) => (a!.score - b!.score)) as NonNullable<ReturnType<typeof scoreBph>>[]
  if (!scored.length) return null
  const best = scored[0], second = scored[1]
  return { ...best, separation: second ? second.score - best.score : 1 }
}
function robustUsed(intervals: number[], bph: number) {
  const nominal = 3600000 / bph
  const rows: { normalised: number; multiple: number; index: number }[] = []
  intervals.forEach((gap, index) => {
    const multiple = Math.round(gap / nominal)
    if (multiple < 1 || multiple > 4) return
    const normalised = gap / multiple, rel = Math.abs(normalised - nominal) / nominal
    if (rel <= .12) rows.push({ normalised, multiple, index })
  })
  if (rows.length < 4) return []
  const centre = median(rows.map((row) => row.normalised)), deviation = mad(rows.map((row) => row.normalised), centre)
  const limit = Math.max(nominal * .0025, deviation * 3.5)
  return rows.filter((row) => Math.abs(row.normalised - centre) <= limit)
}
function longestDirectRun(rows: { normalised: number; multiple: number; index: number }[]) {
  const direct = rows.filter((row) => row.multiple === 1).sort((a, b) => a.index - b.index)
  let best: typeof direct = [], current: typeof direct = []
  for (const row of direct) {
    current = !current.length || row.index === current[current.length - 1].index + 1 ? [...current, row] : [row]
    if (current.length > best.length) best = [...current]
  }
  return best
}

export function analyseTiming(beats: BeatSample[], lockedBph = 0): TimingResult {
  const intervals = intervalsFor(beats)
  if (intervals.length < 4) return { ready: false, reliable: false, stage: beats.length ? 'Detecting ticks…' : 'Listening…' }
  const recent = intervals.slice(-36)
  let bph = Number(lockedBph) || 0, lockQuality = 1
  if (!bph) {
    const best = bestStandard(recent)
    if (!best || best.coverage < .55 || best.residual > .05) return { ready: false, reliable: false, stage: 'Determining beat rate…', beats: beats.length }
    bph = best.bph
    lockQuality = clamp01(best.coverage * .72 + Math.min(.28, Math.max(0, best.separation) * 4))
  }
  const nominal = 3600000 / bph, used = robustUsed(recent, bph)
  if (used.length < 5) return { ready: false, reliable: false, stage: 'Stabilising…', bph, beats: beats.length, samples: used.length }
  const normalised = used.map((row) => row.normalised), measured = median(normalised)
  const rate = (nominal / measured - 1) * 86400, spread = median(normalised.map((value) => Math.abs(value - measured))), jitter = spread / nominal
  const direct = used.filter((row) => row.multiple === 1), missedRatio = 1 - direct.length / used.length
  let stability = 'Poor signal'
  if (jitter < .004) stability = 'Excellent'; else if (jitter < .010) stability = 'Good'; else if (jitter < .022) stability = 'Fair'; else if (jitter < .045) stability = 'Unstable'
  const confidence = clamp01(clamp01((used.length - 4) / 16) * .30 + clamp01(1 - jitter / .05) * .42 + clamp01(1 - missedRatio * .8) * .18 + lockQuality * .10)
  const run = longestDirectRun(used), odd: number[] = [], even: number[] = []
  run.forEach((row, i) => (i % 2 ? odd : even).push(row.normalised))
  const rawBeatError = odd.length >= 3 && even.length >= 3 ? Math.abs(median(odd) - median(even)) : null
  const reliable = used.length >= 10 && confidence >= .60, beatErrorTrusted = reliable && run.length >= 8 && rawBeatError != null
  let status: TimingResult['status'] = 'poor'
  if (reliable && Math.abs(rate) <= 15 && jitter < .022) status = 'good'; else if (reliable && Math.abs(rate) <= 30) status = 'attention'; else if (reliable) status = 'adjust'
  return { ready: used.length >= 7, reliable, stage: used.length < 10 ? 'Timing…' : 'Timing', rateSecondsPerDay: rate, bph, beatErrorMs: beatErrorTrusted ? rawBeatError : null, beatErrorTrusted, stability: stability.toLowerCase(), stabilityLabel: stability, confidence, status, beats: beats.length, samples: used.length, directSamples: direct.length, missedBeatRatio: missedRatio, beatErrorRunSamples: run.length, jitterMs: spread, nominalIntervalMs: nominal, measuredIntervalMs: measured, measuredAt: new Date().toISOString() }
}

export function lockState(result: TimingResult, running: boolean) {
  if (!running) return { label: 'IDLE', progress: 0, detail: 'Microphone is not running.' }
  const stage = result.stage.toLowerCase(), samples = result.samples ?? 0, confidence = result.confidence ?? 0
  if (result.reliable) return { label: 'LOCKED', progress: 100, detail: `${Math.round(confidence * 100)}% confidence · ${samples} samples` }
  if (stage.includes('stabil')) return { label: 'STABILISING', progress: clamp(48 + samples * 2, 48, 78), detail: 'Beat rate found; waiting for cleaner intervals.' }
  if (stage.includes('beat rate') || stage.includes('determin')) return { label: 'FINDING BPH', progress: 36, detail: 'Comparing intervals with standard beat rates.' }
  if (stage.includes('timing')) return { label: 'TIMING', progress: clamp(55 + samples * 3, 55, 92), detail: 'Collecting stable intervals.' }
  if (stage.includes('detect')) return { label: 'DETECTING', progress: 22, detail: 'Ticks are arriving; building interval history.' }
  return { label: 'LISTENING', progress: 8, detail: 'Waiting for usable tick events.' }
}

export function diagnoseSignal(level: AudioLevel, result: TimingResult, running: boolean) {
  if (!running) return { label: 'Not listening', detail: 'Start the microphone to inspect signal quality.', action: '' }
  if (level.clipping) return { label: 'Clipping', detail: 'Input is saturating.', action: 'Lower gain or contact pressure' }
  if (level.handling) return { label: 'Handling noise', detail: 'Broad vibration is masking the tick.', action: 'Keep the watch and bench still' }
  const strength = level.strength ?? 0, crest = level.crest ?? 0, missed = result.missedBeatRatio ?? 0
  if (strength < 1.4) return { label: 'Very weak', detail: 'Tick energy is below detector threshold.', action: 'Increase gain / improve contact' }
  if (strength < 2.3) return { label: 'Weak', detail: 'Ticks are marginal.', action: 'Improve contact or raise gain' }
  if (crest < 1.8) return { label: 'Poor definition', detail: 'Signal is present but not sharply defined.', action: 'Reposition microphone' }
  if (missed > .35) return { label: 'Intermittent', detail: 'Many expected beat events are being missed.', action: 'Reposition / raise gain' }
  if (strength >= 8) return { label: 'Strong', detail: 'Clear impulses with good detector headroom.', action: '' }
  if (strength >= 4) return { label: 'Good', detail: 'Signal should be suitable once timing settles.', action: '' }
  return { label: 'Usable', detail: 'Signal is workable but could be cleaner.', action: 'Hold steady' }
}

export function tracePoints(beats: BeatSample[], bph: number, limit = 100) {
  const rows = beats.slice(-Math.max(2, limit)); if (!bph || rows.length < 2) return []
  const nominal = 3600 / bph; let phase = 0
  const out: { index: number; phaseMs: number; residualMs: number; multiple: number }[] = []
  for (let i = 1; i < rows.length; i += 1) {
    const gap = rows[i].t - rows[i - 1].t; if (!Number.isFinite(gap) || gap <= 0) continue
    const multiple = clamp(Math.round(gap / nominal), 1, 4), residualMs = (gap / multiple - nominal) * 1000
    phase = clamp(phase + residualMs, -40, 40); out.push({ index: i, phaseMs: phase, residualMs, multiple })
  }
  return out
}
