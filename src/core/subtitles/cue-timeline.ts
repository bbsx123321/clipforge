import type { EditSegment, SubtitleCue } from '../../shared/types'

/**
 * 字幕时间轴映射（纯函数）：
 * cue 的时间是源视频时间轴；导出成片 = segments 按序拼接（裁掉区间消失、变速区间时长÷speed）。
 * 映射规则：cue 与每个保留区间相交的部分各自生成一条成片 cue（跨界 cue 被切分）；
 * 落在裁掉区间内的部分丢弃。成片时间 = 各段起点累计 + (源时刻-段起点)/speed。
 */
export const mapCuesToExportTimeline = (
  cues: readonly SubtitleCue[],
  segments: readonly EditSegment[]
): readonly SubtitleCue[] => {
  const result: SubtitleCue[] = []
  let outputPosSec: number = 0
  for (const segment of segments) {
    for (const cue of cues) {
      const partStart: number = Math.max(cue.startSec, segment.startSec)
      const partEnd: number = Math.min(cue.endSec, segment.endSec)
      if (partStart >= partEnd) {
        continue
      }
      result.push({
        ...cue,
        id: `${cue.id}@${String(result.length)}`,
        startSec: outputPosSec + (partStart - segment.startSec) / segment.speed,
        endSec: outputPosSec + (partEnd - segment.startSec) / segment.speed
      })
    }
    outputPosSec += (segment.endSec - segment.startSec) / segment.speed
  }
  return result
}
