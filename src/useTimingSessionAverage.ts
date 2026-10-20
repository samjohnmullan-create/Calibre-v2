import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimingResult } from './timegrapher-engine'

type Sample={rate:number;beatError:number|null}
export type TimingSessionAverage={
  active:boolean
  samples:number
  rateAverage:number|null
  rateSpread:number|null
  beatErrorAverage:number|null
  beatErrorSpread:number|null
  beatErrorSamples:number
}

function median(values:number[]){
  if(!values.length)return null
  const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2)
  return s.length%2?s[m]:(s[m-1]+s[m])/2
}
function mad(values:number[]){
  const m=median(values)
  return m==null?null:median(values.map(v=>Math.abs(v-m)))
}
function robust(values:number[]){
  if(values.length<5)return values
  const m=median(values),d=mad(values)
  if(m==null||d==null||d<=1e-9)return values
  const limit=Math.max(d*4.5,Math.abs(m)*.0015)
  const kept=values.filter(v=>Math.abs(v-m)<=limit)
  return kept.length>=3?kept:values
}

export function useTimingSessionAverage(result:TimingResult,dualReferenceLocked:boolean,epoch:number|null){
  const samplesRef=useRef<Sample[]>([])
  const lastKeyRef=useRef('')
  const[version,setVersion]=useState(0)

  useEffect(()=>{
    samplesRef.current=[]
    lastKeyRef.current=''
    setVersion(v=>v+1)
  },[epoch])

  useEffect(()=>{
    if(!dualReferenceLocked||!result.reliable||result.rateSecondsPerDay==null)return
    const key=`${result.measuredAt??''}:${result.beats??0}:${result.samples??0}`
    if(key===lastKeyRef.current)return
    lastKeyRef.current=key
    samplesRef.current.push({
      rate:result.rateSecondsPerDay,
      beatError:result.beatErrorTrusted&&result.beatErrorMs!=null?result.beatErrorMs:null,
    })
    if(samplesRef.current.length>240)samplesRef.current.shift()
    setVersion(v=>v+1)
  },[dualReferenceLocked,result])

  return useMemo<TimingSessionAverage>(()=>{
    const samples=samplesRef.current
    const rates=robust(samples.map(s=>s.rate).filter(Number.isFinite))
    const beatErrors=robust(samples.map(s=>s.beatError).filter((v):v is number=>v!=null&&Number.isFinite(v)))
    const rateAverage=median(rates),beatErrorAverage=median(beatErrors)
    return{
      active:dualReferenceLocked,
      samples:samples.length,
      rateAverage,
      rateSpread:rateAverage==null?null:mad(rates),
      beatErrorAverage,
      beatErrorSpread:beatErrorAverage==null?null:mad(beatErrors),
      beatErrorSamples:beatErrors.length,
    }
  },[dualReferenceLocked,version])
}
