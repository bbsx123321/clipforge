/**
 * 时间轴共享换算纯函数（视频/声音/字幕三轨与刻度行共用）：
 * 秒 ↔ 百分比、容器坐标 → 秒、自适应刻度。
 */

/** 候选刻度步长（秒），取第一个使刻度数不超过上限的步长 */
const TICK_STEPS: readonly number[] = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200]
const MAX_TICKS: number = 7

/** 计算时间刻度（纯函数）：返回 [0, step, 2*step, …] 直到时长 */
export const calculateTicks = (durationSec: number): readonly number[] => {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return [0]
  }
  const fallbackStep: number = TICK_STEPS[TICK_STEPS.length - 1] ?? 1200
  const step: number = TICK_STEPS.find((candidate) => durationSec / candidate <= MAX_TICKS) ?? fallbackStep
  const ticks: number[] = []
  for (let t = 0; t <= durationSec + 0.001; t += step) {
    ticks.push(Math.round(t * 1000) / 1000)
  }
  return ticks
}

/** 秒 → 刻度短文本（纯函数）：整分显示 m:ss，不足一分钟显示 s" 或 m:ss */
export const formatTick = (seconds: number): string => {
  if (seconds < 60 && seconds % 1 !== 0) {
    return `${String(seconds)}s`
  }
  const total = Math.floor(seconds)
  return total < 60
    ? `${String(total)}s`
    : `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

/** 秒 → 左侧百分比字符串（钳制 0~100） */
export const secondsToPct = (seconds: number, durationSec: number): string =>
  `${String(Math.min(100, Math.max(0, (seconds / Math.max(durationSec, 0.001)) * 100)))}%`

/** 容器内横向坐标 → 秒（rect 来自轨道元素的 getBoundingClientRect） */
export const clientXToSeconds = (clientX: number, rect: DOMRect | undefined, durationSec: number): number => {
  if (rect === undefined) {
    return 0
  }
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return ratio * durationSec
}
