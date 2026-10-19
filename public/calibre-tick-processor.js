class CalibreTickProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.hfNoise = 0.00015
    this.rawNoise = 0.0004
    this.sensitivity = 2.0
    this.blocks = 0
    this.previousByChannel = []
    this.envelope = []
    this.lastBeat = -Infinity
    this.clock = null
    this.clockCandidate = null
    this.standard = [14400,18000,19800,21600,25200,28800,36000]
    this.port.onmessage = (event) => {
      const sensitivity = Number(event.data?.sensitivity)
      if (Number.isFinite(sensitivity)) this.sensitivity = sensitivity
    }
  }

  inspectChannel(channel, channelIndex) {
    let peak=0,sum=0,clipped=0,diffPeak=0,diffPeakIndex=0,diffSum=0
    let previous=this.previousByChannel[channelIndex]??0
    for(let i=0;i<channel.length;i+=1){
      const value=channel[i],absolute=Math.abs(value),difference=Math.abs(value-previous)
      previous=value;sum+=absolute*absolute;diffSum+=difference*difference
      if(absolute>peak)peak=absolute
      if(difference>diffPeak){diffPeak=difference;diffPeakIndex=i}
      if(absolute>=.98)clipped+=1
    }
    this.previousByChannel[channelIndex]=previous
    return{peak,rms:Math.sqrt(sum/channel.length),clipped,diffPeak,diffPeakIndex,diffRms:Math.sqrt(diffSum/channel.length)}
  }

  updateClock(now,energy){
    // Keep a regularly sampled high-frequency energy envelope. We then test
    // only physically plausible watch beat periods with normalised
    // autocorrelation. This is deliberately independent of individual clicks:
    // one escapement beat may contain several acoustic impulses.
    this.envelope.push({t:now,e:Math.min(12,Math.max(0,energy))})
    const cutoff=now-4.8
    while(this.envelope.length&&this.envelope[0].t<cutoff)this.envelope.shift()
    if(this.envelope.length<180)return

    const values=this.envelope.map(row=>row.e)
    const mean=values.reduce((sum,value)=>sum+value,0)/values.length
    const centred=values.map(value=>value-mean)
    const variance=centred.reduce((sum,value)=>sum+value*value,0)/centred.length
    if(variance<.002)return
    const dt=(this.envelope[this.envelope.length-1].t-this.envelope[0].t)/Math.max(1,this.envelope.length-1)
    if(!Number.isFinite(dt)||dt<=0)return

    const correlationAt=(lag)=>{
      const radius=2
      let best=-1
      for(let offset=-radius;offset<=radius;offset+=1){
        const k=lag+offset
        if(k<2||k>=centred.length-8)continue
        let cross=0,left=0,right=0,count=0
        for(let i=k;i<centred.length;i+=1){
          const a=centred[i],b=centred[i-k]
          cross+=a*b;left+=a*a;right+=b*b;count++
        }
        if(count<50)continue
        const denom=Math.sqrt(left*right)
        const corr=denom>1e-9?cross/denom:0
        if(corr>best)best=corr
      }
      return best
    }

    const scored=[]
    for(const bph of this.standard){
      const period=3600/bph
      const lag=Math.round(period/dt)
      const corr=correlationAt(lag)
      // Also inspect two periods. A genuine escapement clock normally repeats
      // there too, while a single accidental transient does not.
      const corr2=correlationAt(lag*2)
      const repeat=Math.max(-1,corr2)
      const score=corr*.72+repeat*.28
      scored.push({bph,period,corr,corr2:repeat,score})
    }
    scored.sort((a,b)=>b.score-a.score)
    const best=scored[0],runner=scored[1]
    const margin=best.score-(runner?.score??0)
    const confidence=Math.max(0,Math.min(1,(best.score-.12)/.58))*Math.max(.45,Math.min(1,.65+margin*2.5))
    this.clockCandidate={...best,confidence,runnerBph:runner?.bph||0,runnerScore:runner?.score||0,margin}

    // Hysteresis: require repeated independent analyses before allowing the
    // candidate to gate accepted beats. Do not instantly jump between a
    // fundamental and its harmonic.
    const acceptable=best.corr>=.20&&best.score>=.18&&confidence>=.20
    if(acceptable){
      if(this.clock&&this.clock.bph===best.bph){
        this.clock={...this.clock,...best,confidence,runnerBph:runner?.bph||0,runnerScore:runner?.score||0,margin,hits:Math.min(12,(this.clock.hits||0)+1)}
      }else if(this.clockCandidate.previousBph===best.bph){
        this.clock={...best,confidence,runnerBph:runner?.bph||0,runnerScore:runner?.score||0,margin,hits:2}
      }else{
        this.clockCandidate.previousBph=best.bph
        if(this.clock)this.clock.hits=Math.max(0,(this.clock.hits||1)-1)
      }
    }else if(this.clock){
      this.clock.hits=Math.max(0,(this.clock.hits||1)-1)
      if(!this.clock.hits)this.clock=null
    }
  }

  process(inputs){
    const channels=inputs[0]??[]
    if(!channels.length)return true
    const inspected=channels.filter(c=>c?.length).map((c,i)=>this.inspectChannel(c,i))
    if(!inspected.length)return true
    const best=inspected.reduce((w,r)=>r.diffPeak>w.diffPeak?r:w)
    const {peak,rms,clipped,diffPeak,diffPeakIndex,diffRms}=best
    const threshold=Math.max(.00012,this.hfNoise*this.sensitivity)
    const rawThreshold=Math.max(.0010,this.rawNoise*6)
    const crest=diffPeak/Math.max(diffRms,.000001)
    const strength=diffPeak/Math.max(threshold,.000001)
    const handling=rms>rawThreshold&&crest<2.5,clipping=clipped>0
    const eventTime=(currentFrame+diffPeakIndex)/sampleRate

    if(!clipping){
      const hfAlpha=diffRms<this.hfNoise?.05:.0015,rawAlpha=rms<this.rawNoise?.04:.002
      this.hfNoise=this.hfNoise*(1-hfAlpha)+Math.min(diffRms,this.hfNoise*2)*hfAlpha
      this.rawNoise=this.rawNoise*(1-rawAlpha)+Math.min(rms,this.rawNoise*2)*rawAlpha
    }

    const energy=Math.max(diffRms/Math.max(this.hfNoise,.000001),diffPeak/Math.max(threshold,.000001)*.65)
    // 128-frame AudioWorklet blocks at 48 kHz are ~2.7 ms. Sampling every
    // third block gives an ~8 ms envelope: plenty for 100-250 ms watch periods
    // without doing expensive correlation at audio sample rate.
    if(this.blocks%3===0)this.updateClock(eventTime,energy)

    const clockStable=this.clock&&(this.clock.hits||0)>=4&&this.clock.confidence>=.25
    if(clockStable&&!handling&&!clipping){
      const period=this.clock.period
      if(this.lastBeat===-Infinity){
        if(strength>=1.25&&crest>=1.7){this.lastBeat=eventTime;this.port.postMessage({kind:'beat',t:eventTime,pk:peak,diffPk:diffPeak,crest,strength,threshold,sampleRate,bphHint:this.clock.bph})}
      }else{
        const elapsed=eventTime-this.lastBeat
        const multiple=Math.max(1,Math.round(elapsed/period)),expected=this.lastBeat+multiple*period
        const window=Math.max(.010,period*.12)
        if(Math.abs(eventTime-expected)<=window&&strength>=1.12&&crest>=1.55){
          this.lastBeat=eventTime
          this.port.postMessage({kind:'beat',t:eventTime,pk:peak,diffPk:diffPeak,crest,strength,threshold,sampleRate,bphHint:this.clock.bph})
        }else if(elapsed>period*6){this.lastBeat=-Infinity}
      }
    }

    this.blocks+=1
    if(this.blocks%4===0){
      const candidate=this.clockCandidate
      this.port.postMessage({kind:'level',rms,pk:peak,noise:this.rawNoise,hfNoise:this.hfNoise,threshold,diffRms,diffPk:diffPeak,crest,strength,handling,clipping,clippedSamples:clipped,sampleRate,channels:channels.length,clockBph:this.clock?.bph||candidate?.bph||0,clockConfidence:this.clock?.confidence||candidate?.confidence||0,clockStable:!!clockStable,clockScore:candidate?.score||0,clockCorrelation:candidate?.corr||0,clockRunnerBph:candidate?.runnerBph||0,clockRunnerScore:candidate?.runnerScore||0,clockMargin:candidate?.margin||0})
    }
    return true
  }
}
registerProcessor('calibre-tick',CalibreTickProcessor)
