class SensorLabRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.chunkSize = 2048;
    this.buffer = new Float32Array(this.chunkSize);
    this.offset = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'recording') {
        const enabled = Boolean(event.data.enabled);
        if (!enabled && this.offset > 0) this.flush();
        this.recording = enabled;
      }
    };
  }

  flush() {
    if (!this.offset) return;
    const chunk = this.buffer.slice(0, this.offset);
    this.port.postMessage({ type: 'pcm', samples: chunk }, [chunk.buffer]);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || !this.recording) return true;

    const channel = input[0];
    let sourceOffset = 0;
    while (sourceOffset < channel.length) {
      const room = this.chunkSize - this.offset;
      const take = Math.min(room, channel.length - sourceOffset);
      this.buffer.set(channel.subarray(sourceOffset, sourceOffset + take), this.offset);
      this.offset += take;
      sourceOffset += take;
      if (this.offset === this.chunkSize) this.flush();
    }

    return true;
  }
}

registerProcessor('sensor-lab-recorder', SensorLabRecorderProcessor);
