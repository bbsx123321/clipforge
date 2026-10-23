import { describe, expect, it } from 'vitest'
import {
  addCue,
  clearAllCues,
  cuesAtTime,
  nextCueId,
  removeCue,
  updateCueText,
  updateCueTime
} from '../src/core/subtitles/cue-ops'
import type { SubtitleCue } from '../src/shared/types'

const DURATION = 100

const cue = (id: string, startSec: number, endSec: number, text: string = id): SubtitleCue => ({
  id, startSec, endSec, text
})

describe('字幕条目操作', () => {
  it('addCue：钳制越界时间并按起始排序', () => {
    const next = addCue([cue('b', 10, 12)], cue('a', -5, 200), DURATION)
    expect(next.map((item) => item.id)).toEqual(['a', 'b'])
    expect(next[0]?.startSec).toBe(0)
    expect(next[0]?.endSec).toBeLessThanOrEqual(DURATION)
  })

  it('addCue：时长过短时强制最小时长', () => {
    const next = addCue([], cue('x', 10, 10.05), DURATION)
    expect((next[0]?.endSec ?? 0) - (next[0]?.startSec ?? 0)).toBeCloseTo(0.2, 2)
  })

  it('updateCueTime：反转区间自动纠正并重排序', () => {
    const next = updateCueTime([cue('a', 0, 5), cue('b', 20, 25)], 'b', 30, 22, DURATION)
    expect(next[1]?.startSec).toBe(22)
    expect(next[1]?.endSec).toBe(30)
  })

  it('updateCueText：修改文本并截断超长', () => {
    const longText: string = 'x'.repeat(500)
    const next = updateCueText([cue('a', 0, 5)], 'a', longText)
    expect(next[0]?.text.length).toBe(200)
  })

  it('removeCue / clearAllCues / cuesAtTime', () => {
    const cues = [cue('a', 0, 5), cue('b', 10, 20)]
    expect(removeCue(cues, 'a').map((item) => item.id)).toEqual(['b'])
    expect(clearAllCues()).toEqual([])
    expect(cuesAtTime(cues, 3).map((item) => item.id)).toEqual(['a'])
    expect(cuesAtTime(cues, 5)).toEqual([])
    expect(cuesAtTime(cues, 15).map((item) => item.id)).toEqual(['b'])
  })

  it('nextCueId：连续调用唯一', () => {
    const ids = new Set([nextCueId(), nextCueId(), nextCueId()])
    expect(ids.size).toBe(3)
  })
})
