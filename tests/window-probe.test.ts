import { describe, expect, it } from 'vitest'
import { parseProbeLine } from '../src/recorder/window-rect'

describe('窗口探查输出解析', () => {
  it('正常行解析出句柄/矩形/标题', () => {
    const result = parseProbeLine('67146|509|135|1772|1001|ZCode')
    expect(result).toEqual({
      hwnd: '67146',
      left: 509,
      top: 135,
      right: 1772,
      bottom: 1001,
      title: 'ZCode'
    })
  })

  it('标题含竖线时不被截断', () => {
    const result = parseProbeLine('1|0|0|100|100|A|B')
    expect(result?.title).toBe('A|B')
  })

  it('none / 非法行 / 过小矩形返回 undefined', () => {
    expect(parseProbeLine('none')).toBeUndefined()
    expect(parseProbeLine('garbage')).toBeUndefined()
    expect(parseProbeLine('1|0|0|1|1|x')).toBeUndefined()
    expect(parseProbeLine('NaN|0|0|10|10|x')).toBeUndefined()
  })
})
