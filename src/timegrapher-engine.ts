export const STANDARD_BPH = [14400, 16200, 18000, 19800, 21600, 25200, 28800, 36000] as const

export type BeatSample = { t:number; t1?:number; peaks?:number; strength?:number; crest?:number }
export type TraceDot = { t:number; xMs:number; parity:0|1 }
export type TimingResult = { ready:boolean; reliable:boolean; stage:string; bph?:number; rateSecondsPerDay?:number; beatErrorMs?:number|null; beatErrorTrusted?:boolean; stability?:string; stabilityLabel?:string; confidence?:number; status?:'poor'|'good'|'attention'|'adjust'; beats?:number; samples?:number; directSamples?:number; missedBeatRatio?:number; beatErrorRunSamples?:number; jitterMs?:number; nominalIntervalMs?:number; measuredIntervalMs?:number; measuredBph?:number|null; traceDots?:TraceDot[]; measuredAt?:string }
export type AudioLevel = { rms?:number; pk?:number; noise?:number; hfNoise?:number; threshold?:number; diffRms?:number; diffPk?:number; crest?:number; strength?:number; handling?:boolean; clipping?:boolean; clippedSamples?:number; sampleRate?:number }

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
const clamp01=(n:number)=>clamp(n,0,1)
function median(values:number[]){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function stdev(values:number[]){if(values.length<2)return 0;const mean=values.reduce((s,v)=>s+v,0)/values.length;return Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,values.length-1))}
function nearestCommon(guess:number){if(!Number.isFinite(guess)||guess<5000||guess>60000)return null;let best:number=STANDARD_BPH[0],error=Infinity;for(const bph of STANDARD_BPH){const e=Math.abs(guess-bph)/bph;if(e<error){best=bph;error=e}}return{bph:best,error}}
function rateFromInterval(bph:number,intervalSec:number){const nominal=3600/bph;return(nominal/intervalSec-1)*86400}

function resolveNominal(beats:BeatSample[],requested:number){if(requested)return{bph:requested,guess:null as number|null};const intervals:number[]=[];for(let i=1;i<beats.length;i++){const dt=beats[i].t-beats[i-1].t;if(dt>.04&&dt<.7)intervals.push(dt)}if(intervals.length<6)return null;const med=median(intervals);if(med==null)return null;const guess=3600/med,near=nearestCommon(guess);if(!near||near.error>.08)return null;return{bph:near.bph,guess}}

export function analyseTiming(beats:BeatSample[],lockedBph=0):TimingResult{
  if(beats.length<6)return{ready:false,reliable:false,stage:beats.length?'Detecting ticks…':'Listening…',beats:beats.length}
  const ordered=[...beats].filter(b=>Number.isFinite(b.t)).sort((a,b)=>a.t-b.t)
  const last=ordered[ordered.length-1]?.t??0,windowed=ordered.filter(b=>b.t>=last-30)
  const nominalInfo=resolveNominal(windowed,Number(lockedBph)||0)
  if(!nominalInfo)return{ready:false,reliable:false,stage:'Finding beat rate…',beats:windowed.length}
  const bph=nominalInfo.bph,nominal=3600/bph,anchor=windowed[0]?.t??0
  type Indexed=BeatSample&{n:number;residual:number}
  const indexed:Indexed[]=[]
  for(const beat of windowed){const n=Math.round((beat.t-anchor)/nominal),residual=beat.t-anchor-n*nominal,prev=indexed[indexed.length-1];if(prev&&n<=prev.n)continue;indexed.push({...beat,n,residual})}
  const evenIntervals:number[]=[],oddIntervals:number[]=[],periods:number[]=[]
  for(let i=1;i<indexed.length;i++){
    const prev=indexed[i-1],cur=indexed[i];if(cur.n-prev.n!==1)continue
    const dt=cur.t-prev.t;if(Math.abs(dt-nominal)>nominal*.2)continue
    if((prev.n&1)===0)evenIntervals.push(dt);else oddIntervals.push(dt)
    if(i>=2){const back=indexed[i-2];if(prev.n-back.n===1){const full=cur.t-back.t;if(Math.abs(full-nominal*2)<=nominal*.4)periods.push(full/2)}}
  }
  const evenMed=median(evenIntervals),oddMed=median(oddIntervals)
  const meanInterval=median(periods)??(evenMed!=null&&oddMed!=null?(evenMed+oddMed)/2:(evenMed??oddMed))
  const used=periods.length>0?periods.length:evenIntervals.length+oddIntervals.length
  let rate=meanInterval!=null&&used>=8?rateFromInterval(bph,meanInterval):null;if(rate!=null&&Math.abs(rate)>5000)rate=null
  const beatError=evenMed!=null&&oddMed!=null&&evenIntervals.length>=3&&oddIntervals.length>=3?Math.abs(evenMed-oddMed)*1000:null
  const measuredBph=meanInterval?3600/meanInterval:null
  const rates=periods.map(dt=>rateFromInterval(bph,dt)),scatter=rates.length>=8?stdev(rates):null
  const residuals=indexed.map(b=>b.residual*1000),mid=median(residuals)??0,span=10,half=span/2
  const traceDots:TraceDot[]=indexed.map(b=>{let x=b.residual*1000-mid;x=(((x+half)%span)+span)%span-half;return{t:b.t,xMs:x,parity:(b.n&1) as 0|1}})
  const directSamples=evenIntervals.length+oddIntervals.length,missedRatio=indexed.length>1?clamp01(1-directSamples/(indexed.length-1)):1
  const jitterMs=scatter!=null?scatter/86400*nominal*1000:0
  const intervalCoverage=clamp01(used/18),scatterQuality=scatter==null?.45:clamp01(1-scatter/120),beatQuality=beatError==null?.55:clamp01(1-beatError/5),confidence=clamp01(intervalCoverage*.45+scatterQuality*.35+beatQuality*.10+clamp01(1-missedRatio)*.10)
  const reliable=used>=8&&rate!=null&&confidence>=.58
  let stability='Collecting';if(scatter!=null){if(scatter<8)stability='Excellent';else if(scatter<20)stability='Good';else if(scatter<45)stability='Fair';else stability='Unstable'}
  let status:TimingResult['status']='poor';if(reliable&&Math.abs(rate??999)<=15&&(scatter??999)<45)status='good';else if(reliable&&Math.abs(rate??999)<=30)status='attention';else if(reliable)status='adjust'
  return{ready:used>=6,reliable,stage:used<8?'Timing…':'Timing',bph,rateSecondsPerDay:rate??undefined,beatErrorMs:beatError,beatErrorTrusted:beatError!=null&&evenIntervals.length>=3&&oddIntervals.length>=3,stability:stability.toLowerCase(),stabilityLabel:stability,confidence,status,beats:indexed.length,samples:used,directSamples,missedBeatRatio:missedRatio,beatErrorRunSamples:Math.min(evenIntervals.length,oddIntervals.length)*2,jitterMs,nominalIntervalMs:nominal*1000,measuredIntervalMs:meanInterval!=null?meanInterval*1000:undefined,measuredBph,traceDots,measuredAt:new Date().toISOString()}
}

export function lockState(result:TimingResult,running:boolean){if(!running)return{label:'IDLE',progress:0,detail:'USB timing pickup is not running.'};const stage=result.stage.toLowerCase(),samples=result.samples??0,confidence=result.confidence??0;if(result.reliable)return{label:'LOCKED',progress:100,detail:`${Math.round(confidence*100)}% confidence · ${samples} timing samples`};if(stage.includes('beat rate'))return{label:'FINDING BPH',progress:34,detail:'Identifying the escapement beat rate from accepted USB pickup events.'};if(stage.includes('timing'))return{label:'TIMING',progress:clamp(55+samples*4,55,94),detail:'Separating tick and tock intervals and measuring rate.'};if(stage.includes('detect'))return{label:'DETECTING',progress:22,detail:'Building accepted escapement-event history.'};return{label:'LISTENING',progress:8,detail:'Waiting for usable escapement events from the USB timing pickup.'}}

export function diagnoseSignal(level:AudioLevel,result:TimingResult,running:boolean){if(!running)return{label:'Not listening',detail:'Start the USB timing pickup to inspect coupling.',action:''};if(level.clipping)return{label:'Clipping',detail:'Pickup input is saturating.',action:'Reduce contact pressure or input gain'};if(level.handling)return{label:'Mechanical disturbance',detail:'Broad vibration is masking the escapement.',action:'Keep the holder and bench still'};const strength=level.strength??0,crest=level.crest??0,missed=result.missedBeatRatio??0;if(strength<1.4)return{label:'Weak coupling',detail:'Escapement energy is below detector threshold.',action:'Reseat the watch in the pickup'};if(strength<2.3)return{label:'Marginal coupling',detail:'Escapement events are marginal.',action:'Improve contact with the pickup'};if(crest<1.8)return{label:'Poor definition',detail:'Signal is present but not sharply defined.',action:'Reposition the watch in the holder'};if(missed>.35)return{label:'Intermittent',detail:'Many expected escapement events are being missed.',action:'Check pickup contact'};if(strength>=8)return{label:'Strong coupling',detail:'Clear escapement impulses with good detector headroom.',action:''};if(strength>=4)return{label:'Good coupling',detail:'USB pickup signal is suitable for timing.',action:''};return{label:'Usable coupling',detail:'Signal is workable but could be cleaner.',action:'Keep the holder steady'}}

export function tracePoints(beats:BeatSample[],bph:number,limit=160){const recent=beats.slice(-limit);if(!bph||recent.length<2)return[];const anchor=recent[0].t,nominal=3600/bph,out:{index:number;phaseMs:number;residualMs:number;multiple:number;parity:0|1;t:number}[]=[];let lastN=-1;for(let i=0;i<recent.length;i++){const n=Math.round((recent[i].t-anchor)/nominal);if(n<=lastN)continue;lastN=n;let residual=(recent[i].t-anchor-n*nominal)*1000;const span=10,half=span/2;residual=(((residual+half)%span)+span)%span-half;out.push({index:i,phaseMs:residual,residualMs:residual,multiple:1,parity:(n&1) as 0|1,t:recent[i].t})}return out}
