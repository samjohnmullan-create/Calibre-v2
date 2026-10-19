export const STANDARD_BPH = [14400, 18000, 19800, 21600, 25200, 28800, 36000] as const

export type BeatSample = { t: number; strength?: number; crest?: number }
export type TimingResult = { ready:boolean; reliable:boolean; stage:string; bph?:number; rateSecondsPerDay?:number; beatErrorMs?:number|null; beatErrorTrusted?:boolean; stability?:string; stabilityLabel?:string; confidence?:number; status?:'poor'|'good'|'attention'|'adjust'; beats?:number; samples?:number; directSamples?:number; missedBeatRatio?:number; beatErrorRunSamples?:number; jitterMs?:number; nominalIntervalMs?:number; measuredIntervalMs?:number; measuredAt?:string }
export type AudioLevel = { rms?:number; pk?:number; noise?:number; hfNoise?:number; threshold?:number; diffRms?:number; diffPk?:number; crest?:number; strength?:number; handling?:boolean; clipping?:boolean; clippedSamples?:number; sampleRate?:number }

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
const clamp01=(n:number)=>clamp(n,0,1)
function median(values:number[]){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function mad(values:number[],centre=median(values)){return median(values.map(v=>Math.abs(v-centre)))}

type Match={normalised:number;multiple:number;index:number;gap:number;error:number}
function candidateMatches(beats:BeatSample[],bph:number){
  const nominal=3600000/bph,rows:Match[]=[]
  let lastAccepted=-1
  for(let i=1;i<beats.length;i+=1){
    const gap=(beats[i].t-beats[i-1].t)*1000
    if(!Number.isFinite(gap)||gap<=0)continue
    // Extra acoustic impulses shorter than roughly half a real beat are noise,
    // not evidence against the candidate beat rate.
    if(gap<nominal*.48)continue
    const multiple=Math.round(gap/nominal)
    if(multiple<1||multiple>6)continue
    const normalised=gap/multiple,error=Math.abs(normalised-nominal)/nominal
    if(error<=.10){rows.push({normalised,multiple,index:i-1,gap,error});lastAccepted=i}
  }
  return {nominal,rows,lastAccepted}
}
function scoreCandidate(beats:BeatSample[],bph:number){
  const {rows}=candidateMatches(beats,bph)
  if(rows.length<4)return null
  const errors=rows.map(r=>r.error),direct=rows.filter(r=>r.multiple===1).length
  const residual=median(errors),directRatio=direct/rows.length
  // Reward a repeating clock. Random peaks can match occasionally, but they
  // rarely produce many low-residual intervals at one standard BPH.
  const consistency=clamp01(rows.length/14)
  const quality=clamp01(1-residual/.10)
  const score=consistency*.52+quality*.33+directRatio*.15
  return {bph,rows,residual,directRatio,score}
}
function findPeriodicRate(beats:BeatSample[]){
  const window=beats.slice(-90)
  const scored=STANDARD_BPH.map(b=>scoreCandidate(window,b)).filter(Boolean).sort((a,b)=>b!.score-a!.score) as NonNullable<ReturnType<typeof scoreCandidate>>[]
  if(!scored.length)return null
  const best=scored[0],second=scored[1]
  const separation=second?best.score-second.score:best.score
  // Require a genuine periodic cluster, but do not punish unrelated extra
  // impulses: those are deliberately ignored by candidateMatches.
  if(best.rows.length<6||best.residual>.055||best.score<.58)return null
  return {...best,separation}
}
function robustRows(beats:BeatSample[],bph:number){
  const {nominal,rows}=candidateMatches(beats.slice(-90),bph)
  if(rows.length<4)return []
  const centre=median(rows.map(r=>r.normalised)),deviation=mad(rows.map(r=>r.normalised),centre)
  const limit=Math.max(nominal*.0035,deviation*4)
  return rows.filter(r=>Math.abs(r.normalised-centre)<=limit)
}
function longestDirectRun(rows:Match[]){
  const direct=rows.filter(r=>r.multiple===1).sort((a,b)=>a.index-b.index);let best:Match[]=[],current:Match[]=[]
  for(const row of direct){current=!current.length||row.index===current[current.length-1].index+1?[...current,row]:[row];if(current.length>best.length)best=[...current]}
  return best
}

export function analyseTiming(beats:BeatSample[],lockedBph=0):TimingResult{
  if(beats.length<6)return{ready:false,reliable:false,stage:beats.length?'Detecting ticks…':'Listening…',beats:beats.length}
  let bph=Number(lockedBph)||0,lockQuality=1
  if(!bph){
    const best=findPeriodicRate(beats)
    if(!best)return{ready:false,reliable:false,stage:'Finding periodic beat…',beats:beats.length}
    bph=best.bph
    lockQuality=clamp01(best.score*.8+Math.max(0,best.separation)*2)
  }
  const nominal=3600000/bph,used=robustRows(beats,bph)
  if(used.length<5)return{ready:false,reliable:false,stage:'Stabilising…',bph,beats:beats.length,samples:used.length}
  const normalised=used.map(r=>r.normalised),measured=median(normalised)
  const rate=(nominal/measured-1)*86400,spread=median(normalised.map(v=>Math.abs(v-measured))),jitter=spread/nominal
  const direct=used.filter(r=>r.multiple===1),missedRatio=1-direct.length/used.length
  let stability='Poor signal';if(jitter<.004)stability='Excellent';else if(jitter<.010)stability='Good';else if(jitter<.022)stability='Fair';else if(jitter<.045)stability='Unstable'
  const confidence=clamp01(clamp01((used.length-4)/16)*.30+clamp01(1-jitter/.05)*.42+clamp01(1-missedRatio*.65)*.18+lockQuality*.10)
  const run=longestDirectRun(used),odd:number[]=[],even:number[]=[]
  run.forEach((row,i)=>(i%2?odd:even).push(row.normalised))
  const rawBeatError=odd.length>=3&&even.length>=3?Math.abs(median(odd)-median(even)):null
  const reliable=used.length>=10&&confidence>=.60,beatErrorTrusted=reliable&&run.length>=8&&rawBeatError!=null
  let status:TimingResult['status']='poor';if(reliable&&Math.abs(rate)<=15&&jitter<.022)status='good';else if(reliable&&Math.abs(rate)<=30)status='attention';else if(reliable)status='adjust'
  return{ready:used.length>=7,reliable,stage:used.length<10?'Timing…':'Timing',rateSecondsPerDay:rate,bph,beatErrorMs:beatErrorTrusted?rawBeatError:null,beatErrorTrusted,stability:stability.toLowerCase(),stabilityLabel:stability,confidence,status,beats:beats.length,samples:used.length,directSamples:direct.length,missedBeatRatio:missedRatio,beatErrorRunSamples:run.length,jitterMs:spread,nominalIntervalMs:nominal,measuredIntervalMs:measured,measuredAt:new Date().toISOString()}
}

export function lockState(result:TimingResult,running:boolean){
  if(!running)return{label:'IDLE',progress:0,detail:'Microphone is not running.'}
  const stage=result.stage.toLowerCase(),samples=result.samples??0,confidence=result.confidence??0
  if(result.reliable)return{label:'LOCKED',progress:100,detail:`${Math.round(confidence*100)}% confidence · ${samples} samples`}
  if(stage.includes('periodic'))return{label:'FINDING CLOCK',progress:34,detail:'Ignoring stray impulses and looking for a repeating watch beat.'}
  if(stage.includes('stabil'))return{label:'STABILISING',progress:clamp(48+samples*2,48,78),detail:'Beat rate found; waiting for cleaner intervals.'}
  if(stage.includes('timing'))return{label:'TIMING',progress:clamp(55+samples*3,55,92),detail:'Collecting stable intervals.'}
  if(stage.includes('detect'))return{label:'DETECTING',progress:22,detail:'Building candidate impulse history.'}
  return{label:'LISTENING',progress:8,detail:'Waiting for usable watch impulses.'}
}

export function diagnoseSignal(level:AudioLevel,result:TimingResult,running:boolean){
  if(!running)return{label:'Not listening',detail:'Start the microphone to inspect signal quality.',action:''}
  if(level.clipping)return{label:'Clipping',detail:'Input is saturating.',action:'Lower gain or contact pressure'}
  if(level.handling)return{label:'Handling noise',detail:'Broad vibration is masking the tick.',action:'Keep the watch and bench still'}
  const strength=level.strength??0,crest=level.crest??0,missed=result.missedBeatRatio??0
  if(strength<1.4)return{label:'Very weak',detail:'Tick energy is below detector threshold.',action:'Increase gain / improve contact'}
  if(strength<2.3)return{label:'Weak',detail:'Ticks are marginal.',action:'Improve contact or raise gain'}
  if(crest<1.8)return{label:'Poor definition',detail:'Signal is present but not sharply defined.',action:'Reposition microphone'}
  if(missed>.35)return{label:'Intermittent',detail:'Many expected beat events are being missed.',action:'Reposition / raise gain'}
  if(strength>=8)return{label:'Strong',detail:'Clear impulses with good detector headroom.',action:''}
  if(strength>=4)return{label:'Good',detail:'Signal should be suitable once timing settles.',action:''}
  return{label:'Usable',detail:'Signal is workable but could be cleaner.',action:'Hold steady'}
}

export function tracePoints(beats:BeatSample[],bph:number,limit=100){
  const rows=beats.slice(-Math.max(2,limit));if(!bph||rows.length<2)return[]
  const nominal=3600/bph;let phase=0;const out:{index:number;phaseMs:number;residualMs:number;multiple:number}[]=[]
  for(let i=1;i<rows.length;i+=1){const gap=rows[i].t-rows[i-1].t;if(!Number.isFinite(gap)||gap<=0||gap<nominal*.48)continue;const multiple=clamp(Math.round(gap/nominal),1,6),residualMs=(gap/multiple-nominal)*1000;if(Math.abs(residualMs)>nominal*1000*.12)continue;phase=clamp(phase+residualMs,-40,40);out.push({index:i,phaseMs:phase,residualMs,multiple})}
  return out
}
