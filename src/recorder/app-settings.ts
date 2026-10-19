import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { HotkeyConfig } from '../shared/types'
import { parseLang, type Lang } from '../shared/strings'

/**
 * 应用持久化配置（userData/config.json）。
 * 读取时做运行时结构校验，损坏或缺失一律回退默认值，绝不因配置问题阻塞启动。
 * 写入为合并式：只更新传入的字段，其余保留（避免输出目录与快捷键互相覆盖）。
 */

/** 应用配置 */
export type AppConfig = {
  /** 用户自定义录制输出根目录；undefined = 使用默认目录 */
  readonly outputDir: string | undefined
  /** 自定义全局快捷键；undefined = 使用默认 F10/F11 */
  readonly hotkeys: HotkeyConfig | undefined
  /** 界面语言；undefined = 默认中文 */
  readonly lang: Lang | undefined
}

/** 默认配置（未自定义任何项） */
export const EMPTY_APP_CONFIG: AppConfig = { outputDir: undefined, hotkeys: undefined, lang: undefined }

/** 配置文件路径 */
export const configFilePath = (userDataDir: string): string => path.join(userDataDir, 'config.json')

/** 解析快捷键字段（两个字段均为非空字符串才有效） */
const parseHotkeys = (raw: unknown): HotkeyConfig | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined
  }
  const record = (raw as { readonly record?: unknown }).record
  const pause = (raw as { readonly pause?: unknown }).pause
  if (typeof record === 'string' && record.length > 0 && typeof pause === 'string' && pause.length > 0) {
    return { record, pause }
  }
  return undefined
}

/** 从磁盘加载配置；文件缺失/损坏/结构不符时返回默认配置 */
export const loadAppConfig = (userDataDir: string): AppConfig => {
  const file = configFilePath(userDataDir)
  if (!existsSync(file)) {
    return EMPTY_APP_CONFIG
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof raw !== 'object' || raw === null) {
      return EMPTY_APP_CONFIG
    }
    const outputDir = (raw as { readonly outputDir?: unknown }).outputDir
    const lang = (raw as { readonly lang?: unknown }).lang
    return {
      outputDir: typeof outputDir === 'string' && outputDir.length > 0 ? outputDir : undefined,
      hotkeys: parseHotkeys((raw as { readonly hotkeys?: unknown }).hotkeys),
      lang: typeof lang === 'string' ? parseLang(lang) : undefined
    }
  } catch {
    return EMPTY_APP_CONFIG
  }
}

/** 合并写入配置（只覆盖传入字段；目录不存在时自动创建） */
export const saveAppConfig = (userDataDir: string, partial: Partial<AppConfig>): void => {
  mkdirSync(userDataDir, { recursive: true })
  const merged: AppConfig = { ...loadAppConfig(userDataDir), ...partial }
  writeFileSync(configFilePath(userDataDir), JSON.stringify(merged, null, 2), 'utf8')
}
