import { describe, expect, it } from 'vitest'
import { STRINGS, parseLang, t, translator } from '../src/shared/strings'

describe('双语字典完整性', () => {
  it('每个 key 的中英文文案均为非空字符串', () => {
    for (const [key, entry] of Object.entries(STRINGS)) {
      expect(entry.zh.length, `key=${key} 中文为空`).toBeGreaterThan(0)
      expect(entry.en.length, `key=${key} 英文为空`).toBeGreaterThan(0)
    }
  })

  it('英文文案已全部汉化外的占位符与中文占位符一一对应', () => {
    // 提取 {name} 占位符集合，中英必须一致，否则运行时插值缺失
    const placeholders = (text: string): readonly string[] =>
      (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort()
    for (const [key, entry] of Object.entries(STRINGS)) {
      expect(placeholders(entry.en), `key=${key} 中英占位符不一致`).toEqual(placeholders(entry.zh))
    }
  })
})

describe('t() 翻译与插值', () => {
  it('按语言取文案', () => {
    expect(t('zh', 'common.start', undefined)).toBe('开始')
    expect(t('en', 'common.start', undefined)).toBe('Start')
  })

  it('占位符插值（数字与字符串）', () => {
    expect(t('zh', 'notice.saved', { path: 'D:/out' })).toBe('已保存：D:/out')
    expect(t('en', 'list.selectedCount', { n: 3 })).toBe('3 selected')
  })

  it('绑定语言的 translator', () => {
    const tr = translator('en')
    expect(tr('app.name')).toBe('ClipForge')
    expect(tr('mode.fullscreen', { n: 2 })).toBe('Fullscreen · Display 2')
  })
})

describe('parseLang 配置解析', () => {
  it('仅接受 en，其余回退 zh', () => {
    expect(parseLang('en')).toBe('en')
    expect(parseLang('zh')).toBe('zh')
    expect(parseLang('fr')).toBe('zh')
    expect(parseLang(123)).toBe('zh')
    expect(parseLang(undefined)).toBe('zh')
  })
})
