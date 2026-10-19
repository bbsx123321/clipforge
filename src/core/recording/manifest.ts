import type { ManifestAudio, RecordManifest, RecordSettings, RecordingSegment } from '../../shared/types'

/** 生成第 n 个分段录制文件名（从 1 开始，三位编号：录制期 .mkv，停止时 remux 为 .mp4） */
export const buildSegmentFileName = (segmentIndex: number): string => {
  const normalized = Math.max(1, Math.floor(segmentIndex))
  return `screen-${String(normalized).padStart(3, '0')}.mkv`
}

/** 录制清单构造入参 */
export type ManifestInput = {
  readonly sessionId: string
  readonly startedAtWallMs: number
  readonly stoppedAtWallMs: number
  readonly settings: RecordSettings
  readonly segments: readonly RecordingSegment[]
  readonly audio: ManifestAudio | undefined
  /** 产物异常警告，正常为空数组 */
  readonly warnings: readonly string[]
}

/** 组装录制清单（纯函数，产物写入 session.json） */
export const buildRecordManifest = (input: ManifestInput): RecordManifest => ({
  version: 1,
  sessionId: input.sessionId,
  startedAtWallMs: input.startedAtWallMs,
  stoppedAtWallMs: input.stoppedAtWallMs,
  settings: input.settings,
  segments: input.segments,
  audio: input.audio,
  warnings: input.warnings
})

/** 音频固定参数：48kHz 立体声 Int16 PCM（与渲染进程 AudioWorklet 约定一致） */
export const AUDIO_SAMPLE_RATE: number = 48000
export const AUDIO_CHANNELS: number = 2
