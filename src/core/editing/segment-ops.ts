import type { EditSegment } from '../../shared/types'

/**
 * 时间轴片段操作（纯函数）：按源时间区间对片段列表做「拆分 + 加速 / 删除」。
 * 片段列表始终有序且不重叠；与目标区间相交的片段会被拆为 左/中/右 三部分，仅「中」受操作影响。
 */

const EPSILON: number = 0.001

/** 区间有效判定（允许极小误差） */
export const isValidRange = (from: number, to: number): boolean => to - from > EPSILON

/** 规范化选区（a、b 任意顺序） */
export const normalizeRange = (a: number, b: number): readonly [number, number] =>
  a <= b ? [a, b] : [b, a]

type Split = {
  readonly left: EditSegment | undefined
  readonly mid: EditSegment | undefined
  readonly right: EditSegment | undefined
}

/** 把单段按 [from,to] 拆三段（不相交时 mid 为空） */
const splitSegment = (segment: EditSegment, from: number, to: number): Split => {
  const left: EditSegment | undefined = segment.startSec < from - EPSILON
    ? { startSec: segment.startSec, endSec: Math.min(segment.endSec, from), speed: segment.speed }
    : undefined
  const midStart: number = Math.max(segment.startSec, from)
  const midEnd: number = Math.min(segment.endSec, to)
  const mid: EditSegment | undefined = midEnd - midStart > EPSILON
    ? { startSec: midStart, endSec: midEnd, speed: segment.speed }
    : undefined
  const right: EditSegment | undefined = segment.endSec > to + EPSILON
    ? { startSec: Math.max(segment.startSec, to), endSec: segment.endSec, speed: segment.speed }
    : undefined
  return { left, mid, right }
}

/** 把选区内的片段倍速设为 speed（选区外保持不变；相邻同参段不自动合并，渲染层自然衔接） */
export const applySpeedToRange = (
  segments: readonly EditSegment[],
  from: number,
  to: number,
  speed: number
): readonly EditSegment[] => {
  const next: EditSegment[] = []
  for (const segment of segments) {
    const { left, mid, right } = splitSegment(segment, from, to)
    if (left !== undefined) next.push(left)
    if (mid !== undefined) next.push({ ...mid, speed })
    if (right !== undefined) next.push(right)
  }
  return next
}

/** 删除选区内的片段（选区外保留） */
export const removeRange = (
  segments: readonly EditSegment[],
  from: number,
  to: number
): readonly EditSegment[] => {
  const next: EditSegment[] = []
  for (const segment of segments) {
    const { left, right } = splitSegment(segment, from, to)
    if (left !== undefined) next.push(left)
    if (right !== undefined) next.push(right)
  }
  return next
}

/** 是否存在需要加速的片段（导出前判断滤镜图是否需要变速处理） */
export const hasSpedSegment = (segments: readonly EditSegment[]): boolean =>
  segments.some((segment) => segment.speed !== 1)

/** 导出成片总时长（秒）：各段 (end-start)/speed 之和 */
export const exportedDurationSec = (segments: readonly EditSegment[]): number =>
  segments.reduce((total, segment) => total + (segment.endSec - segment.startSec) / segment.speed, 0)
