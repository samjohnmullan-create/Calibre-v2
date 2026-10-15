import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { analyseTiming, lockState, type AudioLevel, type BeatSample, type TimingResult } from './timegrapher-engine'
import './bench-guided-job.css'

type TimingCheckpoint = 'pre_service' | 'post_reassembly' | 'regulation' | 'final_qc' | 'other'

const checkpoints: { value: TimingCheckpoint; label: string }[] = [
  { value: 'pre_service', label: 'Pre-service' },
  { value: 'post_reassembly', label: 'Post-reassembly' },
  { value: 'regulation', label: 'Regulation' },
  { value: 'final_qc', label: 'Final QC' },
  { value: 'other', label: 'Other' },
]
const positions = [['dial_up','Dial up'],['dial_down','Dial down'],['crown_up','Crown up'],['crown_down','Crown down'],['crown_left','Crown left'],['crown_right','Crown right'],['other','Other']]
function signed(value?: number) { return Number.isFinite(value) ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}` : '—' }

export default function BenchTimegrapher({ workspaceId, itemId, workId, defaultCheckpoint = 'pre_service', onSaved }: { workspaceId: string; itemId: string; workId: string; defaultCheckpoint?: TimingCheckpoint; onSaved?: () => void | Promise<void> }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('Place the watch on the timing microphone, then Start.')
  const [beats, setBeats] = useState<BeatSample[]>([])
  const [level, setLevel] = useState<AudioLevel>({})
  const [result, setResult] = useState<TimingResult>({ ready: false, reliable: false, stage: 'Idle' })
  const [manualBph, setManualBph] = useState(0)
  const [sensitivity, setSensitivity] = useState(2)
  const [checkpoint, setCheckpoint] = useState<TimingCheckpoint>(defaultCheckpoint)
  const [position, setPosition] = useState('dial_up')
  const [notes, setNotes] = useState('')
  const [liftAngle, setLiftAngle] = useState('')
  const [liftSource, setLiftSource] = useState<'documented' | 'manual' | 'unknown'>('unknown')
  const [saving, setSaving] = useState(false)
  const [startedAt, setStartedAt] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const silentRef = useRef<GainNode | null>(null)
  const beatsRef = useRef<BeatSample[]>([])

  async function enumerate() {
    try { const list = await navigator.mediaDevices.enumerateDevices(); setDevices(list.filter((entry) => entry.kind === 'audioinput')) }
    catch { setDevices([]) }
  }

  async function loadLiftAngle() {
    const passport = await supabase.from('passports').select('knowledge_movement_id').eq('workspace_id', workspaceId).eq('item_id', itemId).maybeSingle()
    const movementId = passport.data?.knowledge_movement_id
    if (!movementId) return
    const movement = await supabase.from('knowledge_movements').select('lift_angle_deg').eq('id', movementId).maybeSingle()
    if (movement.data?.lift_angle_deg != null) { setLiftAngle(String(Number(movement.data.lift_angle_deg))); setLiftSource('documented') }
  }

  useEffect(() => { void enumerate(); void loadLiftAngle(); return () => { void stopAudio() } }, [workspaceId, itemId, workId])
  useEffect(() => { nodeRef.current?.port.postMessage({ sensitivity }); if (beatsRef.current.length) setResult(analyseTiming(beatsRef.current, manualBph)) }, [sensitivity, manualBph])

  async function stopAudio() {
    try { nodeRef.current?.disconnect() } catch {}
    try { sourceRef.current?.disconnect() } catch {}
    try { silentRef.current?.disconnect() } catch {}
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (audioRef.current && audioRef.current.state !== 'closed') try { await audioRef.current.close() } catch {}
    audioRef.current = null; nodeRef.current = null; sourceRef.current = null; silentRef.current = null
    setRunning(false)
  }

  async function startAudio() {
    await stopAudio(); setBeats([]); beatsRef.current = []; setLevel({}); setResult({ ready: false, reliable: false, stage: 'Listening…' })
    try {
      const constraints: MediaTrackConstraints = { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      if (deviceId) constraints.deviceId = { exact: deviceId }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false })
      streamRef.current = stream
      const context = new AudioContext({ latencyHint: 'interactive' }); audioRef.current = context
      await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}calibre-tick-processor.js`)
      const source = context.createMediaStreamSource(stream), node = new AudioWorkletNode(context, 'calibre-tick'), silent = context.createGain()
      silent.gain.value = 0; source.connect(node); node.connect(silent); silent.connect(context.destination)
      sourceRef.current = source; nodeRef.current = node; silentRef.current = silent
      node.port.postMessage({ sensitivity })
      node.port.onmessage = (event) => {
        const data = event.data ?? {}
        if (data.kind === 'level') setLevel(data as AudioLevel)
        if (data.kind === 'beat') {
          const next: BeatSample = { t: Number(data.t), strength: Number(data.strength) || 0, crest: Number(data.crest) || 0 }
          beatsRef.current = [...beatsRef.current, next].filter((beat) => next.t - beat.t < 60)
          setBeats([...beatsRef.current]); setResult(analyseTiming(beatsRef.current, manualBph))
        }
      }
      setStartedAt(performance.now()); setRunning(true)
      const settings = stream.getAudioTracks()[0]?.getSettings()
      setMessage(`Listening · ${settings?.sampleRate ?? context.sampleRate} Hz · ${stream.getAudioTracks()[0]?.label || 'microphone'}`)
      await enumerate()
    } catch (error) { await stopAudio(); setMessage(`Microphone start failed: ${error instanceof Error ? error.message : String(error)}`) }
  }

  async function saveRun() {
    if (!result.reliable || result.bph == null || result.rateSecondsPerDay == null || saving) return
    const lift = liftAngle.trim() ? Number(liftAngle) : null
    if (lift != null && !Number.isFinite(lift)) return setMessage('Lift angle must be a number or left blank.')
    setSaving(true)
    const track = streamRef.current?.getAudioTracks()[0], settings = track?.getSettings(), duration = Math.max(1, Math.round((performance.now() - startedAt) / 1000))
    const confidence = (result.confidence ?? 0) >= .8 ? 'strong' : 'probable'
    const saved = await supabase.from('timing_runs').insert({
      workspace_id: workspaceId, item_id: itemId, work_id: workId, checkpoint,
      bph: result.bph, rate_seconds_per_day: result.rateSecondsPerDay, beat_error_ms: result.beatErrorMs ?? null,
      amplitude_deg: null, lift_angle_deg: lift, position, duration_seconds: duration,
      stability_score: result.confidence ?? null, confidence, device: track?.label || 'browser microphone',
      notes: [`Bench Timegrapher · ${Math.round((result.confidence ?? 0) * 100)}% confidence · ${result.samples ?? 0} samples · ${result.stabilityLabel ?? 'unknown'} stability · ${settings?.sampleRate ?? audioRef.current?.sampleRate ?? 'unknown'} Hz`, lift != null ? `lift angle ${lift}° (${liftSource})` : 'lift angle unknown', notes.trim()].filter(Boolean).join(' · '),
    })
    setSaving(false)
    if (saved.error) return setMessage(`Timing run could not be saved: ${saved.error.message}`)
    setMessage(`${checkpoints.find((row) => row.value === checkpoint)?.label ?? 'Timing'} run saved to this Work.`); setNotes(''); await onSaved?.()
  }

  const lock = lockState(result, running)
  const canSave = result.reliable === true
  return <section className="bench-guided-panel bench-timegrapher-panel">
    <div className="bench-guided-heading"><div><p className="eyebrow">LIVE TIMEGRAPHER</p><strong>Timing belongs to this Work</strong></div><span>{lock.label}</span></div>
    <div className="bench-timing-live"><div><span>RATE</span><strong>{signed(result.rateSecondsPerDay)} <small>s/day</small></strong><em>{result.stabilityLabel ?? result.stage}</em></div><div><span>BPH</span><strong>{result.bph ?? '—'}</strong></div><div><span>BEAT ERROR</span><strong>{result.beatErrorMs == null ? '—' : `${result.beatErrorMs.toFixed(2)} ms`}</strong></div><div><span>CONFIDENCE</span><strong>{result.confidence == null ? '—' : `${Math.round(result.confidence * 100)}%`}</strong></div></div>
    <div className="bench-timing-level"><span>Signal</span><div><i style={{ width: `${Math.min(100, Math.max(2, Number(level.strength ?? 0) * 8))}%` }} /></div><small>{beats.length} events</small></div>
    <div className="bench-timing-controls">
      <label>Microphone<select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}><option value="">Default input</option>{devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Audio input'}</option>)}</select></label>
      <label>Checkpoint<select value={checkpoint} onChange={(event) => setCheckpoint(event.target.value as TimingCheckpoint)}>{checkpoints.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>
      <label>Position<select value={position} onChange={(event) => setPosition(event.target.value)}>{positions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Manual BPH<input inputMode="numeric" value={manualBph || ''} onChange={(event) => setManualBph(Number(event.target.value) || 0)} placeholder="Auto" /></label>
      <label>Lift angle °<input inputMode="decimal" value={liftAngle} onChange={(event) => { setLiftAngle(event.target.value); setLiftSource(event.target.value ? 'manual' : 'unknown') }} placeholder="Unknown" /><small>{liftSource === 'documented' ? 'Documented movement value' : liftSource === 'manual' ? 'Manually entered' : 'Not supplied'}</small></label>
      <label>Sensitivity<select value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))}><option value={1.6}>Sensitive</option><option value={2}>Normal</option><option value={2.6}>Conservative</option></select></label>
      <label className="span-all">Timing note<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Power state, position note, observation…" /></label>
    </div>
    <div className="bench-guided-actions">{!running ? <button type="button" onClick={() => void startAudio()}>Start Timegrapher</button> : <button type="button" className="secondary" onClick={() => void stopAudio()}>Stop</button>}<button type="button" disabled={!canSave || saving} onClick={() => void saveRun()}>{saving ? 'Saving…' : 'Save run'}</button><button type="button" className="secondary" onClick={() => void enumerate()}>Refresh mics</button></div>
    <p className="bench-guided-message">{message}</p>
  </section>
}
