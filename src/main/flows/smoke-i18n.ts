import { app } from 'electron'
import log from 'electron-log/main'
import { loadAppConfig } from '../../recorder/app-settings'
import { currentShellLang } from '../shell'
import { getControlWindow } from '../windows'

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 界面语言冒烟（--smoke-i18n）：渲染端 getLanguage → setLanguage('en') →
 * 校验 config.json 持久化 + 主进程托盘语言同步 + 广播事件 + 显示器 label 双语。
 * 端到端复现「设置面板切换语言」的完整链路（渲染 → preload/IPC → 主进程 → 磁盘）。
 */
export const runI18nFlow = async (): Promise<void> => {
  await sleep(2000)
  const win = getControlWindow()
  if (win === undefined) {
    log.error('[smoke-i18n] 控制条窗口不存在')
    app.exit(1)
    return
  }
  // 走真实用户路径：渲染进程 window.api 全链路（含序列化与广播）
  const probe: unknown = await win.webContents.executeJavaScript(`
    (async () => {
      const events = []
      const off = window.api.onLanguageChanged((lang) => events.push(lang))
      const initial = await window.api.getLanguage()
      const applied = await window.api.setLanguage('en')
      await new Promise((r) => setTimeout(r, 500))
      const displays = await window.api.listDisplays()
      const zhRestored = await window.api.setLanguage('zh')
      await new Promise((r) => setTimeout(r, 500))
      off()
      return JSON.stringify({
        initial,
        applied,
        events,
        displayLabel: displays.length > 0 ? displays[0].label : '(none)',
        zhRestored
      })
    })()
  `)
  log.info(`[smoke-i18n] 渲染端全链路结果：${String(probe)}`)
  const result = JSON.parse(String(probe)) as {
    readonly initial: string
    readonly applied: string
    readonly events: readonly string[]
    readonly displayLabel: string
    readonly zhRestored: string
  }
  // 磁盘持久化与主进程托盘语言最终应为 zh（冒烟结束时已切回）
  const persisted = loadAppConfig(app.getPath('userData')).lang
  const shellLang = currentShellLang()
  log.info(
    `[smoke-i18n] config.json lang=${String(persisted)}；托盘语言=${shellLang}；` +
      `显示器 label=${result.displayLabel}`
  )
  const passed: boolean =
    result.initial === 'zh' &&
    result.applied === 'en' &&
    result.events.includes('en') &&
    result.events.includes('zh') &&
    result.displayLabel.startsWith('Display') &&
    result.zhRestored === 'zh' &&
    persisted === 'zh' &&
    shellLang === 'zh'
  log.info(`[smoke-i18n] ${passed ? '全部检查点通过 ✓' : '存在失败检查点 ✗'}`)
  app.exit(passed ? 0 : 1)
}
