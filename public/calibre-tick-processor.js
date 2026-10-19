class CalibreTickProcessor extends AudioWorkletProcessor {
  constructor(){
    super()
    this.sensitivity=2
    this.gain=4
    this.hpFreq=2400
    this.decay=.0022
    this.x1=this.x2=this.y1=this.y2=0
    this.env=0
    this.noise=1e-5
    this.inBurst=false
    this.cooldown=0
    this.burstStart=0
    this.quiet=0
    this.peakCount=0
    this.firstPeakT=0
    this.lastPeakT=0
    this.lastPeakN=-1e9
    this.prev1=0
    this.prev2=0
    this.n=0
    this.levelSum=0
    this.levelN=0
    this.clips=0
    this.beatTimes=[]
    this.standard=[14400,16200,18000,19800,21600,25200,28800,36000]
    this.predictedPeriod=0
    this.predictedNext=0
    this._design()
    this.port.onmessage=(event)=>{
      const s=Number(event.data?.sensitivity)
      if(Number.isFinite(s))this.sensitivity=s
    }
  }

  _design(){
    const w0=2*Math.PI*this.hpFreq/sampleRate,cos=Math.cos(w0),sin=Math.sin(w0),alpha=sin/(2*.707)
    const b0=(1+cos)/2,b1=-(1+cos),b2=(1+cos)/2,a0=1+alpha,a1=-2*cos,a2=1-alpha
    this.b0=b0/a0;this.b1=b1/a0;this.b2=b2/a0;this.a1=a1/a0;this.a2=a2/a0
  }

  _median(values){
    if(!values.length)return 0
    const sorted=[...values].sort((a,b)=>a-b),m=Math.floor(sorted.length/2)
    return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])*.5
  }

  _clock(){
    if(this.beatTimes.length<7)return{bph:0,confidence:0,stable:false,period:0}
    const gaps=[]
    for(let i=1;i<this.beatTimes.length;i+=1){const dt=this.beatTimes[i]-this.beatTimes[i-1];if(dt>.04&&dt<.7)gaps.push(dt)}
    if(gaps.length<6)return{bph:0,confidence:0,stable:false,period:0}
    const med=this._median(gaps),guess=3600/med
    let bph=0,error=Infinity
    for(const rate of this.standard){const e=Math.abs(guess-rate)/rate;if(e<error){error=e;bph=rate}}
    const period=3600/bph
    const residuals=gaps.map(dt=>Math.abs(dt-period)/period).filter(e=>e<.2)
    const inlier=residuals.length/gaps.length
    const mean=residuals.length?residuals.reduce((a,b)=>a+b,0)/residuals.length:1
    const confidence=Math.max(0,Math.min(1,inlier*(1-mean/.2)))
    return{bph:error<=.08?bph:0,confidence:error<=.08?confidence:0,stable:error<=.08&&confidence>=.55,period:error<=.08?period:0}
  }

  _prediction(t){
    if(!this.predictedPeriod||!this.predictedNext)return{near:false,phase:Infinity}
    let next=this.predictedNext
    while(next<t-this.predictedPeriod*.5)next+=this.predictedPeriod
    const phase=Math.abs(t-next)/this.predictedPeriod
    return{near:phase<=.18,phase,next}
  }

  _emitBeat(){
    const t=this.firstPeakT
    const last=this.beatTimes[this.beatTimes.length-1]
    if(last!=null&&t-last<.05)return
    this.beatTimes.push(t)
    while(this.beatTimes.length>120)this.beatTimes.shift()
    const clock=this._clock()
    if(clock.period&&clock.confidence>=.42){
      this.predictedPeriod=clock.period
      this.predictedNext=t+clock.period
    }else if(this.predictedPeriod){
      this.predictedNext=t+this.predictedPeriod
    }
    this.port.postMessage({kind:'beat',t,strength:Math.max(1,this.env/Math.max(this.noise,1e-7)),crest:this.peakCount,peaks:this.peakCount,t1:this.peakCount>1?this.lastPeakT:this.firstPeakT,bphHint:clock.bph})
  }

  process(inputs){
    const input=inputs[0]
    if(!input||!input.length||!input[0])return true
    const c0=input[0],c1=input.length>1?input[1]:null,n=c0.length
    const decayCoef=Math.exp(-1/(sampleRate*Math.max(.0004,this.decay)))
    const baseMult=this.sensitivity<=1.7?6.1:this.sensitivity>=2.5?10.5:8.2
    const minGapN=Math.floor(sampleRate*.00035),quietN=Math.floor(sampleRate*.009),maxBurstN=Math.floor(sampleRate*.028),coolN=Math.floor(sampleRate*.042)
    let blockPeak=0,blockDiffPeak=0,previousRaw=0,windowAssist=false

    for(let i=0;i<n;i+=1){
      this.n++
      const raw=c1?(c0[i]+c1[i])*.5:c0[i]
      const absRaw=Math.abs(raw)
      if(absRaw>blockPeak)blockPeak=absRaw
      const rawDiff=Math.abs(raw-previousRaw);previousRaw=raw;if(rawDiff>blockDiffPeak)blockDiffPeak=rawDiff
      if(absRaw>=.98)this.clips++
      const x=raw*this.gain
      let y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2
      if(!isFinite(y)||Math.abs(y)>8){y=0;this.x1=this.x2=this.y1=this.y2=0}else{this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y}
      const mag=Math.abs(y)
      this.env=mag>this.env?mag:this.env*decayCoef
      const t=currentTime+i/sampleRate
      const prediction=this._prediction(t)
      const mult=prediction.near?baseMult*.76:baseMult
      const threshold=Math.max(this.noise*mult,6e-6)
      windowAssist=windowAssist||prediction.near
      const follow=this.env<threshold?.0015:.000008
      this.noise+=(this.env-this.noise)*follow
      if(this.noise<5e-8)this.noise=5e-8
      this.levelSum+=mag*mag;this.levelN++

      if(this.cooldown>0){this.cooldown--;this.prev2=this.prev1;this.prev1=mag;continue}
      const hot=this.env>threshold
      if(!this.inBurst&&hot){this.inBurst=true;this.burstStart=this.n;this.quiet=0;this.peakCount=0;this.firstPeakT=t;this.lastPeakT=t;this.lastPeakN=-1e9}
      if(this.inBurst){
        const age=this.n-this.burstStart
        if(this.prev1>=this.prev2&&this.prev1>=mag&&this.prev1>threshold*.25&&this.n-this.lastPeakN>minGapN){const pt=t-1/sampleRate;if(this.peakCount===0)this.firstPeakT=pt;this.lastPeakT=pt;this.peakCount++;this.lastPeakN=this.n}
        if(hot)this.quiet=0;else this.quiet++
        if(this.quiet>quietN||age>maxBurstN){if(this.peakCount>=1)this._emitBeat();this.inBurst=false;this.cooldown=coolN}
      }
      this.prev2=this.prev1;this.prev1=mag
    }

    if(this.levelN>sampleRate*.08){
      const rms=Math.sqrt(this.levelSum/Math.max(1,this.levelN)),clip=this.clips/Math.max(1,this.levelN),clock=this._clock(),baseThreshold=Math.max(this.noise*baseMult,6e-6)
      this.port.postMessage({kind:'level',rms,pk:blockPeak,noise:this.noise,hfNoise:this.noise,threshold:baseThreshold,diffPk:blockDiffPeak,diffRms:rms,crest:this.env/Math.max(rms,1e-7),strength:this.env/Math.max(baseThreshold,1e-7),handling:false,clipping:clip>.01,clippedSamples:this.clips,sampleRate,channels:input.length,clockBph:clock.bph,clockConfidence:clock.confidence,clockStable:clock.stable,predictionAssist:windowAssist})
      this.levelSum=0;this.levelN=0;this.clips=0
    }
    return true
  }
}
registerProcessor('calibre-tick',CalibreTickProcessor)
