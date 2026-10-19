import { describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEYS, isValidHotkeyConfig, keyboardEventToAccelerator } from '../src/core/hotkeys'

describe('键盘事件 → accelerator 转换', () => {
  it('单功能键直接映射', () => {
    expect(keyboardEventToAccelerator({ key: 'F10', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe('F10')
    expect(keyboardEventToAccelerator({ key: 'F3', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe('F3')
  })

  it('字母键大写并支持修饰组合（顺序固定）', () => {
    expect(keyboardEventToAccelerator({ key: 'r', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe('Control+Shift+R')
    expect(keyboardEventToAccelerator({ key: 'A', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })).toBe('Alt+A')
  })

  it('空格键映射为 Space', () => {
    expect(keyboardEventToAccelerator({ key: ' ', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe('Control+Space')
  })

  it('纯修饰键或未知键返回 undefined（继续等待）', () => {
    expect(keyboardEventToAccelerator({ key: 'Shift', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false })).toBeUndefined()
    expect(keyboardEventToAccelerator({ key: 'Control', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBeUndefined()
    expect(keyboardEventToAccelerator({ key: 'Dead', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeUndefined()
  })
})

describe('快捷键配置校验', () => {
  it('默认配置合法且两个键不同', () => {
    expect(DEFAULT_HOTKEYS.record).toBe('F10')
    expect(DEFAULT_HOTKEYS.pause).toBe('F11')
    expect(isValidHotkeyConfig(DEFAULT_HOTKEYS)).toBe(true)
  })

  it('两个快捷键相同或使用 Esc 时拒绝', () => {
    expect(isValidHotkeyConfig({ record: 'F9', pause: 'F9' })).toBe(false)
    expect(isValidHotkeyConfig({ record: 'Escape', pause: 'F11' })).toBe(false)
  })

  it('组合键配置合法', () => {
    expect(isValidHotkeyConfig({ record: 'Control+Shift+R', pause: 'Control+Shift+P' })).toBe(true)
  })
})
