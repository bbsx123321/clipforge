import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AsrStatus, EditProjectFile, EditSegment, SubtitleCue, SubtitleStyle } from '../../shared/types'

/**
 * 字幕工程文件读写（每个视频分段一份，session 目录下与视频同名 .edit.json）：
 * - 读：逐字段运行时校验，任何损坏字段回退默认（绝不阻塞编辑器打开）
 * - 写：整体重写 JSON（缩进 2）
 * 同时承载剪辑片段持久化（关闭编辑器后再打开恢复进度）。
 */

/** 工程文件名：screen-001.mp4 → screen-001.edit.json */
export const editProjectFileName = (videoFile: string): string =>
  `${videoFile.replace(/\.[^.]+$/, '')}.edit.json`

/** 工程文件绝对路径 */
export const editProjectFilePath = (sessionDir: string, videoFile: string): string =>
  path.join(sessionDir, editProjectFileName(videoFile))

/** 默认字幕样式：黑底白字、底部、字号 5% 视频高、边距 8% */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSizePct: 5,
  position: 'bottom',
  marginPct: 8,
  textOpacity: 1,
  boxEnabled: true,
  boxOpacity: 0.6
}

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

/** 样式校验 + 范围钳制（手改文件容错）；完全非法返回默认样式 */
const sanitizeStyle = (raw: unknown): SubtitleStyle => {
  if (typeof raw !== 'object' || raw === null) {
    return DEFAULT_SUBTITLE_STYLE
  }
  const style = raw as Record<string, unknown>
  return {
    fontSizePct: clampNumber(Number(style.fontSizePct ?? DEFAULT_SUBTITLE_STYLE.fontSizePct), 2, 12),
    position: style.position === 'top' ? 'top' : 'bottom',
    marginPct: clampNumber(Number(style.marginPct ?? DEFAULT_SUBTITLE_STYLE.marginPct), 0, 40),
    textOpacity: clampNumber(Number(style.textOpacity ?? DEFAULT_SUBTITLE_STYLE.textOpacity), 0.3, 1),
    boxEnabled: style.boxEnabled !== false,
    boxOpacity: clampNumber(Number(style.boxOpacity ?? DEFAULT_SUBTITLE_STYLE.boxOpacity), 0.2, 1)
  }
}

/** 单条 cue 校验（完全非法返回 undefined） */
const sanitizeCue = (raw: unknown): SubtitleCue | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined
  }
  const cue = raw as Record<string, unknown>
  const id: unknown = cue.id
  const text: unknown = cue.text
  const start: number = Number(cue.startSec)
  const end: number = Number(cue.endSec)
  if (typeof id !== 'string' || typeof text !== 'string' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return undefined
  }
  return { id, startSec: Math.max(0, start), endSec: end, text }
}

/** 剪辑片段校验（非法项丢弃；全部非法则回退全片单段） */
const sanitizeSegments = (raw: unknown, durationSec: number): readonly EditSegment[] => {
  if (!Array.isArray(raw)) {
    return [{ startSec: 0, endSec: durationSec, speed: 1 }]
  }
  const segments: EditSegment[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue
    }
    const segment = item as Record<string, unknown>
    const start: number = Number(segment.startSec)
    const end: number = Number(segment.endSec)
    const speed: number = Number(segment.speed)
    if (Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(speed) && speed > 0 && end > start) {
      segments.push({ startSec: start, endSec: end, speed })
    }
  }
  return segments.length > 0 ? segments : [{ startSec: 0, endSec: durationSec, speed: 1 }]
}

const sanitizeWaveform = (raw: unknown): readonly number[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value >= 0 && value <= 1)
}

const sanitizeAsrStatus = (raw: unknown): AsrStatus => {
  return raw === 'pending' || raw === 'ready' || raw === 'failed' ? raw : 'none'
}

/** 默认工程：全片单段、无字幕、默认样式（durationSec 用于全片段） */
export const defaultEditProjectFile = (videoFile: string, durationSec: number): EditProjectFile => ({
  version: 1,
  sourceFile: videoFile,
  segments: [{ startSec: 0, endSec: durationSec, speed: 1 }],
  cues: [],
  style: DEFAULT_SUBTITLE_STYLE,
  waveform: [],
  asr: { status: 'none', progress: 0, error: undefined }
})

/**
 * 读取工程文件；不存在或损坏返回默认工程。
 * durationSec 为源时长（探测值），用于全片默认段与进度兜底。
 */
export const loadEditProjectFile = (sessionDir: string, videoFile: string, durationSec: number): EditProjectFile => {
  const filePath: string = editProjectFilePath(sessionDir, videoFile)
  if (!existsSync(filePath)) {
    return defaultEditProjectFile(videoFile, durationSec)
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) {
      return defaultEditProjectFile(videoFile, durationSec)
    }
    const raw = parsed as Record<string, unknown>
    const cues: readonly SubtitleCue[] = Array.isArray(raw.cues)
      ? raw.cues.map(sanitizeCue).filter((cue: SubtitleCue | undefined): cue is SubtitleCue => cue !== undefined)
      : []
    const asrRaw: Record<string, unknown> = typeof raw.asr === 'object' && raw.asr !== null
      ? raw.asr as Record<string, unknown>
      : {}
    const progress: number = clampNumber(Number(asrRaw.progress ?? 0), 0, 100)
    return {
      version: 1,
      sourceFile: typeof raw.sourceFile === 'string' ? raw.sourceFile : videoFile,
      segments: sanitizeSegments(raw.segments, durationSec),
      cues,
      style: sanitizeStyle(raw.style),
      waveform: sanitizeWaveform(raw.waveform),
      asr: {
        status: sanitizeAsrStatus(asrRaw.status),
        progress,
        error: typeof asrRaw.error === 'string' ? asrRaw.error : undefined
      }
    }
  } catch {
    return defaultEditProjectFile(videoFile, durationSec)
  }
}

/** 写入工程文件（整体重写） */
export const saveEditProjectFile = (sessionDir: string, file: EditProjectFile): void => {
  const filePath: string = editProjectFilePath(sessionDir, file.sourceFile)
  writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf8')
}

/**
 * 读-合并-写（识别任务更新 asr/cues/waveform 用）：
 * 浅合并顶层字段，返回合并后的完整工程。
 */
export const updateEditProjectFile = (
  sessionDir: string,
  videoFile: string,
  durationSec: number,
  partial: Partial<EditProjectFile>
): EditProjectFile => {
  const current: EditProjectFile = loadEditProjectFile(sessionDir, videoFile, durationSec)
  const merged: EditProjectFile = { ...current, ...partial }
  saveEditProjectFile(sessionDir, merged)
  return merged
}
