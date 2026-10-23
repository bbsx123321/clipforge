import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import log from 'electron-log/main'
import type { EditProjectFile, RecordingSegment, SubtitleProgressEvent } from '../../shared/types'
import { loadEditProjectFile, saveEditProjectFile, updateEditProjectFile } from '../../core/subtitles/edit-project-io'
import { parseWhisperJson } from '../../core/subtitles/subtitle-serialize'
import { buildAsrWavArgs, buildWaveformPcmArgs } from '../../recorder/asr/asr-ffmpeg-args'
import { buildWhisperArgs } from '../../recorder/asr/whisper-args'
import { runWhisperTranscribe } from '../../recorder/asr/whisper-run'
import { runFfmpegCollectStdout, runFfmpegOnce } from '../../recorder/ffmpeg/ffmpeg-run'
import { probeVideo } from '../media-service'
import type { SessionFinalizedEvent } from '../record-controller'

/**
 * 字幕识别编排服务：
 * - 会话收尾后自动对首段跑 whisper（麦克风音频 → cues 写入工程文件）
 * - 波形峰值按需生成（编辑器打开时）
 * - 工程文件读写（剪辑片段 + 字幕 + 样式持久化）
 * 进行中任务以 dirPath+videoFile 为键防重入。
 */

export type SubtitleServiceDeps = {
  readonly ffmpegPath: string
  readonly ffprobePath: string
  readonly whisperCliPath: string
  readonly whisperModelPath: string
  /** 识别进度广播（发送全部窗口） */
  readonly broadcastProgress: (event: SubtitleProgressEvent) => void
}

let deps: SubtitleServiceDeps | undefined
/** 进行中的识别任务键集合（dirPath/videoFile） */
const runningTranscriptions = new Set<string>()

/** 注入依赖（app ready 后由入口调用一次） */
export const initSubtitleService = (nextDeps: SubtitleServiceDeps): void => {
  deps = nextDeps
}

/** whisper 二进制与模型是否齐备（缺失时字幕功能优雅降级，不影响录制） */
export const whisperResourcesAvailable = (): boolean =>
  deps !== undefined && deps.whisperCliPath !== '' && deps.whisperModelPath !== ''

const taskKey = (dirPath: string, videoFile: string): string => `${dirPath}/${videoFile}`

/** 波形峰值扫描：16kHz mono s16le PCM → 每 0.1s 一点归一化峰值 */
const scanWaveformPeaks = (pcm: Buffer): readonly number[] => {
  const samplesPerPoint: number = 1600
  const peaks: number[] = []
  for (let offset = 0; offset + 1 < pcm.length; offset += samplesPerPoint * 2) {
    let peak: number = 0
    const end: number = Math.min(offset + samplesPerPoint * 2, pcm.length)
    for (let i = offset; i + 1 < end; i += 2) {
      const sample: number = Math.abs(pcm.readInt16LE(i))
      if (sample > peak) {
        peak = sample
      }
    }
    peaks.push(Math.min(1, peak / 32768))
  }
  return peaks
}

/** 读取工程（供 edit/load）；hasAudio 时顺带按需生成波形峰值 */
export const loadSubtitleProject = async (
  dirPath: string,
  videoFile: string,
  durationSec: number,
  hasAudio: boolean
): Promise<EditProjectFile> => {
  const project: EditProjectFile = loadEditProjectFile(dirPath, videoFile, durationSec)
  if (!hasAudio || project.waveform.length > 0 || deps === undefined) {
    return project
  }
  const pcm: Buffer | undefined = await runFfmpegCollectStdout(
    deps.ffmpegPath,
    buildWaveformPcmArgs(path.join(dirPath, videoFile)),
    Math.round(durationSec * 2 * 1000) + 30000
  )
  if (pcm === undefined || pcm.length === 0) {
    return project
  }
  const waveform: readonly number[] = scanWaveformPeaks(pcm)
  return updateEditProjectFile(dirPath, videoFile, durationSec, { waveform })
}

/** 保存工程（供 edit/save） */
export const saveSubtitleProject = (dirPath: string, file: EditProjectFile): void => {
  saveEditProjectFile(dirPath, file)
}

/**
 * 执行一次完整识别（首段）：
 * 切 16k wav → whisper → cues 写工程 → 清理过渡文件。
 * 失败保留 mic.wav 供手动重试；成功后删除（字幕已提取，重识别价值低）。
 */
const runTranscription = async (dirPath: string, videoFile: string): Promise<void> => {
  const serviceDeps: SubtitleServiceDeps | undefined = deps
  if (serviceDeps === undefined) {
    return
  }
  const micWavPath: string = path.join(dirPath, 'mic.wav')
  if (!existsSync(micWavPath)) {
    // 无麦克风音频（从未录制或已成功识别过）：保持现状返回
    return
  }
  const probe = await probeVideo(serviceDeps.ffprobePath, path.join(dirPath, videoFile))
  const durationSec: number = probe.durationSec > 0 ? probe.durationSec : 60
  const asrWav: string = path.join(dirPath, '.asr-input.wav')
  const asrJsonPrefix: string = path.join(dirPath, '.asr-output')
  const asrJson: string = `${asrJsonPrefix}.json`
  const key: string = taskKey(dirPath, videoFile)
  const progressEvent = (progress: number): SubtitleProgressEvent => ({ dirPath, videoFile, progress })

  updateEditProjectFile(dirPath, videoFile, durationSec, {
    asr: { status: 'pending', progress: 0, error: undefined }
  })
  serviceDeps.broadcastProgress(progressEvent(0))
  log.info(`[subtitle] 开始识别：${key}`)

  // ① 切识别输入 wav（首段区间，16kHz mono）
  const cutOk: boolean = await runFfmpegOnce(
    serviceDeps.ffmpegPath,
    buildAsrWavArgs(micWavPath, 0, durationSec, asrWav),
    Math.round(durationSec * 2 * 1000) + 30000
  )
  if (!cutOk) {
    updateEditProjectFile(dirPath, videoFile, durationSec, {
      asr: { status: 'failed', progress: 0, error: '音频预处理失败' }
    })
    return
  }

  // ② whisper 转写（进度节流：每 5% 或完成时写盘+广播）
  let lastReported: number = 0
  const threadCount: number = Math.max(1, Math.min(8, os.cpus().length - 1))
  const result = await runWhisperTranscribe(
    serviceDeps.whisperCliPath,
    buildWhisperArgs(serviceDeps.whisperModelPath, asrWav, asrJsonPrefix, threadCount),
    asrJson,
    Math.round(durationSec * 6 * 1000) + 60000,
    (percent) => {
      if (percent - lastReported >= 5 || percent >= 100) {
        lastReported = percent
        updateEditProjectFile(dirPath, videoFile, durationSec, {
          asr: { status: 'pending', progress: percent, error: undefined }
        })
        serviceDeps.broadcastProgress(progressEvent(percent))
      }
    }
  )

  // ③ 结果写工程 / 清理过渡文件
  unlinkSync(asrWav)
  if (result.ok) {
    const cues = parseWhisperJson(readFileSync(result.jsonPath, 'utf8'))
    unlinkSync(result.jsonPath)
    updateEditProjectFile(dirPath, videoFile, durationSec, {
      cues,
      asr: { status: 'ready', progress: 100, error: undefined }
    })
    // 字幕已提取，麦克风源文件使命完成（失败路径保留供重试）
    try {
      unlinkSync(micWavPath)
    } catch {
      // 清理失败不影响产物
    }
    log.info(`[subtitle] 识别完成：${key}，${String(cues.length)} 条字幕`)
    serviceDeps.broadcastProgress(progressEvent(100))
  } else {
    updateEditProjectFile(dirPath, videoFile, durationSec, {
      asr: { status: 'failed', progress: 0, error: result.error }
    })
    log.warn(`[subtitle] 识别失败：${key}：${result.error}`)
  }
}

/** 手动触发/重试识别（编辑器 IPC 入口）；已在跑或无资源返回 false */
export const startTranscription = async (dirPath: string, videoFile: string): Promise<boolean> => {
  if (!whisperResourcesAvailable()) {
    return false
  }
  const key: string = taskKey(dirPath, videoFile)
  if (runningTranscriptions.has(key)) {
    return false
  }
  runningTranscriptions.add(key)
  try {
    await runTranscription(dirPath, videoFile)
  } finally {
    runningTranscriptions.delete(key)
  }
  return true
}

/** 会话收尾钩子：开麦克风 + whisper 资源齐备 → 后台识别首段（不阻塞收尾） */
export const handleSessionFinalized = (event: SessionFinalizedEvent): void => {
  if (!event.settings.captureMicrophone || !whisperResourcesAvailable()) {
    return
  }
  const first: RecordingSegment | undefined = event.segments[0]
  if (first === undefined || event.micAudioFile === undefined) {
    return
  }
  void startTranscription(event.rootDir, first.file)
}
