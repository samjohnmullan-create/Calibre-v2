class CalibreTickProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.hfNoise = 0.00015
    this.rawNoise = 0.0004
    this.sensitivity = 2.0
    this.blocks = 0
    this.previousByChannel = []
    this.energyHistory = []
    this.lastBeat = -Infinity
    this.clock = null
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
    this.energyHistory.push({t:now,e:energy})
    const cutoff=now-4.5
    while(this.energyHistory.length&&this.energyHistory[0].t<cutoff)this.energyHistory.shift()
    if(this.energyHistory.length<80)return
    let best=null
    for(const bph of this.standard){
      const period=3600/bph,tolerance=Math.max(.010,period*.12)
      let matched=0,total=0,error=0
      // Use energetic local samples as anchors and ask whether similar energy
      // repeats one watch period later. This measures the repeating clock in
      // the audio envelope rather than counting every sharp edge.
      for(let i=0;i<this.energyHistory.length;i+=3){
        const a=this.energyHistory[i]
        if(a.e<1.15)continue
        total++
        const target=a.t+period
        let nearest=null,nearestDt=Infinity
        for(let j=i+1;j<this.energyHistory.length;j++){
          const b=this.energyHistory[j],dt=Math.abs(b.t-target)
          if(dt<nearestDt){nearestDt=dt;nearest=b}
          if(b.t>target+tolerance)break
        }
        if(nearest&&nearestDt<=tolerance&&nearest.e>=1.05){matched++;error+=nearestDt/period}
      }
      if(total<5)continue
      const coverage=matched/total,meanError=matched?error/matched:1
      const score=coverage-Math.min(.35,meanError*1.5)
      if(!best||score>best.score)best={bph,period,coverage,meanError,score}
    }
    if(best&&best.coverage>=.42&&best.meanError<=.10&&best.score>=.30){
      if(this.clock&&this.clock.bph===best.bph)this.clock={...best,hits:(this.clock.hits||0)+1}
      else this.clock={...best,hits:1}
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

    // Normalised envelope energy. Broad room noise can raise RMS, but a watch
    // produces a repeated high-frequency energy pattern at its beat period.
    const energy=Math.max(diffRms/Math.max(this.hfNoise,.000001),diffPeak/Math.max(threshold,.000001)*.65)
    if(this.blocks%3===0)this.updateClock(eventTime,energy)

    const clockStable=this.clock&&(this.clock.hits||0)>=3
    if(clockStable&&!handling&&!clipping){
      const period=this.clock.period
      // Once the repeating clock is known, accept only the strongest impulse
      // near the next expected beat. Random sounds between windows are ignored.
      if(this.lastBeat===-Infinity){
        if(strength>=1.35&&crest>=1.8){this.lastBeat=eventTime;this.port.postMessage({kind:'beat',t:eventTime,pk:peak,diffPk:diffPeak,crest,strength,threshold,sampleRate,bphHint:this.clock.bph})}
      }else{
        const elapsed=eventTime-this.lastBeat
        const multiple=Math.max(1,Math.round(elapsed/period)),expected=this.lastBeat+multiple*period
        const window=Math.max(.012,period*.14)
        if(Math.abs(eventTime-expected)<=window&&strength>=1.20&&crest>=1.65){
          this.lastBeat=eventTime
          this.port.postMessage({kind:'beat',t:eventTime,pk:peak,diffPk:diffPeak,crest,strength,threshold,sampleRate,bphHint:this.clock.bph})
        }else if(elapsed>period*6){this.lastBeat=-Infinity}
      }
    }

    this.blocks+=1
    if(this.blocks%4===0)this.port.postMessage({kind:'level',rms,pk:peak,noise:this.rawNoise,hfNoise:this.hfNoise,threshold,diffRms,diffPk:diffPeak,crest,strength,handling,clipping,clippedSamples:clipped,sampleRate,channels:channels.length,clockBph:this.clock?.bph||0,clockConfidence:this.clock?.coverage||0,clockStable:!!clockStable})
    return true
  }
}
registerProcessor('calibre-tick',CalibreTickProcessor)
