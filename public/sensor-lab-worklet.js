class SensorLabRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'recording') {
        this.recording = Boolean(event.data.enabled);
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    if (this.recording) {
      const channel = input[0];
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      this.port.postMessage({ type: 'pcm', samples: copy }, [copy.buffer]);
    }

    return true;
  }
}

registerProcessor('sensor-lab-recorder', SensorLabRecorderProcessor);
