class CalibreTickProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.hfNoise = 0.00015
    this.rawNoise = 0.0004
    this.last = -Infinity
    this.sensitivity = 2.0
    this.blocks = 0
    this.previousByChannel = []
    this.port.onmessage = (event) => {
      const sensitivity = Number(event.data?.sensitivity)
      if (Number.isFinite(sensitivity)) this.sensitivity = sensitivity
    }
  }

  inspectChannel(channel, channelIndex) {
    let peak = 0, sum = 0, clipped = 0, diffPeak = 0, diffPeakIndex = 0, diffSum = 0
    let previous = this.previousByChannel[channelIndex] ?? 0
    for (let i = 0; i < channel.length; i += 1) {
      const value = channel[i]
      const absolute = Math.abs(value)
      const difference = Math.abs(value - previous)
      previous = value
      sum += absolute * absolute
      diffSum += difference * difference
      if (absolute > peak) peak = absolute
      if (difference > diffPeak) { diffPeak = difference; diffPeakIndex = i }
      if (absolute >= .98) clipped += 1
    }
    this.previousByChannel[channelIndex] = previous
    return { peak, rms: Math.sqrt(sum / channel.length), clipped, diffPeak, diffPeakIndex, diffRms: Math.sqrt(diffSum / channel.length) }
  }

  process(inputs) {
    const channels = inputs[0] ?? []
    if (!channels.length) return true
    const inspected = channels.filter((channel) => channel?.length).map((channel, index) => this.inspectChannel(channel, index))
    if (!inspected.length) return true
    const best = inspected.reduce((winner, row) => row.diffPeak > winner.diffPeak ? row : winner)
    const { peak, rms, clipped, diffPeak, diffPeakIndex, diffRms } = best
    const threshold = Math.max(0.00012, this.hfNoise * this.sensitivity)
    const rawThreshold = Math.max(0.0010, this.rawNoise * 6)
    const crest = diffPeak / Math.max(diffRms, 0.000001)
    const strength = diffPeak / Math.max(threshold, 0.000001)
    const handling = rms > rawThreshold && crest < 2.5
    const clipping = clipped > 0
    const candidate = diffPeak > threshold && crest > 1.55 && !handling && !clipping

    if (!candidate && !clipping) {
      const hfAlpha = diffRms < this.hfNoise ? .06 : .002
      const rawAlpha = rms < this.rawNoise ? .05 : .003
      this.hfNoise = this.hfNoise * (1 - hfAlpha) + diffRms * hfAlpha
      this.rawNoise = this.rawNoise * (1 - rawAlpha) + rms * rawAlpha
    } else {
      this.hfNoise = this.hfNoise * .9998 + Math.min(diffRms, this.hfNoise * 1.5) * .0002
      this.rawNoise = this.rawNoise * .9998 + Math.min(rms, this.rawNoise * 1.5) * .0002
    }

    const eventTime = (currentFrame + diffPeakIndex) / sampleRate
    this.blocks += 1
    if (this.blocks % 4 === 0) {
      this.port.postMessage({ kind: 'level', rms, pk: peak, noise: this.rawNoise, hfNoise: this.hfNoise, threshold, diffRms, diffPk: diffPeak, crest, strength, handling, clipping, clippedSamples: clipped, sampleRate, channels: channels.length })
    }

    // A mechanical tick creates a short burst with several sharp edges. The old
    // 65 ms refractory window counted those ringing edges as separate beats.
    // 100 ms is still safely below the shortest normal beat interval supported
    // by Calibre (36,000 BPH = 100 ms) while collapsing one acoustic tick burst
    // into one event.
    if (candidate && eventTime - this.last >= .098) {
      this.last = eventTime
      this.port.postMessage({ kind: 'beat', t: eventTime, pk: peak, diffPk: diffPeak, crest, strength, threshold, sampleRate })
    }
    return true
  }
}
registerProcessor('calibre-tick', CalibreTickProcessor)
