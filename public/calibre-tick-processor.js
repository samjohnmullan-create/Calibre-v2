class CalibreTickProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.hfNoise = 0.0010
    this.rawNoise = 0.0015
    this.last = -Infinity
    this.sensitivity = 2.0
    this.blocks = 0
    this.previous = 0
    this.port.onmessage = (event) => {
      const sensitivity = Number(event.data?.sensitivity)
      if (Number.isFinite(sensitivity)) this.sensitivity = sensitivity
    }
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel?.length) return true
    let peak = 0, sum = 0, clipped = 0, diffPeak = 0, diffPeakIndex = 0, diffSum = 0, previous = this.previous
    for (let i = 0; i < channel.length; i += 1) {
      const value = channel[i], absolute = Math.abs(value), difference = Math.abs(value - previous)
      previous = value
      sum += absolute * absolute
      diffSum += difference * difference
      if (absolute > peak) peak = absolute
      if (difference > diffPeak) { diffPeak = difference; diffPeakIndex = i }
      if (absolute >= .98) clipped += 1
    }
    this.previous = previous
    const rms = Math.sqrt(sum / channel.length), diffRms = Math.sqrt(diffSum / channel.length)
    const threshold = Math.max(.0018, this.hfNoise * this.sensitivity), rawThreshold = Math.max(.003, this.rawNoise * 5.5)
    const crest = diffPeak / Math.max(diffRms, .000001), strength = diffPeak / Math.max(threshold, .000001)
    const handling = rms > rawThreshold && crest < 3, clipping = clipped > 0
    const candidate = diffPeak > threshold && crest > 1.8 && !handling && !clipping
    if (!candidate && !clipping) {
      const hfAlpha = diffRms < this.hfNoise ? .05 : .008, rawAlpha = rms < this.rawNoise ? .04 : .006
      this.hfNoise = this.hfNoise * (1 - hfAlpha) + diffRms * hfAlpha
      this.rawNoise = this.rawNoise * (1 - rawAlpha) + rms * rawAlpha
    } else {
      this.hfNoise = this.hfNoise * .999 + diffRms * .001
      this.rawNoise = this.rawNoise * .999 + rms * .001
    }
    const eventTime = (currentFrame + diffPeakIndex) / sampleRate
    this.blocks += 1
    if (this.blocks % 4 === 0) this.port.postMessage({ kind: 'level', rms, pk: peak, noise: this.rawNoise, hfNoise: this.hfNoise, threshold, diffRms, diffPk: diffPeak, crest, strength, handling, clipping, clippedSamples: clipped, sampleRate })
    if (candidate && eventTime - this.last > .070) {
      this.last = eventTime
      this.port.postMessage({ kind: 'beat', t: eventTime, pk: peak, diffPk: diffPeak, crest, strength, threshold, sampleRate })
    }
    return true
  }
}
registerProcessor('calibre-tick', CalibreTickProcessor)
