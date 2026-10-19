import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import { existsSync } from 'node:fs'
import log from 'electron-log/main'
import path from 'node:path'
import type { HotkeyConfig, RecordPhase, RecordSettings, StartRecordingResult } from '../shared/types'
import { translator, type Lang } from '../shared/strings'
import { DEFAULT_HOTKEYS } from '../core/hotkeys'
import { currentPhase, pauseRecording, resumeRecording, startRecording, stopRecording } from './record-controller'
import {
  broadcastCountdown,
  closeCountdownWindow,
  createCountdownWindow,
  hasCountdownWindow,
  showControlWindow
} from './windows'

/**
 * 外壳集成：托盘图标与菜单、全局快捷键（F10/F11）、开始录制前的 3 秒倒计时编排。
 * 托盘文案跟随界面语言（setShellLang 切换后即时重建菜单与 tooltip）。
 */

let tray: Tray | undefined
/** 待录设置（arm 时快照，倒计时结束用它开录） */
let pendingSettings: RecordSettings | undefined
/** 渲染进程上报的最新设置（快捷键入口直接使用，无需打开 UI） */
let lastKnownSettings: RecordSettings | undefined
let countdownTimer: NodeJS.Timeout | undefined
let countdownSeconds: number = 0
const COUNTDOWN_FROM: number = 3
/** 当前生效的快捷键配置（注册成功才更新） */
let activeHotkeys: HotkeyConfig = DEFAULT_HOTKEYS
/** 当前界面语言（托盘文案用；启动时从持久化配置注入） */
let shellLang: Lang = 'zh'

/** 查询主进程当前界面语言 */
export const currentShellLang = (): Lang => shellLang

/** 切换界面语言：更新托盘菜单与 tooltip（按当前录制阶段重建） */
export const setShellLang = (appRoot: string, lang: Lang): void => {
  shellLang = lang
  if (tray !== undefined) {
    tray.setContextMenu(buildTrayMenu(appRoot))
    tray.setToolTip(trayTooltip(currentPhase()))
  }
}

/** 托盘 tooltip（随录制阶段与语言变化） */
const trayTooltip = (phase: RecordPhase): string => {
  const tr = translator(shellLang)
  if (phase === 'recording') {
    return tr('tray.tooltipRecording', { key: activeHotkeys.record })
  }
  if (phase === 'paused') {
    return tr('tray.tooltipPaused', { key: activeHotkeys.record })
  }
  return tr('tray.tooltipIdle', { key: activeHotkeys.record })
}

/** 解析图标路径：优先打包资源，回退项目 resources */
const resolveIcon = (appRoot: string, name: string): string => {
  const packaged: string = app.isPackaged
    ? path.join(process.resourcesPath, 'icons', name)
    : path.join(appRoot, 'resources', 'icons', name)
  return existsSync(packaged) ? packaged : ''
}

/** 加载托盘图标（缺失时用空图，不阻塞功能） */
const loadTrayImage = (appRoot: string, name: string): Electron.NativeImage => {
  const file: string = resolveIcon(appRoot, name)
  return file.length > 0 ? nativeImage.createFromPath(file) : nativeImage.createEmpty()
}

/** 更新托盘图标与提示（随录制阶段变化） */
export const updateTrayState = (appRoot: string, phase: RecordPhase): void => {
  if (tray === undefined) {
    return
  }
  const recording: boolean = phase === 'recording' || phase === 'paused'
  tray.setImage(loadTrayImage(appRoot, recording ? 'recording.png' : 'idle.png'))
  tray.setToolTip(trayTooltip(phase))
}

/** 倒计时中每秒广播数字；走完自动开录并隐藏控制条到托盘 */
const tickCountdown = (appRoot: string): void => {
  if (countdownSeconds > 0) {
    broadcastCountdown(countdownSeconds)
    countdownSeconds -= 1
    return
  }
  // 必须先取出待录设置再清理（clearCountdown 会清空 pendingSettings）
  const settings: RecordSettings | undefined = pendingSettings
  clearCountdown()
  void beginRecordingAfterCountdown(appRoot, settings)
}

/** 清理倒计时（完成或取消） */
const clearCountdown = (): void => {
  if (countdownTimer !== undefined) {
    clearInterval(countdownTimer)
    countdownTimer = undefined
  }
  closeCountdownWindow()
  pendingSettings = undefined
}

/** 倒计时结束后的开录：成功则隐藏控制条（最小化到托盘） */
const beginRecordingAfterCountdown = async (
  appRoot: string,
  settings: RecordSettings | undefined
): Promise<void> => {
  if (settings === undefined) {
    log.error('[shell] 倒计时结束时丢失待录设置（不应发生，请反馈日志）')
    return
  }
  const result: StartRecordingResult = await startRecording(settings)
  if (!result.ok) {
    log.error(`[shell] 倒计时后启动录制失败：${result.error}`)
    showControlWindow(true)
    return
  }
  updateTrayState(appRoot, 'recording')
  showControlWindow(false)
}

/** 进入待录状态：快照设置 → 开倒计时覆盖层 → 3 秒倒数（3-2-1 每秒递减） */
export const armRecording = (appRoot: string, settings: RecordSettings): StartRecordingResult => {
  if (currentPhase() !== 'idle') {
    return { ok: false, error: '当前正在录制，无法开始新的录制' }
  }
  if (hasCountdownWindow()) {
    return { ok: false, error: '倒计时已在进行中' }
  }
  pendingSettings = settings
  // 首个数字 3 由下方即时广播显示；计时节拍从 2 开始，
  // 这样 t=1s 广播 2、t=2s 广播 1、t=3s 开录，精确 3 秒。
  countdownSeconds = COUNTDOWN_FROM - 1
  createCountdownWindow()
  countdownTimer = setInterval(() => tickCountdown(appRoot), 1000)
  setTimeout(() => broadcastCountdown(COUNTDOWN_FROM), 150)
  return { ok: true, sessionId: 'pending' }
}

/** 取消倒计时（未开录） */
export const cancelArm = (): void => {
  clearCountdown()
}

/** 倒计时是否进行中（外部用于避免重复 arm） */
export const isCountdownActive = (): boolean => countdownTimer !== undefined

/** 渲染进程上报最新录制设置（快捷键开录入口的数据来源） */
export const updateArmSnapshot = (settings: RecordSettings): void => {
  lastKnownSettings = settings
}

/** 设置快照是否已上报（诊断 F10 快捷键入口数据源） */
export const hasArmSnapshot = (): boolean => lastKnownSettings !== undefined

/** F10 语义：待录/录制中 → 停止；空闲 → 开始（含 3 秒倒计时）；
 *  倒计时中再按 → 取消 */
export const toggleRecord = (appRoot: string): void => {
  if (isCountdownActive()) {
    cancelArm()
    showControlWindow(true)
    return
  }
  const phase = currentPhase()
  if (phase === 'recording' || phase === 'paused') {
    void stopRecording().then(() => {
      updateTrayState(appRoot, 'idle')
    })
    return
  }
  const settings = pendingSettings ?? lastKnownSettings
  if (settings === undefined) {
    // 从未打开过 UI（理论上不会发生）：唤出控制条引导用户
    showControlWindow(true)
    return
  }
  armRecording(appRoot, settings)
}

/** F11 语义：录制中 → 暂停；已暂停 → 恢复 */
export const togglePause = (): void => {
  const phase = currentPhase()
  if (phase === 'recording') {
    void pauseRecording()
    return
  }
  if (phase === 'paused') {
    void resumeRecording()
  }
}

/** 托盘右键菜单（快捷键标签随配置变化，文案随语言变化） */
const buildTrayMenu = (appRoot: string): Menu => {
  const tr = translator(shellLang)
  return Menu.buildFromTemplate([
    { label: tr('tray.show'), click: () => showControlWindow(true) },
    { type: 'separator' },
    { label: tr('tray.toggleRecord', { key: activeHotkeys.record }), click: () => toggleRecord(appRoot) },
    { label: tr('tray.togglePause', { key: activeHotkeys.pause }), click: () => togglePause() },
    { type: 'separator' },
    { label: tr('tray.quit'), click: () => app.quit() }
  ])
}

/** 创建托盘：单击显示控制条；右键菜单提供完整操作 */
export const createTray = (appRoot: string): void => {
  tray = new Tray(loadTrayImage(appRoot, 'idle.png'))
  tray.setToolTip(trayTooltip('idle'))
  tray.on('click', () => showControlWindow(true))
  tray.setContextMenu(buildTrayMenu(appRoot))
}

/** 当前生效的快捷键（供设置面板回显） */
export const currentHotkeys = (): HotkeyConfig => activeHotkeys

/** 注册给定快捷键组合；成功更新 activeHotkeys 并刷新托盘菜单，失败回滚旧组合并返回 false */
export const applyHotkeys = (appRoot: string, next: HotkeyConfig): boolean => {
  globalShortcut.unregisterAll()
  const recordOk: boolean = globalShortcut.register(next.record, () => toggleRecord(appRoot))
  const pauseOk: boolean = globalShortcut.register(next.pause, () => togglePause())
  if (recordOk && pauseOk) {
    activeHotkeys = next
    tray?.setContextMenu(buildTrayMenu(appRoot))
    tray?.setToolTip(trayTooltip(currentPhase()))
    log.info(`[shell] 快捷键已更新：录制=${next.record} 暂停=${next.pause}`)
    return true
  }
  log.warn(`[shell] 快捷键注册失败（被占用）：录制=${next.record}(${String(recordOk)}) 暂停=${next.pause}(${String(pauseOk)})`)
  // 回滚旧组合
  globalShortcut.unregisterAll()
  globalShortcut.register(activeHotkeys.record, () => toggleRecord(appRoot))
  globalShortcut.register(activeHotkeys.pause, () => togglePause())
  return false
}

/** 启动注册：默认 F10/F11（被占用时告警不阻塞） */
export const registerGlobalShortcuts = (appRoot: string): void => {
  const recordOk: boolean = globalShortcut.register(activeHotkeys.record, () => toggleRecord(appRoot))
  const pauseOk: boolean = globalShortcut.register(activeHotkeys.pause, () => togglePause())
  if (!recordOk) {
    log.warn(`[shell] 快捷键 ${activeHotkeys.record} 注册失败（可能被其他程序占用）`)
  }
  if (!pauseOk) {
    log.warn(`[shell] 快捷键 ${activeHotkeys.pause} 注册失败（可能被其他程序占用）`)
  }
}

/** 预热指定快捷键配置（启动时从持久化配置注入） */
export const primeHotkeys = (config: HotkeyConfig): void => {
  activeHotkeys = config
}

/** 退出前清理快捷键与倒计时 */
export const disposeShell = (): void => {
  clearCountdown()
  globalShortcut.unregisterAll()
}

/** 录制阶段变化联动托盘状态 */
export const handlePhaseForShell = (appRoot: string, phase: RecordPhase): void => {
  updateTrayState(appRoot, phase)
}
