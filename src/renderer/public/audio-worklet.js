// AudioWorklet 处理器：Float32 采样 → Int16 PCM 立体声，按块 postMessage 上报。
// 该文件由浏览器 AudioWorklet 线程直接加载（不参与 TypeScript 编译），因此为 .js；
// 通过 Vite 的 ?url 导入获取同源地址，避免 Blob URL 被 CSP 拦截。
class ChunkPumper extends AudioWorkletProcessor {
  constructor() {
    super()
    this._chunkFrames = 4096 // 约 85ms @48kHz
    this._buffer = new Int16Array(this._chunkFrames * 2)
    this._offset = 0
  }

  process(inputs, outputs) {
    const output = outputs[0]
    for (const channel of output) channel.fill(0)
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const silence = new Float32Array(128)
    const left = input[0] || silence
    const right = input[1] || left
    for (let i = 0; i < left.length; i++) {
      if (this._offset >= this._buffer.length) {
        this.port.postMessage(this._buffer.buffer, [this._buffer.buffer])
        this._buffer = new Int16Array(this._chunkFrames * 2)
        this._offset = 0
      }
      this._buffer[this._offset++] = clampToInt16(left[i])
      this._buffer[this._offset++] = clampToInt16(right[i])
    }
    return true
  }
}

function clampToInt16(sample) {
  const clamped = Math.max(-1, Math.min(1, sample))
  return Math.round(clamped * 32767)
}

registerProcessor('chunk-pumper', ChunkPumper)
