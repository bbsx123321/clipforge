import { randomUUID } from 'node:crypto'
import { mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import log from 'electron-log/main'
import { loadAppConfig, saveAppConfig } from '../recorder/app-settings'
import {
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
  buildRecordManifest,
  buildSegmentFileName
} from '../core/recording/manifest'
import { transitionRecordPhase } from '../core/recording/phase-state'
import { probeFirstAvailableEncoder } from '../recorder/ffmpeg/encoder-probe'
import { buildEncoderProbeArgs } from '../recorder/ffmpeg/encoder-probe'
import { buildGdigrabRecordArgs, type VideoEncoderId } from '../recorder/ffmpeg/ffmpeg-args'
import { runFfmpegOnce } from '../recorder/ffmpeg/ffmpeg-run'
import { FfmpegRecordSession, type SessionExit } from '../recorder/record-session'
import { remuxSegmentToMp4, undersizedSegmentWarnings } from '../recorder/remux'
import { muxAudioIntoVideoSegment } from '../recorder/mux-audio'
import { WavStreamWriter, WAV_CHANNELS, WAV_SAMPLE_RATE } from '../recorder/wav-writer'
import type {
  LogMessage,
  OutputDirInfo,
  RecordPhase,
  RecordSettings,
  RecordingSegment,
  StartRecordingResult,
  StopRecordingResult
} from '../shared/types'

/** 录制编排器配置（app ready 后由入口注入） */
export type ControllerConfig = {
  readonly appRoot: string
  readonly ffmpegPath: string
  readonly smokeMode: boolean
  /** 是否以打包形态运行（asar 内不可写，产物落用户数据目录） */
  readonly isPackaged: boolean
  /** 用户数据目录（打包态的录制产物根目录） */
  readonly userDataDir: string
}

/** 录制会话可变状态（主进程编排层单例；阶段合法性始终由纯函数状态机校验） */
type ControllerState = {
  phase: RecordPhase
  sessionId: string
  settings: RecordSettings | undefined
  startedAtWallMs: number
  rootDir: string
  segments: readonly RecordingSegment[]
  segmentIndex: number
  wav: WavStreamWriter | undefined
  wavHasData: boolean
  /** 音频已全部成功合成进视频分段（清单不再登记独立音频文件） */
  audioMuxed: boolean
  encoder: VideoEncoderId | undefined
}

let config: ControllerConfig | undefined
let session: FfmpegRecordSession | undefined
let state: ControllerState = {
  phase: 'idle',
  sessionId: '',
  settings: undefined,
  startedAtWallMs: 0,
  rootDir: '',
  segments: [],
  segmentIndex: 0,
  wav: undefined,
  wavHasData: false,
  audioMuxed: false,
  encoder: undefined
}
let phaseListener: ((phase: RecordPhase) => void) | undefined
let errorListener: ((message: string) => void) | undefined
let encoderProbePromise: Promise<VideoEncoderId> | undefined
let customOutputDir: string | undefined
let healthTimer: NodeJS.Timeout | undefined
let fallbackActive: boolean = false
/** 当前分段连续零产出的重试次数 */
let captureAttempts: number = 0

/** 分段健康检测延时：MKV muxer 写盘缓冲可达 ~4 秒才首次落盘（小分辨率
 *  高压缩码率下更慢），检查过早会把正常录制误判为零产出而反复重启 */
const HEALTH_CHECK_MS: number = 8000
/** 健康阈值（字节）：fragmented MP4 正常录制应远超此值 */
const HEALTH_MIN_BYTES: number = 1024
/** 主路径（ddagrab/GPU 捕获）连续失败重试上限：桌面捕获故障通常是间歇性的，反复重启可自愈 */
const MAX_DDAGRAB_RETRIES: number = 3
/** 回退路径（gdigrab/GDI 捕获）重试上限 */
const MAX_GDI_RETRIES: number = 3

const clearHealthCheck = (): void => {
  if (healthTimer !== undefined) {
    clearTimeout(healthTimer)
    healthTimer = undefined
  }
}

/** 检查文件字节数；不存在返回 0 */
const fileSizeOrZero = (filePath: string): number => {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

/** 安排一次分段健康检测（非阻塞，到达时间后校验产出并按需降级） */
const armHealthCheck = (segmentFile: string): void => {
  clearHealthCheck()
  healthTimer = setTimeout(() => {
    void verifySegmentHealth(segmentFile)
  }, HEALTH_CHECK_MS)
}

/** 分段健康校验：零产出时按「主路径重试 3 次 → GDI 回退重试 3 次」循环重启，
 *  桌面捕获的间歇性故障（驱动/其他捕获软件干扰）在时间窗内会自愈；全部失败才终止会话。 */
const verifySegmentHealth = async (segmentFile: string): Promise<void> => {
  if (state.phase !== 'recording' || session === undefined) {
    return
  }
  const filePath = path.join(state.rootDir, segmentFile)
  const size = fileSizeOrZero(filePath)
  if (size >= HEALTH_MIN_BYTES) {
    return
  }
  captureAttempts += 1
  const totalAllowed: number = MAX_DDAGRAB_RETRIES + MAX_GDI_RETRIES
  if (captureAttempts > totalAllowed) {
    log.error(`[record] 捕获重试 ${String(totalAllowed)} 次仍零产出（${segmentFile}），终止录制`)
    clearHealthCheck()
    await session.stop()
    log.error(`[record] 最后一次 stderr 尾部：${session.recentStderr().join(' | ') || '（空）'}`)
    await finalizeRecordingSession(['视频捕获持续无输出：已自动重试多次仍失败，请检查显示器状态（锁屏/休眠/独占全屏）或其他捕获软件'])
    setPhase('idle')
    errorListener?.('视频捕获持续无输出（已自动重试多次），本次录制已终止')
    return
  }
  const useGdi: boolean = captureAttempts > MAX_DDAGRAB_RETRIES
  const engineLabel: string = useGdi ? 'GDI 回退' : '主路径'
  log.warn(`[record] 分段 ${segmentFile} 仅 ${String(size)}B，第 ${String(captureAttempts)}/${String(totalAllowed)} 次重启（${engineLabel}）`)
  clearHealthCheck()
  await session.stop()
  const stderrTail = session.recentStderr().join(' | ')
  if (stderrTail.length > 0) {
    log.warn(`[record] stderr 尾部：${stderrTail}`)
  }
  try {
    unlinkSync(filePath)
  } catch {
    // 空壳删除失败不阻塞重试（后续会被同名文件覆盖）
  }
  state.segments = state.segments.filter((segment) => segment.file !== segmentFile)
  state.segmentIndex -= 1
  fallbackActive = useGdi
  await startSegment(Date.now())
}

/** 注入运行配置（仅可调用一次）；同时加载持久化的自定义输出目录 */
export const initRecordController = (nextConfig: ControllerConfig): void => {
  if (config !== undefined) {
    throw new Error('record-controller 已初始化，禁止重复调用 initRecordController')
  }
  config = nextConfig
  session = new FfmpegRecordSession(nextConfig.ffmpegPath)
  session.setUnexpectedExitHandler(handleUnexpectedExit)
  customOutputDir = loadAppConfig(nextConfig.userDataDir).outputDir
}

/** 注册录制错误监听（用于向渲染进程广播致命错误） */
export const setRecordErrorListener = (listener: (message: string) => void): void => {
  errorListener = listener
}

/** 注册录制阶段变化监听（用于向渲染进程广播） */
export const setPhaseListener = (listener: (phase: RecordPhase) => void): void => {
  phaseListener = listener
}

/** 后台预热编码器探测，避免首次点「开始录制」时卡顿 */
export const warmUpEncoderProbe = (): Promise<VideoEncoderId> => {
  if (config === undefined) {
    throw new Error('record-controller 尚未初始化')
  }
  if (encoderProbePromise === undefined) {
    const ffmpegPath = config.ffmpegPath
    encoderProbePromise = probeFirstAvailableEncoder((encoder) =>
      runFfmpegOnce(ffmpegPath, buildEncoderProbeArgs(encoder), 5000)
    )
  }
  return encoderProbePromise
}

const ensureEncoder = async (): Promise<VideoEncoderId> => {
  if (state.encoder !== undefined) {
    return state.encoder
  }
  const encoder = await warmUpEncoderProbe()
  state.encoder = encoder
  return encoder
}

const setPhase = (next: RecordPhase): void => {
  state.phase = next
  phaseListener?.(next)
}

/** 默认录制输出根目录：开发期项目根 recordings/，打包态用户数据目录 */
const defaultRecordingDir = (): string => {
  if (config === undefined) {
    throw new Error('record-controller 尚未初始化')
  }
  return config.isPackaged
    ? path.join(config.userDataDir, 'recordings')
    : path.join(config.appRoot, 'recordings')
}

/** 当前生效的输出目录信息（供设置面板展示） */
export const getOutputDirInfo = (): OutputDirInfo => ({
  dir: customOutputDir ?? defaultRecordingDir(),
  isDefault: customOutputDir === undefined
})

/** 设置/清除自定义输出目录（undefined = 恢复默认），持久化后返回最新信息 */
export const setCustomOutputDir = (dir: string | undefined): OutputDirInfo => {
  if (config === undefined) {
    throw new Error('record-controller 尚未初始化')
  }
  customOutputDir = dir
  saveAppConfig(config.userDataDir, { outputDir: dir })
  return getOutputDirInfo()
}

/** 冒烟模式产物目录：logs/smoke/<时间戳>/（不受自定义输出目录影响）；
 *  正常模式：用户自定义目录优先，否则默认 recordings/<sessionId>/。 */
const resolveRootDir = (sessionId: string): string => {
  if (config === undefined) {
    throw new Error('record-controller 尚未初始化')
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  if (config.smokeMode) {
    const baseDir: string = config.isPackaged ? config.userDataDir : config.appRoot
    return path.join(baseDir, 'logs', 'smoke', stamp)
  }
  const outputRoot: string = customOutputDir ?? defaultRecordingDir()
  return path.join(outputRoot, sessionId)
}

/** 分段收尾：把全部 MKV 分段无损 remux 为 MP4。
 *  成功 → 更新 segments 文件名并删除 MKV；失败 → 保留 MKV 作为兜底产物并收集警告。 */
const remuxPendingSegments = async (): Promise<readonly string[]> => {
  if (config === undefined || session === undefined || state.segments.length === 0) {
    return []
  }
  const warnings: string[] = []
  const nextSegments: RecordingSegment[] = []
  for (const segment of state.segments) {
    if (!segment.file.endsWith('.mkv')) {
      nextSegments.push(segment)
      continue
    }
    const outcome = await remuxSegmentToMp4(config.ffmpegPath, state.rootDir, segment.file)
    if (outcome.ok) {
      nextSegments.push({ ...segment, file: outcome.mp4File })
      try {
        unlinkSync(path.join(state.rootDir, segment.file))
      } catch {
        // MKV 清理失败不影响产物（仅占磁盘）
      }
    } else {
      nextSegments.push(segment)
      warnings.push(outcome.reason)
    }
  }
  state.segments = nextSegments
  return warnings
}

/** 把混音 WAV 合入全部视频分段：
 *  成功 → 音轨内嵌、删除独立 WAV；任一失败 → 保留无声 MP4 与 WAV 并返回警告。 */
const muxAudioIntoSegments = async (): Promise<readonly string[]> => {
  if (config === undefined || session === undefined) {
    return []
  }
  if (!state.wavHasData || state.segments.length === 0) {
    return []
  }
  const warnings: string[] = []
  for (const segment of state.segments) {
    if (!segment.file.endsWith('.mp4')) {
      continue
    }
    const outcome = await muxAudioIntoVideoSegment(
      config.ffmpegPath,
      state.rootDir,
      segment.file,
      'audio-mix.wav',
      segment.startOffsetMs
    )
    if (!outcome.ok) {
      warnings.push(outcome.reason)
    }
  }
  if (warnings.length === 0) {
    state.audioMuxed = true
    try {
      unlinkSync(path.join(state.rootDir, 'audio-mix.wav'))
    } catch {
      // WAV 清理失败不影响产物
    }
  }
  return warnings
}

/** 收尾结果：产物目录与全部警告（供 UI 提示与日志） */
type FinalizeResult = {
  readonly outputDir: string
  readonly warnings: readonly string[]
}

/** 收尾全管线（正常停止与意外退出共用）：
 *  关音频写入器 → MKV 分段 remux 为 MP4 → 音频合入视频 → 产物校验 → 写清单。 */
const finalizeRecordingSession = async (extraWarnings: readonly string[]): Promise<FinalizeResult> => {
  if (state.settings === undefined) {
    throw new Error('会话设置丢失')
  }
  state.wav?.close()
  state.wav = undefined
  const remuxWarnings = await remuxPendingSegments()
  const muxWarnings = await muxAudioIntoSegments()
  const warnings = [...extraWarnings, ...remuxWarnings, ...muxWarnings, ...undersizedSegmentWarnings(state.rootDir, state.segments)]
  const audio = state.wavHasData && !state.audioMuxed
    ? {
        file: 'audio-mix.wav',
        sampleRate: AUDIO_SAMPLE_RATE,
        channels: AUDIO_CHANNELS,
        startOffsetMs: 0
      }
    : undefined
  const manifest = buildRecordManifest({
    sessionId: state.sessionId,
    startedAtWallMs: state.startedAtWallMs,
    stoppedAtWallMs: Date.now(),
    settings: state.settings,
    segments: state.segments,
    audio,
    warnings
  })
  writeFileSync(path.join(state.rootDir, 'session.json'), JSON.stringify(manifest, null, 2), 'utf8')
  return { outputDir: state.rootDir, warnings }
}

/** FFmpeg 进程意外死亡（非主动停止）：落日志、remux 已有分段、终止会话、广播错误给 UI */
const handleUnexpectedExit = (exit: SessionExit): void => {
  if (state.phase !== 'recording' && state.phase !== 'paused') {
    return
  }
  const stderrText = exit.stderr.join(' | ')
  log.error(`[record] FFmpeg 进程意外退出（code=${String(exit.exitCode)}）：${stderrText}`)
  clearHealthCheck()
  void (async () => {
    await finalizeRecordingSession(['视频编码进程意外退出，本次录制已终止'])
    setPhase('idle')
    errorListener?.('视频录制进程异常退出，本次会话已终止（原因已写入日志）')
  })()
}

/** 启动一个新分段（按降级状态选择捕获引擎），并安排健康检测。
 *  区域模式走 ddagrab 原生 offset/video_size（全 GPU 裁剪）；GDI 仅作健康检测降级。 */
const startSegment = async (wallMs: number): Promise<void> => {
  if (session === undefined || state.settings === undefined) {
    throw new Error('会话尚未初始化')
  }
  state.segmentIndex += 1
  const file = buildSegmentFileName(state.segmentIndex)
  const outputFilePath = path.join(state.rootDir, file)
  if (fallbackActive) {
    session.startRaw(buildGdigrabRecordArgs(state.settings, outputFilePath), outputFilePath)
  } else {
    const encoder = await ensureEncoder()
    session.start(state.settings, encoder, outputFilePath)
  }
  state.segments = [
    ...state.segments,
    { file, startOffsetMs: Math.max(0, wallMs - state.startedAtWallMs) }
  ]
  armHealthCheck(file)
}

/** 开始录制：校验状态机 → 建目录 → 建音频写入器 → 起第一分段 */
export const startRecording = async (settings: RecordSettings): Promise<StartRecordingResult> => {
  const transition = transitionRecordPhase(state.phase, 'start')
  if (!transition.ok) {
    return { ok: false, error: transition.reason }
  }
  try {
    if (config === undefined || session === undefined) {
      throw new Error('record-controller 尚未初始化')
    }
    const encoder = await ensureEncoder()
    const sessionId = randomUUID()
    state.sessionId = sessionId
    state.settings = settings
    state.startedAtWallMs = Date.now()
    state.rootDir = resolveRootDir(sessionId)
    state.segments = []
    state.segmentIndex = 0
    mkdirSync(state.rootDir, { recursive: true })
    const wantAudio: boolean = settings.captureSystemAudio || settings.captureMicrophone
    state.wav = wantAudio
      ? new WavStreamWriter(path.join(state.rootDir, 'audio-mix.wav'), WAV_SAMPLE_RATE, WAV_CHANNELS)
      : undefined
    state.wavHasData = false
    state.audioMuxed = false
    fallbackActive = false
    captureAttempts = 0
    await startSegment(Date.now())
    setPhase('recording')
    log.info(`[record] 开始录制：${sessionId}（${settings.mode.kind}，${String(settings.framerate)}fps，输出 ${state.rootDir}）`)
    return { ok: true, sessionId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `启动录制失败：${message}` }
  }
}

/** 暂停录制：结束当前分段（fragmented MP4 强杀安全） */
export const pauseRecording = async (): Promise<void> => {
  const transition = transitionRecordPhase(state.phase, 'pause')
  if (!transition.ok) {
    throw new Error(transition.reason)
  }
  clearHealthCheck()
  await session?.stop()
  setPhase('paused')
  log.info('[record] 已暂停')
}

/** 恢复录制：开启新分段 */
export const resumeRecording = async (): Promise<void> => {
  const transition = transitionRecordPhase(state.phase, 'resume')
  if (!transition.ok) {
    throw new Error(transition.reason)
  }
  await startSegment(Date.now())
  setPhase('recording')
  log.info('[record] 已恢复录制')
}

/** 停止录制：结束分段 → 产物校验 → 关音频 → 写 session.json 清单 */
export const stopRecording = async (): Promise<StopRecordingResult> => {
  const transition = transitionRecordPhase(state.phase, 'stop')
  if (!transition.ok) {
    return { ok: false, error: transition.reason }
  }
  try {
    clearHealthCheck()
    await session?.stop()
    // 正常停止也输出 stderr 尾部：零产出但进程存活类故障（如桌面复制无帧）的唯一线索
    const stderrTail = session?.recentStderr() ?? []
    if (stderrTail.length > 0) {
      log.info(`[record] FFmpeg stderr 尾部：${stderrTail.join(' | ')}`)
    }
    const finalized = await finalizeRecordingSession([])
    if (finalized.warnings.length > 0) {
      log.warn(`[record] 产物警告：${finalized.warnings.join('；')}`)
    }
    log.info(`[record] 录制结束：${state.sessionId}，${String(state.segments.length)} 个分段，${state.audioMuxed ? '音视频已合成' : '未合成音频'}，产物 ${finalized.outputDir}`)
    setPhase('idle')
    return { ok: true, outputDir: finalized.outputDir, warnings: finalized.warnings }
  } catch (error) {
    setPhase('idle')
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `停止录制失败：${message}` }
  }
}

/** 接收渲染进程上报的音频 PCM 块（48kHz 立体声 Int16） */
export const onAudioChunk = (arrayBuffer: ArrayBuffer): void => {
  const wav = state.wav
  if (wav === undefined) {
    return
  }
  wav.append(Buffer.from(arrayBuffer))
  state.wavHasData = true
}

/** 当前录制阶段（供状态查询） */
export const currentPhase = (): RecordPhase => state.phase

/** 当前分段 FFmpeg 进程最近 stderr（诊断用） */
export const recentSessionStderr = (): readonly string[] => session?.recentStderr() ?? []

/** 渲染进程日志消息按级别写入文件日志 */
export const logRendererMessage = (log: (message: string) => void, message: LogMessage): void => {
  log(`[renderer] ${message.message}`)
}
