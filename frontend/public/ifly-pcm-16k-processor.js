class Pcm16kProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 期望：AudioContext 创建时 sampleRate=16000，因此输入通常就是 16kHz。
    // 为了保证一定会产出 PCM（避免重采样步骤导致长时间不满足 640 samples），
    // 这里做“直接 Float32->Int16->按 40ms(640 samples) 切片”。
    this._CHUNK_SAMPLES = 640; // 16kHz * 40ms
    this._samples = [];
  }

  _floatToInt16(s) {
    // 16-bit signed PCM
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    return s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0;
  }

  process(inputs, outputs) {
    if (outputs && outputs[0] && outputs[0][0]) {
      const outCh = outputs[0][0];
      outCh.fill(0);
    }

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const ch0 = input[0];
    for (let i = 0; i < ch0.length; i++) {
      this._samples.push(this._floatToInt16(ch0[i]));

      while (this._samples.length >= this._CHUNK_SAMPLES) {
        const chunk = new Int16Array(this._samples.splice(0, this._CHUNK_SAMPLES));
        this.port.postMessage({ pcm: chunk }, [chunk.buffer]);
      }
    }

    return true;
  }
}

registerProcessor('pcm-16k-processor', Pcm16kProcessor);

