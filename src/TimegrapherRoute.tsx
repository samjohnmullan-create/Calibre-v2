import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { analyseTiming, diagnoseSignal, lockState, STANDARD_BPH, tracePoints, type AudioLevel, type BeatSample, type TimingResult } from './timegrapher-engine'
import './timegrapher-v2.css'

type TimingCheckpoint = 'pre_service' | 'post_reassembly' | 'regulation' | 'final_qc' | 'standalone' | 'other'
type WorkContext = { id: string; item_id: string; work_number: number; title: string; status: string; item_number: number; item_title: string }
type SavedRun = { id: string; checkpoint: TimingCheckpoint; bph: number; rate_seconds_per_day: number; beat_error_ms: number | null; position: string; duration_seconds: number | null; confidence: string; device: string; notes: string; recorded_at: string }
type Calibration = { active: boolean; levels: AudioLevel[]; beatCount: number; startedAt: number }

const checkpointOptions: { value: TimingCheckpoint; label: string }[] = [
  { value: 'pre_service', label: 'Pre-service' }, { value: 'post_reassembly', label: 'Post-reassembly' }, { value: 'regulation', label: 'Regulation' }, { value: 'final_qc', label: 'Final QC' }, { value: 'other', label: 'Other' },
]
const positions = [['dial_up','Dial up'],['dial_down','Dial down'],['crown_up','Crown up'],['crown_down','Crown down'],['crown_left','Crown left'],['crown_right','Crown right'],['other','Other']]
const sensitivityOptions = [{ value: 1.6, label: 'Sensitive' }, { value: 2, label: 'Normal' }, { value: 2.6, label: 'Conservative' }]

function activeRoute() { return window.location.hash.replace(/\/$/, '').startsWith('#/timegrapher') }
function workIdFromRoute() { const [, first, second] = window.location.hash.replace(/^#\/?/, '').split('/'); return first === 'timegrapher' && second ? decodeURIComponent(second) : '' }
function titleCase(value: string) { return value.replaceAll('_',' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function signed(value?: number) { return Number.isFinite(value) ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}` : '—' }
function median(values: number[]) { const rows = values.filter(Number.isFinite).sort((a,b)=>a-b); if (!rows.length) return null; const m=Math.floor(rows.length/2); return rows.length%2?rows[m]:(rows[m-1]+rows[m])/2 }
function calibrationSummary(calibration: Calibration) {
  const strengths = calibration.levels.map((row) => Number(row.strength)), clips = calibration.levels.filter((row) => row.clipping).length, handling = calibration.levels.filter((row) => row.handling).length
  const strength = median(strengths), total = Math.max(1, calibration.levels.length), seconds = Math.max(.1, (performance.now() - calibration.startedAt) / 1000), beatRate = calibration.beatCount / seconds
  if (clips / total > .04 || handling / total > .25 || (strength ?? 0) > 12) return { sensitivity: 2.6, label: 'Conservative', message: 'Input is very strong or mechanically noisy. Use Conservative sensitivity and stabilise the contact.' }
  if (strength == null || strength < 1.8 || beatRate < 1) return { sensitivity: 1.6, label: 'Sensitive', message: 'Too few clean events were detected. Improve contact and try Sensitive detection.' }
  if (strength < 3) return { sensitivity: 1.6, label: 'Sensitive', message: 'Signal is marginal. Sensitive detection should give the best chance of a stable lock.' }
  if (strength > 8) return { sensitivity: 2.6, label: 'Conservative', message: 'Signal is strong. Conservative detection leaves more noise headroom.' }
  return { sensitivity: 2, label: 'Normal', message: 'Signal looks suitable. Keep the current contact and Normal sensitivity.' }
}

function BeatTrace({ beats, bph }: { beats: BeatSample[]; bph: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const points = useMemo(() => tracePoints(beats, bph, 120), [beats, bph])
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect(), dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)), width = Math.max(300, Math.round(rect.width * dpr)), height = Math.max(140, Math.round(rect.height * dpr))
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    const context = canvas.getContext('2d'); if (!context) return
    const style = getComputedStyle(document.documentElement), line = style.getPropertyValue('--calibre-line').trim() || '#566', accent = style.getPropertyValue('--calibre-accent').trim() || '#6aa2b5', muted = style.getPropertyValue('--calibre-muted').trim() || '#84979a'
    context.clearRect(0, 0, width, height); context.strokeStyle = line; context.lineWidth = dpr; context.globalAlpha = .6
    for (let i=1;i<4;i+=1) { const y=height*i/4; context.beginPath(); context.moveTo(0,y); context.lineTo(width,y); context.stroke() }
    context.globalAlpha = 1
    if (points.length < 2) { context.fillStyle=muted; context.font=`${12*dpr}px sans-serif`; context.fillText(bph ? 'Waiting for stable beat intervals…' : 'Waiting for BPH lock…', 12*dpr, height/2); return }
    const pad=10*dpr, span=Math.max(1,points.length-1), yFor=(phase:number)=>height/2+(phase/40)*(height*.42)
    context.strokeStyle=accent; context.lineWidth=1.5*dpr; context.beginPath(); points.forEach((point,index)=>{ const x=pad+(width-pad*2)*(index/span),y=yFor(point.phaseMs); if(index===0)context.moveTo(x,y); else context.lineTo(x,y) }); context.stroke()
  }, [points, bph])
  return <div className="timegrapher-trace"><canvas ref={canvasRef} /><div><span>Beat trace · interval phase, not amplitude</span><span>{bph ? `${bph} BPH · ${points.length} intervals` : 'Waiting for lock'}</span></div></div>
}

export default function TimegrapherRoute() {
  const [active,setActive]=useState(activeRoute),[workspaceId,setWorkspaceId]=useState(''),[workId,setWorkId]=useState(workIdFromRoute),[work,setWork]=useState<WorkContext|null>(null),[history,setHistory]=useState<SavedRun[]>([])
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState(''),[running,setRunning]=useState(false),[message,setMessage]=useState('Connect a timing microphone and press Start.'),[level,setLevel]=useState<AudioLevel>({}),[beats,setBeats]=useState<BeatSample[]>([]),[result,setResult]=useState<TimingResult>({ready:false,reliable:false,stage:'Idle'})
  const [manualBph,setManualBph]=useState(0),[position,setPosition]=useState('dial_up'),[checkpoint,setCheckpoint]=useState<TimingCheckpoint>('pre_service'),[sensitivity,setSensitivity]=useState(2),[notes,setNotes]=useState(''),[startedAt,setStartedAt]=useState(0),[saving,setSaving]=useState(false),[calibration,setCalibration]=useState<Calibration|null>(null),[calibrationText,setCalibrationText]=useState('Place the watch on the contact microphone, then run an 8-second calibration.')
  const streamRef=useRef<MediaStream|null>(null),audioRef=useRef<AudioContext|null>(null),nodeRef=useRef<AudioWorkletNode|null>(null),sourceRef=useRef<MediaStreamAudioSourceNode|null>(null),silentRef=useRef<GainNode|null>(null),beatsRef=useRef<BeatSample[]>([]),calibrationRef=useRef<Calibration|null>(null),timerRef=useRef<number|null>(null)

  useEffect(()=>{const sync=()=>{setActive(activeRoute());setWorkId(workIdFromRoute())};window.addEventListener('hashchange',sync);sync();return()=>window.removeEventListener('hashchange',sync)},[])
  useEffect(()=>{if(!active)return;let cancelled=false;(async()=>{const row=await supabase.from('workspaces').select('id').order('created_at',{ascending:true}).limit(1).maybeSingle();if(!cancelled&&row.data)setWorkspaceId(row.data.id)})();return()=>{cancelled=true}},[active])
  useEffect(()=>{if(!active||!workspaceId){return}let cancelled=false;(async()=>{if(!workId){setWork(null);setHistory([]);setCheckpoint('standalone');return}setCheckpoint('pre_service');const workResult=await supabase.from('workbench_jobs').select('id,item_id,work_number,title,status,item_number,item_title').eq('workspace_id',workspaceId).eq('id',workId).maybeSingle();if(cancelled)return;if(workResult.error||!workResult.data){setWork(null);setMessage(`Work context unavailable: ${workResult.error?.message??'Work not found.'}`);return}setWork(workResult.data as WorkContext);const historyResult=await supabase.from('timing_runs').select('id,checkpoint,bph,rate_seconds_per_day,beat_error_ms,position,duration_seconds,confidence,device,notes,recorded_at').eq('workspace_id',workspaceId).eq('work_id',workId).order('recorded_at',{ascending:false}).limit(20);if(!cancelled&&!historyResult.error)setHistory((historyResult.data??[]) as SavedRun[])})();return()=>{cancelled=true}},[active,workspaceId,workId])
  useEffect(()=>()=>{void stopAudio()},[])

  async function enumerate() { try { const list=await navigator.mediaDevices.enumerateDevices(); setDevices(list.filter((entry)=>entry.kind==='audioinput')); setMessage('Microphone list refreshed.') } catch(error){setMessage(`Microphones unavailable: ${error instanceof Error?error.message:String(error)}`)} }
  async function stopAudio() {
    if(timerRef.current){window.clearTimeout(timerRef.current);timerRef.current=null}
    calibrationRef.current=null;setCalibration(null)
    try{nodeRef.current?.disconnect()}catch{} try{sourceRef.current?.disconnect()}catch{} try{silentRef.current?.disconnect()}catch{}
    streamRef.current?.getTracks().forEach((track)=>track.stop()); streamRef.current=null
    if(audioRef.current&&audioRef.current.state!=='closed')try{await audioRef.current.close()}catch{};audioRef.current=null;nodeRef.current=null;sourceRef.current=null;silentRef.current=null
    setRunning(false);setResult((current)=>({...current,stage:'Stopped'}));setMessage('Stopped.')
  }
  async function startAudio() {
    await stopAudio(); setBeats([]);beatsRef.current=[];setLevel({});setResult({ready:false,reliable:false,stage:'Listening…'})
    try {
      const constraints: MediaTrackConstraints={channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}; if(deviceId)constraints.deviceId={exact:deviceId}
      const stream=await navigator.mediaDevices.getUserMedia({audio:constraints,video:false}); streamRef.current=stream
      const context=new AudioContext({latencyHint:'interactive'});audioRef.current=context;await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}calibre-tick-processor.js`)
      const source=context.createMediaStreamSource(stream),node=new AudioWorkletNode(context,'calibre-tick'),silent=context.createGain();silent.gain.value=0
      source.connect(node);node.connect(silent);silent.connect(context.destination);sourceRef.current=source;nodeRef.current=node;silentRef.current=silent;node.port.postMessage({sensitivity})
      node.port.onmessage=(event)=>{const data=event.data??{};if(data.kind==='level'){setLevel(data as AudioLevel);const cal=calibrationRef.current;if(cal){cal.levels.push(data as AudioLevel);setCalibration({...cal})}}else if(data.kind==='beat'){const next:BeatSample={t:Number(data.t),strength:Number(data.strength)||0,crest:Number(data.crest)||0},windowSeconds=60;beatsRef.current=[...beatsRef.current,next].filter((beat)=>next.t-beat.t<windowSeconds);setBeats([...beatsRef.current]);const cal=calibrationRef.current;if(cal){cal.beatCount+=1;setCalibration({...cal})}setResult(analyseTiming(beatsRef.current,manualBph))}}
      const settings=stream.getAudioTracks()[0]?.getSettings();setRunning(true);setStartedAt(performance.now());setMessage(`Listening · ${settings?.sampleRate??context.sampleRate} Hz · ${stream.getAudioTracks()[0]?.label||'microphone'}`);await enumerate()
    } catch(error){await stopAudio();setMessage(`Microphone start failed: ${error instanceof Error?error.message:String(error)}`)}
  }
  useEffect(()=>{nodeRef.current?.port.postMessage({sensitivity});if(beatsRef.current.length)setResult(analyseTiming(beatsRef.current,manualBph))},[sensitivity,manualBph])

  async function calibrate() {
    if(!running){await startAudio(); await new Promise((resolve)=>setTimeout(resolve,250))}
    const cal:Calibration={active:true,levels:[],beatCount:0,startedAt:performance.now()};calibrationRef.current=cal;setCalibration(cal);setCalibrationText('Calibrating… keep the watch and microphone still for 8 seconds.')
    if(timerRef.current)window.clearTimeout(timerRef.current)
    timerRef.current=window.setTimeout(()=>{const current=calibrationRef.current;if(!current)return;const summary=calibrationSummary(current);setSensitivity(summary.sensitivity);setCalibrationText(`${summary.message} Recommended: ${summary.label}. ${current.beatCount} tick events detected.`);calibrationRef.current=null;setCalibration(null);timerRef.current=null},8000)
  }
  async function saveRun() {
    if(!work||!result.reliable||result.bph==null||result.rateSecondsPerDay==null)return
    setSaving(true);const track=streamRef.current?.getAudioTracks()[0],settings=track?.getSettings(),duration=Math.max(1,Math.round((performance.now()-startedAt)/1000));const confidence=(result.confidence??0)>=.8?'strong':'probable'
    const insert=await supabase.from('timing_runs').insert({workspace_id:workspaceId,item_id:work.item_id,work_id:work.id,checkpoint,bph:result.bph,rate_seconds_per_day:result.rateSecondsPerDay,beat_error_ms:result.beatErrorMs??null,amplitude_deg:null,lift_angle_deg:null,position,duration_seconds:duration,stability_score:result.confidence??null,confidence,device:track?.label||'browser microphone',notes:[`Timegrapher · ${Math.round((result.confidence??0)*100)}% confidence · ${result.samples??0} samples · ${result.stabilityLabel??'unknown'} stability · ${settings?.sampleRate??audioRef.current?.sampleRate??'unknown'} Hz`,notes.trim()].filter(Boolean).join(' · ')})
    setSaving(false);if(insert.error){setMessage(`Timing run could not be saved: ${insert.error.message}`);return}setMessage(`${titleCase(checkpoint)} timing run saved to Work #${work.work_number}.`);setNotes('');const rows=await supabase.from('timing_runs').select('id,checkpoint,bph,rate_seconds_per_day,beat_error_ms,position,duration_seconds,confidence,device,notes,recorded_at').eq('workspace_id',workspaceId).eq('work_id',work.id).order('recorded_at',{ascending:false}).limit(20);if(!rows.error)setHistory((rows.data??[]) as SavedRun[])
  }

  if(!active)return null
  const lock=lockState(result,running),diagnostic=diagnoseSignal(level,result,running),track=streamRef.current?.getAudioTracks()[0],settings=track?.getSettings(),canSave=!!work&&!!result.reliable
  return <main className="timegrapher-route">
    <header className="timegrapher-heading"><div><p className="eyebrow">WORKSHOP TOOL</p><h1>Timegrapher</h1><p>{work?`Work #${work.work_number} · Item #${work.item_number} · ${work.item_title||work.title}`:'Standalone microphone test · saving is disabled until opened from a Work record.'}</p></div><button className="secondary" onClick={()=>{window.location.hash=work?'#/workbench':'#/workbench'}}>Back to Workbench</button></header>
    <div className="timegrapher-layout"><div className="timegrapher-main">
      <section className="section-card timegrapher-live"><div className="timegrapher-live-top"><div><span className="timegrapher-label">Live rate</span><div className="timegrapher-rate">{signed(result.rateSecondsPerDay)} <small>s/day</small></div><p>{result.reliable?`${result.stabilityLabel} stability · ${Math.round((result.confidence??0)*100)}% confidence`:result.stage}</p></div><div className="timegrapher-lock"><span>Detector</span><strong>{lock.label}</strong><small>{lock.detail}</small><div><i style={{width:`${lock.progress}%`}} /></div></div></div>
        <div className="timegrapher-stats"><div><span>BPH</span><strong>{result.bph??'—'}</strong></div><div><span>Beat error</span><strong>{result.beatErrorMs==null?'—':`${result.beatErrorMs.toFixed(2)} ms`}</strong></div><div><span>Confidence</span><strong>{result.confidence==null?'—':`${Math.round(result.confidence*100)}%`}</strong></div><div><span>Samples</span><strong>{result.samples??'—'}</strong></div></div>
        <BeatTrace beats={beats} bph={result.bph??manualBph} />
        <div className="timegrapher-signal"><div><span>Signal</span><strong>{diagnostic.label}</strong><small>{diagnostic.detail}{diagnostic.action?` · ${diagnostic.action}`:''}</small></div><div className="timegrapher-diagnostics"><div><span>Strength</span><strong>{level.strength?.toFixed(1)??'—'}</strong></div><div><span>Definition</span><strong>{level.crest?.toFixed(1)??'—'}</strong></div><div><span>HF floor</span><strong>{level.hfNoise?.toFixed(5)??'—'}</strong></div><div><span>Missed</span><strong>{result.missedBeatRatio==null?'—':`${Math.round(result.missedBeatRatio*100)}%`}</strong></div></div></div>
      </section>
      <section className="section-card timegrapher-controls"><div className="timegrapher-control-grid"><label>BPH<select value={manualBph} onChange={(event)=>setManualBph(Number(event.target.value))}><option value={0}>Auto — recommended</option>{STANDARD_BPH.map((value)=><option key={value} value={value}>{value}</option>)}</select></label><label>Position<select value={position} onChange={(event)=>setPosition(event.target.value)}>{positions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Checkpoint<select disabled={!work} value={work?checkpoint:'standalone'} onChange={(event)=>setCheckpoint(event.target.value as TimingCheckpoint)}>{work?checkpointOptions.map((entry)=><option key={entry.value} value={entry.value}>{entry.label}</option>):<option value="standalone">Standalone</option>}</select></label><label>Detector sensitivity<select value={sensitivity} onChange={(event)=>setSensitivity(Number(event.target.value))}>{sensitivityOptions.map((entry)=><option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label><label className="span-all">Input device<select value={deviceId} onChange={(event)=>setDeviceId(event.target.value)}><option value="">Default microphone</option>{devices.map((device)=><option key={device.deviceId} value={device.deviceId}>{device.label||`Microphone ${devices.indexOf(device)+1}`}</option>)}</select></label><label className="span-all">Run note<input value={notes} onChange={(event)=>setNotes(event.target.value)} placeholder="Power state, contact setup or observation…" /></label></div>
        <div className="timegrapher-actions"><button className="secondary" type="button" onClick={()=>void enumerate()}>Detect mics</button><button className="secondary" type="button" onClick={()=>void calibrate()}>{calibration?.active?'Calibrating…':'Calibrate 8s'}</button><button type="button" onClick={()=>void startAudio()} disabled={running}>Start</button><button className="secondary" type="button" onClick={()=>void stopAudio()} disabled={!running}>Stop</button><button type="button" onClick={()=>void saveRun()} disabled={!canSave||saving}>{saving?'Saving…':'Save run'}</button></div><p className="timegrapher-message">{message}</p><div className="timegrapher-calibration"><strong>Calibration</strong><span>{calibrationText}</span></div><p className="muted">Amplitude is deliberately not inferred from microphone loudness. It remains blank until Calibre has a defensible amplitude model.</p>
      </section>
    </div><aside className="timegrapher-side"><section className="section-card"><p className="eyebrow">HARDWARE</p><div className="timegrapher-hardware"><div><span>Input</span><strong>{track?.label||'Not open'}</strong></div><div><span>Sample rate</span><strong>{settings?.sampleRate??audioRef.current?.sampleRate??'—'} Hz</strong></div><div><span>Channels</span><strong>{settings?.channelCount??'—'}</strong></div><div><span>Echo cancellation</span><strong>{settings?.echoCancellation===false?'Off':settings?.echoCancellation===true?'On':'—'}</strong></div><div><span>Noise suppression</span><strong>{settings?.noiseSuppression===false?'Off':settings?.noiseSuppression===true?'On':'—'}</strong></div><div><span>Auto gain</span><strong>{settings?.autoGainControl===false?'Off':settings?.autoGainControl===true?'On':'—'}</strong></div></div></section>
      <section className="section-card"><p className="eyebrow">RECENT RUNS</p>{!work?<p className="muted">Open Timegrapher from a Work record to see and save timing history.</p>:history.length===0?<p className="muted">No saved timing runs yet.</p>:<div className="timegrapher-history">{history.map((run)=><div key={run.id}><div><strong>{titleCase(run.checkpoint)}</strong><span>{titleCase(run.position)} · {run.bph} BPH</span></div><div><strong>{signed(run.rate_seconds_per_day)} s/d</strong><span>{run.beat_error_ms==null?'Beat —':`${run.beat_error_ms} ms`} · {new Date(run.recorded_at).toLocaleDateString('en-AU')}</span></div></div>)}</div>}</section>
    </aside></div>
  </main>
}
