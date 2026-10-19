import { describe, expect, it } from 'vitest'
import { calculateTicks, formatTick } from '../src/renderer/src/components/editor/TimelineTrack'

describe('时间轴刻度计算', () => {
  it('短视频用小步长', () => {
    expect(calculateTicks(6)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(calculateTicks(20)).toEqual([0, 5, 10, 15, 20])
  })

  it('中等时长自动升档步长', () => {
    expect(calculateTicks(60)).toEqual([0, 10, 20, 30, 40, 50, 60])
    expect(calculateTicks(300)).toEqual([0, 60, 120, 180, 240, 300])
  })

  it('超长视频也不超过刻度上限', () => {
    const ticks = calculateTicks(3600)
    expect(ticks.length).toBeLessThanOrEqual(8)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBe(3600)
  })

  it('非正时长退化为单刻度', () => {
    expect(calculateTicks(0)).toEqual([0])
  })
})

describe('刻度文本格式', () => {
  it('秒/分秒自适应', () => {
    expect(formatTick(0)).toBe('0s')
    expect(formatTick(30)).toBe('30s')
    expect(formatTick(60)).toBe('1:00')
    expect(formatTick(95)).toBe('1:35')
  })
})
