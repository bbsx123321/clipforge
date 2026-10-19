import { describe, expect, it } from 'vitest'
import {
  applySpeedToRange,
  exportedDurationSec,
  hasSpedSegment,
  isValidRange,
  normalizeRange,
  removeRange
} from '../src/core/editing/segment-ops'
import type { EditSegment } from '../src/shared/types'

const WHOLE: readonly EditSegment[] = [{ startSec: 0, endSec: 100, speed: 1 }]

describe('选区工具函数', () => {
  it('区间规范化与有效性', () => {
    expect(normalizeRange(5, 2)).toEqual([2, 5])
    expect(normalizeRange(2, 5)).toEqual([2, 5])
    expect(isValidRange(1, 2)).toBe(true)
    expect(isValidRange(2, 1)).toBe(false)
    expect(isValidRange(1, 1.0005)).toBe(false)
  })
})

describe('选区加速：applySpeedToRange', () => {
  it('中间区间加速，前后保持原速（一段拆三段）', () => {
    const next = applySpeedToRange(WHOLE, 10, 20, 2)
    expect(next).toEqual([
      { startSec: 0, endSec: 10, speed: 1 },
      { startSec: 10, endSec: 20, speed: 2 },
      { startSec: 20, endSec: 100, speed: 1 }
    ])
  })

  it('选区与多段相交时逐段拆分', () => {
    const segments: readonly EditSegment[] = [
      { startSec: 0, endSec: 10, speed: 1 },
      { startSec: 10, endSec: 30, speed: 2 }
    ]
    const next = applySpeedToRange(segments, 5, 15, 3)
    expect(next).toEqual([
      { startSec: 0, endSec: 5, speed: 1 },
      { startSec: 5, endSec: 10, speed: 3 },
      { startSec: 10, endSec: 15, speed: 3 },
      { startSec: 15, endSec: 30, speed: 2 }
    ])
  })

  it('选区完全覆盖时不产生空段', () => {
    const next = applySpeedToRange(WHOLE, 0, 100, 2)
    expect(next).toEqual([{ startSec: 0, endSec: 100, speed: 2 }])
  })
})

describe('选区删除：removeRange', () => {
  it('删除中间区间得到前后两段', () => {
    const next = removeRange(WHOLE, 10, 20)
    expect(next).toEqual([
      { startSec: 0, endSec: 10, speed: 1 },
      { startSec: 20, endSec: 100, speed: 1 }
    ])
  })

  it('删除覆盖全区间后为空列表', () => {
    expect(removeRange(WHOLE, 0, 100)).toEqual([])
  })
})

describe('导出时长计算', () => {
  it('各段 (end-start)/speed 求和', () => {
    const segments: readonly EditSegment[] = [
      { startSec: 0, endSec: 10, speed: 1 },
      { startSec: 10, endSec: 30, speed: 2 }
    ]
    expect(exportedDurationSec(segments)).toBeCloseTo(10 + 10, 3)
  })

  it('hasSpedSegment 判定', () => {
    expect(hasSpedSegment(WHOLE)).toBe(false)
    expect(hasSpedSegment(applySpeedToRange(WHOLE, 0, 10, 2))).toBe(true)
  })
})
