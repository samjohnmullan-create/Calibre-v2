class CalibreTickProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.hfNoise = 0.00015
    this.rawNoise = 0.0004
    this.last = -Infinity
    this.sensitivity = 2.0
    this.blocks = 0
    this.previousByChannel = []
    this.pending = null
    this.quietBlocks = 0
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

    // A watch tick should be a distinct impulse above its local high-frequency
    // noise floor, not merely continuous speech/room noise crossing a threshold.
    const impulseCandidate = diffPeak > threshold && strength >= 1.35 && crest >= 1.9 && !handling && !clipping
    const quietNow = diffPeak < threshold * 0.72
    this.quietBlocks = quietNow ? this.quietBlocks + 1 : 0

    if (!impulseCandidate && !clipping) {
      const hfAlpha = diffRms < this.hfNoise ? .06 : .002
      const rawAlpha = rms < this.rawNoise ? .05 : .003
      this.hfNoise = this.hfNoise * (1 - hfAlpha) + diffRms * hfAlpha
      this.rawNoise = this.rawNoise * (1 - rawAlpha) + rms * rawAlpha
    } else {
      this.hfNoise = this.hfNoise * .9998 + Math.min(diffRms, this.hfNoise * 1.5) * .0002
      this.rawNoise = this.rawNoise * .9998 + Math.min(rms, this.rawNoise * 1.5) * .0002
    }

    const eventTime = (currentFrame + diffPeakIndex) / sampleRate

    // Collect the strongest edge in a short acoustic burst. We only emit it
    // after the signal has fallen back toward the noise floor. This prevents
    // one tick's ringing, speech, taps and broad noise from becoming a stream
    // of fake beats.
    if (impulseCandidate) {
      if (!this.pending || eventTime - this.pending.started > .030) {
        this.pending = { started: eventTime, t: eventTime, pk: peak, diffPk: diffPeak, crest, strength, threshold }
      } else if (diffPeak > this.pending.diffPk) {
        this.pending = { ...this.pending, t: eventTime, pk: peak, diffPk: diffPeak, crest, strength, threshold }
      }
    }

    if (this.pending) {
      const age = eventTime - this.pending.started
      const envelopeClosed = age >= .012 && this.quietBlocks >= 2
      const envelopeExpired = age >= .045
      if (envelopeClosed || envelopeExpired) {
        const hit = this.pending
        this.pending = null
        // Reject broad/weak impulses after observing the whole envelope.
        const qualified = hit.strength >= 1.45 && hit.crest >= 2.0
        // 95 ms suppresses ringing while retaining 36,000 BPH (100 ms).
        if (qualified && hit.t - this.last >= .095) {
          this.last = hit.t
          this.port.postMessage({ kind: 'beat', t: hit.t, pk: hit.pk, diffPk: hit.diffPk, crest: hit.crest, strength: hit.strength, threshold: hit.threshold, sampleRate })
        }
      }
    }

    this.blocks += 1
    if (this.blocks % 4 === 0) {
      this.port.postMessage({ kind: 'level', rms, pk: peak, noise: this.rawNoise, hfNoise: this.hfNoise, threshold, diffRms, diffPk: diffPeak, crest, strength, handling, clipping, clippedSamples: clipped, sampleRate, channels: channels.length, candidate: impulseCandidate })
    }
    return true
  }
}
registerProcessor('calibre-tick', CalibreTickProcessor)
