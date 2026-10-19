import type { HotkeyConfig } from '../shared/types'

/**
 * 快捷键工具（纯函数）：键盘事件 → Electron accelerator 字符串。
 * 渲染端捕获按键，主进程注册 accelerator，两端共用本模块的默认值。
 */

/** 默认快捷键（用户未自定义时） */
export const DEFAULT_HOTKEYS: HotkeyConfig = { record: 'F10', pause: 'F11' }

/** 主键白名单：功能键、数字、字母与其他常用键（Electron accelerator 命名） */
const MAIN_KEYS: ReadonlySet<string> = new Set([
  ...Array.from({ length: 24 }, (_, i) => `F${String(i + 1)}`),
  ...'0123456789'.split(''),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  'Space', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
  'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Pause', 'PrintScreen', 'Tab'
])

/** 键盘事件（可来自 KeyboardEvent 或测试构造）的最小结构 */
export type KeyEventLike = {
  readonly key: string
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly metaKey: boolean
}

/** 归一化主键：字母大写；空格映射 Space；命名键保持；未知键返回 undefined */
const normalizeMainKey = (key: string): string | undefined => {
  if (key === ' ') {
    return 'Space'
  }
  if (key.length === 1) {
    const upper: string = key.toUpperCase()
    return MAIN_KEYS.has(upper) ? upper : undefined
  }
  return MAIN_KEYS.has(key) ? key : undefined
}

/** 键盘事件 → accelerator（如 'Control+Shift+F10'）。
 *  只有修饰键（或无法识别的键）时返回 undefined，调用方继续等待。 */
export const keyboardEventToAccelerator = (event: KeyEventLike): string | undefined => {
  const main: string | undefined = normalizeMainKey(event.key)
  if (main === undefined) {
    return undefined
  }
  const parts: string[] = []
  if (event.ctrlKey) {
    parts.push('Control')
  }
  if (event.metaKey) {
    parts.push('Super')
  }
  if (event.altKey) {
    parts.push('Alt')
  }
  if (event.shiftKey) {
    parts.push('Shift')
  }
  parts.push(main)
  return parts.join('+')
}

/** 配置合法性：非空、含主键、两个快捷键不冲突 */
export const isValidHotkeyConfig = (config: HotkeyConfig): boolean => {
  const hasMain = (accelerator: string): boolean => accelerator.split('+').length > 0 && accelerator.length > 0
  return (
    hasMain(config.record) &&
    hasMain(config.pause) &&
    config.record !== config.pause &&
    config.record !== 'Escape' &&
    config.pause !== 'Escape'
  )
}
