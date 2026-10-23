import { describe, expect, it } from 'vitest'
import { mapCuesToExportTimeline } from '../src/core/subtitles/cue-timeline'
import type { EditSegment, SubtitleCue } from '../src/shared/types'

const cue = (id: string, startSec: number, endSec: number): SubtitleCue => ({ id, startSec, endSec, text: id })

describe('字幕源时间轴 → 成片时间轴映射', () => {
  it('单段原速：时间原样保留', () => {
    const segments: readonly EditSegment[] = [{ startSec: 0, endSec: 100, speed: 1 }]
    const next = mapCuesToExportTimeline([cue('a', 10, 20)], segments)
    expect(next.length).toBe(1)
    expect(next[0]?.startSec).toBe(10)
    expect(next[0]?.endSec).toBe(20)
  })

  it('裁掉区间：cue 落在被删区间内则消失', () => {
    const segments: readonly EditSegment[] = [{ startSec: 0, endSec: 10, speed: 1 }, { startSec: 30, endSec: 40, speed: 1 }]
    expect(mapCuesToExportTimeline([cue('a', 12, 20)], segments)).toEqual([])
  })

  it('跨界 cue：与保留区间相交部分切分为多条', () => {
    const segments: readonly EditSegment[] = [{ startSec: 0, endSec: 10, speed: 1 }, { startSec: 30, endSec: 40, speed: 1 }]
    // cue [5,35] 与两段相交 → 成片 [5,10] 和 [10+0=…, …]
    const next = mapCuesToExportTimeline([cue('a', 5, 35)], segments)
    expect(next.length).toBe(2)
    expect(next[0]?.startSec).toBe(5)
    expect(next[0]?.endSec).toBe(10)
    expect(next[1]?.startSec).toBe(10)
    expect(next[1]?.endSec).toBe(15)
  })

  it('变速段：成片时间 = 源时刻偏移 ÷ speed', () => {
    const segments: readonly EditSegment[] = [{ startSec: 10, endSec: 20, speed: 2 }]
    // 源 [12,16] → 段内 [2,6] → 成片 [1,3]
    const next = mapCuesToExportTimeline([cue('a', 12, 16)], segments)
    expect(next[0]?.startSec).toBe(1)
    expect(next[0]?.endSec).toBe(3)
  })

  it('切分 id 唯一（同一 cue 裁剪成多条）', () => {
    const segments: readonly EditSegment[] = [{ startSec: 0, endSec: 5, speed: 1 }, { startSec: 95, endSec: 100, speed: 1 }]
    const next = mapCuesToExportTimeline([cue('a', 3, 97)], segments)
    expect(next.length).toBe(2)
    expect(new Set(next.map((item) => item.id)).size).toBe(2)
  })
})
