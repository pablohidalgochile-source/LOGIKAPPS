class FragmentCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = null; this.cursor = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'record') { this.buffer = new Float32Array(Math.min(sampleRate * 12, Math.floor(data.seconds * sampleRate))); this.cursor = 0; }
      if (data.type === 'discard') { this.buffer = null; this.cursor = 0; }
    };
  }
  process(inputs, outputs) {
    // The output is always zero: no monitored sound reaches the destination.
    for (const channel of outputs[0] || []) channel.fill(0);
    const channels = inputs[0];
    if (this.buffer && channels?.length) {
      for (let i = 0; i < channels[0].length && this.cursor < this.buffer.length; i++) {
        let sum = 0; for (const c of channels) sum += c[i] || 0;
        this.buffer[this.cursor++] = sum / channels.length;
      }
      if (this.cursor === this.buffer.length) { const buffer = this.buffer; this.buffer = null; this.port.postMessage({ samples: buffer, rate: sampleRate }, [buffer.buffer]); }
    }
    return true;
  }
}
registerProcessor('fragment-capture', FragmentCapture);
