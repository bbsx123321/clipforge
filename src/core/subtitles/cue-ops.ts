import type { SubtitleCue } from '../../shared/types'

/**
 * 字幕条目（cue）纯函数操作集：
 * 所有函数不修改入参，返回新数组；列表始终保持按 startSec 有序。
 */

/** 新建 cue 的最小时长（秒）：低于此值的条目在时间轴上无法拖拽 */
export const MIN_CUE_DURATION_SEC: number = 0.2

/** cue 文本上限（字符）：过长字幕在画面上不可读，超限截断 */
export const MAX_CUE_TEXT_LENGTH: number = 200

/** 生成 cue 唯一标识（时间戳 + 递增序号，会话内足够） */
let cueIdCounter: number = 0
export const nextCueId = (): string => {
  cueIdCounter += 1
  return `cue-${Date.now().toString(36)}-${String(cueIdCounter)}`
}

/** 按起始时间排序（稳定：同 start 时保持原相对顺序） */
const sortByStart = (cues: readonly SubtitleCue[]): SubtitleCue[] =>
  [...cues].sort((a, b) => a.startSec - b.startSec)

/** 规范化单条 cue：钳制时间到 [0, durationSec]、保证 start < end（最短 MIN_CUE_DURATION_SEC，毫秒取整防浮点漂移）、修剪文本 */
const clampCue = (cue: SubtitleCue, durationSec: number): SubtitleCue => {
  const start: number = Math.min(Math.max(cue.startSec, 0), Math.max(0, durationSec - MIN_CUE_DURATION_SEC))
  const minEnd: number = Math.round((start + MIN_CUE_DURATION_SEC) * 1000) / 1000
  const end: number = Math.min(Math.max(cue.endSec, minEnd), durationSec)
  return { ...cue, startSec: start, endSec: end, text: cue.text.slice(0, MAX_CUE_TEXT_LENGTH) }
}

/** 新增 cue（时间钳制 + 排序） */
export const addCue = (
  cues: readonly SubtitleCue[],
  cue: SubtitleCue,
  durationSec: number
): readonly SubtitleCue[] => sortByStart([...cues, clampCue(cue, durationSec)])

/** 按 id 移除 cue */
export const removeCue = (cues: readonly SubtitleCue[], id: string): readonly SubtitleCue[] =>
  cues.filter((cue) => cue.id !== id)

/** 按 id 更新文本 */
export const updateCueText = (cues: readonly SubtitleCue[], id: string, text: string): readonly SubtitleCue[] =>
  cues.map((cue) => (cue.id === id ? { ...cue, text: text.slice(0, MAX_CUE_TEXT_LENGTH) } : cue))

/** 按 id 更新时间区间（钳制后重排序） */
export const updateCueTime = (
  cues: readonly SubtitleCue[],
  id: string,
  startSec: number,
  endSec: number,
  durationSec: number
): readonly SubtitleCue[] =>
  sortByStart(cues.map((cue) => {
    if (cue.id !== id) {
      return cue
    }
    const start: number = Math.min(startSec, endSec)
    const end: number = Math.max(startSec, endSec)
    return clampCue({ ...cue, startSec: start, endSec: end }, durationSec)
  }))

/** 取播放时刻所在的所有 cue（时间轴允许相邻重叠，字幕层全部显示） */
export const cuesAtTime = (cues: readonly SubtitleCue[], timeSec: number): readonly SubtitleCue[] =>
  cues.filter((cue) => timeSec >= cue.startSec && timeSec < cue.endSec)

/** 清除全部 cues */
export const clearAllCues = (): readonly SubtitleCue[] => []
