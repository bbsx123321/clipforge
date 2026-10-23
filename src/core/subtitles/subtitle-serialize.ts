import type { SubtitleCue, SubtitleStyle } from '../../shared/types'

/**
 * 字幕序列化纯函数：
 * - toSrt：通用 .srt（平台投稿 / mov_text 软轨输入）
 * - toAss：libass 烧录用（携带样式：字号/位置/边距/透明度/黑底）
 * - parseWhisperJson：whisper-cli -oj 输出 → cues
 */

/** 秒 → SRT 时间戳 HH:MM:SS,mmm */
const formatSrtTime = (seconds: number): string => {
  const totalMs: number = Math.max(0, Math.round(seconds * 1000))
  const ms: number = totalMs % 1000
  const totalSec: number = Math.floor(totalMs / 1000)
  const sec: number = totalSec % 60
  const totalMin: number = Math.floor(totalSec / 60)
  const min: number = totalMin % 60
  const hour: number = Math.floor(totalMin / 60)
  const pad2: (value: number) => string = (value) => String(value).padStart(2, '0')
  return `${pad2(hour)}:${pad2(min)}:${pad2(sec)},${String(ms).padStart(3, '0')}`
}

/** 秒 → ASS 时间戳 H:MM:SS.cc（厘秒） */
const formatAssTime = (seconds: number): string => {
  const totalCs: number = Math.max(0, Math.round(seconds * 100))
  const cs: number = totalCs % 100
  const totalSec: number = Math.floor(totalCs / 100)
  const sec: number = totalSec % 60
  const totalMin: number = Math.floor(totalSec / 60)
  const min: number = totalMin % 60
  const hour: number = Math.floor(totalMin / 60)
  const pad2: (value: number) => string = (value) => String(value).padStart(2, '0')
  return `${String(hour)}:${pad2(min)}:${pad2(sec)}.${pad2(cs)}`
}

/** cues → SRT 文本 */
export const toSrt = (cues: readonly SubtitleCue[]): string =>
  cues
    .map((cue, index) => {
      const text: string = cue.text.trim().replace(/\r?\n/g, '\n')
      return `${String(index + 1)}\n${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}\n${text}\n`
    })
    .join('\n')

/** 不透明度 → ASS 颜色的 AA 字节（00=不透明，FF=全透明） */
const opacityToAssAlpha = (opacity: number): string => {
  const clamped: number = Math.min(Math.max(opacity, 0), 1)
  const alpha: number = Math.round((1 - clamped) * 255)
  return alpha.toString(16).padStart(2, '0').toUpperCase()
}

/** cues + 样式 → ASS 文本（烧录滤镜输入；PlayRes 与视频同分辨率保证所见即所得） */
export const toAss = (
  cues: readonly SubtitleCue[],
  style: SubtitleStyle,
  videoWidth: number,
  videoHeight: number
): string => {
  const fontSize: number = Math.round((videoHeight * style.fontSizePct) / 100)
  const marginV: number = Math.round((videoHeight * style.marginPct) / 100)
  const alignment: number = style.position === 'top' ? 8 : 2
  const borderStyle: number = style.boxEnabled ? 3 : 1
  // BorderStyle=3（不透明盒）libass 以 OutlineColour 画盒；无盒时 Outline 为细描边保可读
  const outlineColour: string = style.boxEnabled
    ? `&H${opacityToAssAlpha(style.boxOpacity)}000000`
    : '&H00000000'
  const primaryColour: string = `&H${opacityToAssAlpha(style.textOpacity)}FFFFFF`
  const header: string = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${String(Math.max(1, Math.round(videoWidth)))}`,
    `PlayResY: ${String(Math.max(1, Math.round(videoHeight)))}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sub,Microsoft YaHei,${String(fontSize)},${primaryColour},&H00FFFFFF,${outlineColour},&H00000000,0,0,0,0,100,100,0,0,${String(borderStyle)},1,0,${String(alignment)},40,40,${String(marginV)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ''
  ].join('\n')
  const dialogues: string = cues
    .map((cue) => {
      const text: string = cue.text.trim().replace(/\r?\n/g, '\\N')
      return `Dialogue: 0,${formatAssTime(cue.startSec)},${formatAssTime(cue.endSec)},Sub,,0,0,0,,${text}`
    })
    .join('\n')
  return `${header}${dialogues}\n`
}

/** whisper-cli -oj 的单条转写记录（b5454 实测锁定：时间在 offsets.from/to，毫秒整数） */
type WhisperSegment = {
  readonly offsets?: {
    readonly from?: unknown
    readonly to?: unknown
  }
  readonly text?: unknown
}

/** 生成 cue id（解析产物无 id，按序号生成稳定标识） */
let parseCounter: number = 0

/**
 * 解析 whisper JSON 输出 → cues（丢弃空文本/非法时间条目）。
 * 兼容两种版本：transcription 为数组（v1.9+）或对象含 segments（旧版）。
 */
export const parseWhisperJson = (jsonText: string): readonly SubtitleCue[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return []
  }
  const root = parsed as Record<string, unknown>
  const segmentsRaw: unknown = Array.isArray(root.transcription)
    ? root.transcription
    : (typeof root.transcription === 'object' && root.transcription !== null
        ? (root.transcription as Record<string, unknown>).segments
        : undefined)
  if (!Array.isArray(segmentsRaw)) {
    return []
  }
  const cues: SubtitleCue[] = []
  for (const item of segmentsRaw) {
    if (typeof item !== 'object' || item === null) {
      continue
    }
    const segment = item as WhisperSegment
    const startMs: number = Number(segment.offsets?.from)
    const endMs: number = Number(segment.offsets?.to)
    const text: string = typeof segment.text === 'string' ? segment.text.trim() : ''
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || text.length === 0) {
      continue
    }
    parseCounter += 1
    cues.push({ id: `asr-${String(parseCounter)}`, startSec: startMs / 1000, endSec: endMs / 1000, text })
  }
  return cues
}
