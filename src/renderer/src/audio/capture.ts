/**
 * 音频采集与混音（渲染进程）：
 * - 系统声音：getDisplayMedia（主进程自动授权，Windows WASAPI loopback）
 * - 麦克风：getUserMedia
 * - 两路经 WebAudio 混音 → AudioWorklet 转 Int16 PCM → 逐块回调（IPC 发往主进程写 WAV）
 * worklet 模块放在 public/（构建时原样拷贝到产物根），URL 恒为 /audio-worklet.js，
 * dev server 与 app:// 自定义协议均可同源加载。
 */

/** worklet 模块的根路径（public 目录资产） */
const WORKLET_URL: string = '/audio-worklet.js'

export type AudioCaptureHandle = {
  readonly stop: () => Promise<void>
}

export type AudioCaptureResult = {
  readonly handle: AudioCaptureHandle
  /** 降级提示（例如系统声不可用自动改为仅麦克风） */
  readonly warnings: readonly string[]
}

export type AudioCaptureOptions = {
  readonly systemAudio: boolean
  readonly microphone: boolean
  readonly onChunk: (pcmInt16: ArrayBuffer) => void
  /** 麦克风独立 PCM 流（字幕识别用）；与混音流并行上报，不替代混音 */
  readonly onMicChunk: (pcmInt16: ArrayBuffer) => void
}

const SAMPLE_RATE: number = 48000

/** 用离线上下文预检 worklet 模块可加载性（不占用音频设备）。
 *  失败时附带 fetch 探测结果（HTTP 状态与 Content-Type），便于从日志直接定位。 */
export const checkWorkletAvailability = async (): Promise<void> => {
  const context = new OfflineAudioContext(2, 128, SAMPLE_RATE)
  try {
    await context.audioWorklet.addModule(WORKLET_URL)
  } catch (error) {
    const probe = await fetch(WORKLET_URL)
      .then((response) => `${String(response.status)} ${response.headers.get('content-type') ?? '无Content-Type'}`)
      .catch((fetchError: unknown) => `fetch 也失败：${String(fetchError)}`)
    throw new Error(`addModule 失败（模块文件探测：${probe}）：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** 请求系统声音轨道；失败返回 null（调用方决定降级策略） */
const tryCaptureSystemAudio = async (): Promise<MediaStream | null> => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
    // 只需要音频轨，视频轨立即停掉（不参与渲染）
    for (const track of stream.getVideoTracks()) {
      track.stop()
    }
    if (stream.getAudioTracks().length === 0) {
      return null
    }
    return stream
  } catch {
    return null
  }
}

const captureMicrophone = async (): Promise<MediaStream> => {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  })
}

/** 启动混音采集；任一必需来源失败时抛错，系统声失败但要求了麦克风时自动降级。
 *  麦克风开启时走双路：并入混音流（导出音轨完整）+ 独立 PCM 流（字幕识别源）。 */
export const startAudioCapture = async (options: AudioCaptureOptions): Promise<AudioCaptureResult> => {
  const warnings: string[] = []
  const systemSources: MediaStreamAudioSourceNode[] = []
  let micSource: MediaStreamAudioSourceNode | undefined
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })

  try {
    if (options.systemAudio) {
      const stream = await tryCaptureSystemAudio()
      if (stream === null) {
        warnings.push('系统声音不可用，已自动降级')
      } else {
        systemSources.push(context.createMediaStreamSource(stream))
      }
    }
    if (options.microphone) {
      micSource = context.createMediaStreamSource(await captureMicrophone())
    }
    if (systemSources.length === 0 && micSource === undefined) {
      throw new Error('没有任何可用的音频来源')
    }

    await context.audioWorklet.addModule(WORKLET_URL)

    // 混音链：系统声 + 麦克风全部并入（保持导出音轨与既有行为一致）
    const merged = context.createGain()
    for (const source of systemSources) {
      source.connect(merged)
    }
    if (micSource !== undefined) {
      micSource.connect(merged)
    }

    const pumper = new AudioWorkletNode(context, 'chunk-pumper', { outputChannelCount: [2] })
    pumper.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      options.onChunk(event.data)
    }
    merged.connect(pumper)

    // 麦克风独立链：同一 worklet 模块的第二个实例，仅采集麦克风（字幕识别源）
    let micPumper: AudioWorkletNode | undefined
    let micGain: GainNode | undefined
    if (micSource !== undefined) {
      micGain = context.createGain()
      micPumper = new AudioWorkletNode(context, 'chunk-pumper', { outputChannelCount: [2] })
      micPumper.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        options.onMicChunk(event.data)
      }
      micSource.connect(micGain)
      micGain.connect(micPumper)
    }

    // 连接 destination 以维持音频线程拉取；worklet 输出恒为静音，不会外放
    pumper.connect(context.destination)
    micPumper?.connect(context.destination)
    await context.resume()

    const handle: AudioCaptureHandle = {
      stop: async () => {
        pumper.port.onmessage = null
        pumper.disconnect()
        if (micPumper !== undefined) {
          micPumper.port.onmessage = null
          micPumper.disconnect()
          micGain?.disconnect()
        }
        merged.disconnect()
        for (const source of systemSources) {
          source.disconnect()
        }
        micSource?.disconnect()
        const allSources: readonly MediaStreamAudioSourceNode[] = [...systemSources, ...(micSource !== undefined ? [micSource] : [])]
        for (const source of allSources) {
          for (const track of source.mediaStream.getTracks()) {
            track.stop()
          }
        }
        // 留出最后一个 PCM 块经 IPC 派发的时间
        await new Promise<void>((resolve) => setTimeout(resolve, 120))
        await context.close()
      }
    }
    return { handle, warnings }
  } catch (error) {
    await context.close().catch(() => undefined)
    throw error
  }
}
