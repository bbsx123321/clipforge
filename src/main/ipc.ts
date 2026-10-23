import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import log from 'electron-log/main'
import path from 'node:path'
import { IPC } from '../shared/ipc-channels'
import type { DisplayInfo, EditProject, EditProjectFile, LogMessage, RecordSettings, RegionRect, WindowProbe } from '../shared/types'
import {
  currentPhase,
  getOutputDirInfo,
  onAudioChunk,
  onMicAudioChunk,
  pauseRecording,
  resumeRecording,
  setCustomOutputDir,
  startRecording,
  stopRecording,
  warmUpEncoderProbe
} from './record-controller'
import { armRecording, applyHotkeys, cancelArm, currentHotkeys, currentShellLang, setShellLang, updateArmSnapshot } from './shell'
import { deleteRecordingFiles, hideRecordingRecords, listRecordings, runExport } from './media-service'
import {
  loadSubtitleProject,
  saveSubtitleProject,
  startTranscription,
  whisperResourcesAvailable
} from './services/subtitle-service'
import { isValidHotkeyConfig } from '../core/hotkeys'
import { loadAppConfig, saveAppConfig } from '../recorder/app-settings'
import { disposeWindowProbe, probeWindowAt, warmupWindowProbe } from '../recorder/window-rect'
import { ownWindowHandles } from './windows'
import { translator, parseLang, type Lang } from '../shared/strings'

/** IPC 注册所需的窗口操作依赖 */
export type IpcDeps = {
  readonly getControlWindow: () => BrowserWindow | undefined
  readonly openOverlay: () => void
  readonly openWindowPickerOverlay: () => void
  readonly closeOverlay: () => void
  readonly showRegionFrame: (region: RegionRect) => void
  readonly closeRegionFrame: () => void
  readonly setControlWindowExpanded: (expanded: boolean) => void
  readonly setControlWindowVisible: (visible: boolean) => void
  readonly setControlWindowSize: (width: number, height: number) => void
  readonly setControlWindowBounds: (bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }) => void
  readonly appRoot: string
  readonly ffmpegPath: string
  readonly ffprobePath: string
  readonly userDataDir: string
}

/** 光标物理坐标 → 顶层窗口探查（换算为「窗口中心所在显示器」的相对物理矩形）。
 *  排除自家全部窗口（选择覆盖层在最顶层，不排除则永远命中自己 → 全屏捕获）。 */
const probeAtCursor = async (): Promise<WindowProbe | undefined> => {
  const point = screen.getCursorScreenPoint()
  const primary = screen.getPrimaryDisplay()
  const physicalX = Math.round(point.x * primary.scaleFactor)
  const physicalY = Math.round(point.y * primary.scaleFactor)
  const raw = await probeWindowAt(physicalX, physicalY, ownWindowHandles())
  if (raw === undefined) {
    return undefined
  }
  // 找窗口中心所在的显示器（物理坐标系；按 X 排序使序号与 ddagrab output_idx 一致）
  const centerX = (raw.left + raw.right) / 2
  const centerY = (raw.top + raw.bottom) / 2
  const sortedDisplays = [...screen.getAllDisplays()].sort((a, b) => a.bounds.x - b.bounds.x)
  let displayIndex = -1
  sortedDisplays.forEach((item, index) => {
    if (displayIndex >= 0) {
      return
    }
    const bx = item.bounds.x * item.scaleFactor
    const by = item.bounds.y * item.scaleFactor
    const bw = item.bounds.width * item.scaleFactor
    const bh = item.bounds.height * item.scaleFactor
    if (centerX >= bx && centerX < bx + bw && centerY >= by && centerY < by + bh) {
      displayIndex = index
    }
  })
  if (displayIndex < 0) {
    return undefined
  }
  const display = sortedDisplays[displayIndex]
  if (display === undefined) {
    return undefined
  }
  const originX = display.bounds.x * display.scaleFactor
  const originY = display.bounds.y * display.scaleFactor
  return {
    rect: {
      x: raw.left - originX,
      y: raw.top - originY,
      width: raw.right - raw.left,
      height: raw.bottom - raw.top
    },
    title: raw.title,
    outputIndex: displayIndex
  }
}

/** 枚举显示器：按 X 坐标排序，顺序即 FFmpeg ddagrab 的 output_idx（label 随界面语言） */
export const enumerateDisplays = (lang: Lang): readonly DisplayInfo[] => {
  const tr = translator(lang)
  const primaryId: number = screen.getPrimaryDisplay().id
  const displays = [...screen.getAllDisplays()].sort((a, b) => a.bounds.x - b.bounds.x)
  return displays.map((display, index) => ({
    id: String(display.id),
    outputIndex: index,
    label: `${tr('display.label', { n: index + 1 })}${display.id === primaryId ? tr('display.primarySuffix') : ''}`,
    // ddagrab 输出物理像素，这里统一换算为物理分辨率
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
    isPrimary: display.id === primaryId
  }))
}

/** 按级别写渲染进程日志 */
const writeRendererLog = (message: LogMessage): void => {
  const text = `[renderer] ${message.message}`
  if (message.level === 'warn') {
    log.warn(text)
    return
  }
  if (message.level === 'error') {
    log.error(text)
    return
  }
  log.info(text)
}

/** 注册全部 IPC 通道（invoke/send 与 preload 契约一一对应） */
export const registerIpcHandlers = (deps: IpcDeps): void => {
  ipcMain.handle(IPC.listDisplays, () => enumerateDisplays(currentShellLang()))
  ipcMain.handle(IPC.recordStart, (_event, settings: RecordSettings) => startRecording(settings))
  ipcMain.handle(IPC.recordPause, () => pauseRecording())
  ipcMain.handle(IPC.recordResume, () => resumeRecording())
  ipcMain.handle(IPC.recordStop, () => stopRecording())
  ipcMain.handle(IPC.regionPickerOpen, () => {
    deps.openOverlay()
    return true
  })
  ipcMain.on(IPC.audioChunk, (_event, buffer: ArrayBuffer) => onAudioChunk(buffer))
  ipcMain.on(IPC.audioMicChunk, (_event, buffer: ArrayBuffer) => onMicAudioChunk(buffer))
  // 字幕识别为后台长任务：受理即返回，进度经 subtitle/progress 广播
  ipcMain.handle(IPC.subtitleRun, (_event, dirPath: string, videoFile: string) => {
    if (!whisperResourcesAvailable()) {
      return false
    }
    void startTranscription(dirPath, videoFile)
    return true
  })
  ipcMain.handle(IPC.editLoad, (_event, dirPath: string, videoFile: string, durationSec: number, hasAudio: boolean) =>
    loadSubtitleProject(dirPath, videoFile, durationSec, hasAudio))
  ipcMain.handle(IPC.editSave, (_event, dirPath: string, file: EditProjectFile) => {
    saveSubtitleProject(dirPath, file)
    return true
  })
  ipcMain.on(IPC.appLog, (_event, message: LogMessage) => writeRendererLog(message))
  ipcMain.on(IPC.regionSelected, (_event, region: RegionRect) => {
    log.info(`[region] 选定区域：${JSON.stringify(region)}`)
    deps.closeOverlay()
    // 选区确认后立即显示红色描边常驻指示（物理像素区域 + 物理分辨率角标）
    deps.showRegionFrame(region)
    const control = deps.getControlWindow()
    if (control !== undefined && !control.isDestroyed()) {
      control.webContents.send(IPC.regionSelected, region)
    }
  })
  ipcMain.on(IPC.regionCancel, () => deps.closeOverlay())
  ipcMain.on(IPC.regionFrameClose, () => deps.closeRegionFrame())

  // ── 窗口捕获选择 ──
  ipcMain.handle(IPC.windowPickerOpen, () => {
    warmupWindowProbe()
    deps.openWindowPickerOverlay()
    return true
  })
  ipcMain.on(IPC.windowPickerCancel, () => deps.closeOverlay())
  ipcMain.handle(IPC.windowHoverProbe, () => probeAtCursor())
  ipcMain.handle(IPC.windowPick, async () => {
    const probe = await probeAtCursor()
    deps.closeOverlay()
    if (probe === undefined) {
      return undefined
    }
    log.info(`[window-pick] 选定窗口：${probe.title} ${JSON.stringify(probe.rect)}`)
    // 红框常驻指示（与区域描边同一机制，包裹所选窗口）
    deps.showRegionFrame(probe.rect)
    const control = deps.getControlWindow()
    if (control !== undefined && !control.isDestroyed()) {
      control.webContents.send(IPC.windowSelected, probe)
    }
    return probe
  })
  ipcMain.handle(IPC.windowExpand, (_event, expanded: boolean) => {
    deps.setControlWindowExpanded(expanded)
    return true
  })
  ipcMain.handle(IPC.windowResize, (_event, width: number, height: number) => {
    deps.setControlWindowSize(width, height)
    return true
  })
  ipcMain.handle(IPC.recordingsList, () => listRecordings(getOutputDirInfo().dir, deps.ffprobePath))
  ipcMain.handle(IPC.recordingsDeleteFiles, (_event, dirPaths: readonly string[]) => {
    const failed: readonly string[] = deleteRecordingFiles(dirPaths, getOutputDirInfo().dir)
    if (failed.length > 0) {
      log.warn(`[recordings] 删除源文件失败 ${String(failed.length)} 项（被占用或越权）`)
    }
    return failed
  })
  ipcMain.handle(IPC.recordingsHideRecords, (_event, dirPaths: readonly string[]) => {
    const failed: readonly string[] = hideRecordingRecords(dirPaths, getOutputDirInfo().dir)
    if (failed.length > 0) {
      log.warn(`[recordings] 移除记录失败 ${String(failed.length)} 项`)
    }
    return failed
  })
  ipcMain.handle(IPC.windowSetBounds, (_event, bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }) => {
    deps.setControlWindowBounds(bounds)
    return true
  })
  ipcMain.handle(IPC.hotkeysGet, () => currentHotkeys())
  ipcMain.handle(IPC.hotkeysUpdate, (_event, config: { readonly record: string; readonly pause: string }) => {
    if (!isValidHotkeyConfig(config)) {
      log.warn(`[hotkeys] 配置非法：${JSON.stringify(config)}`)
      return false
    }
    const applied: boolean = applyHotkeys(deps.appRoot, config)
    if (applied) {
      saveAppConfig(deps.userDataDir, { hotkeys: config })
    }
    return applied
  })

  // ── 界面语言 ──
  ipcMain.handle(IPC.languageGet, () => loadAppConfig(deps.userDataDir).lang ?? 'zh')
  ipcMain.handle(IPC.languageSet, (_event, raw: unknown) => {
    const lang: Lang = parseLang(raw)
    saveAppConfig(deps.userDataDir, { lang })
    setShellLang(deps.appRoot, lang)
    log.info(`[language] 界面语言切换：${lang}`)
    // 广播全部窗口（控制条 + 各覆盖层）即时生效
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.languageChanged, lang)
      }
    })
    return lang
  })
  ipcMain.handle(IPC.exportRun, async (_event, project: EditProject) => {
    const tr = translator(currentShellLang())
    const defaultName: string = `${path.basename(project.sourceFilePath).replace(/\.mp4$/, '')}-edited.mp4`
    const dialogResult = await dialog.showSaveDialog({
      title: tr('editor.exportMp4'),
      defaultPath: defaultName,
      filters: [{ name: 'MP4', extensions: ['mp4'] }]
    })
    if (dialogResult.canceled || dialogResult.filePath === undefined || dialogResult.filePath.length === 0) {
      return { ok: false as const, error: tr('editor.exportCancelled') }
    }
    log.info(`[export] 开始导出：${String(project.segments.length)} 段 → ${dialogResult.filePath}`)
    const encoder = await warmUpEncoderProbe()
    const result = await runExport(deps.ffmpegPath, deps.ffprobePath, project, encoder, 30, dialogResult.filePath)
    if (result.ok) {
      log.info(`[export] 导出完成：${result.outputPath}`)
    } else {
      log.error(`[export] 导出失败：${result.error}`)
    }
    return result
  })
  ipcMain.handle(IPC.windowMinimize, () => {
    deps.setControlWindowVisible(false)
    return true
  })
  ipcMain.handle(IPC.windowClose, async () => {
    // 倒计时中退出：直接取消；录制中退出：先走完整收尾管线保存产物
    cancelArm()
    if (currentPhase() !== 'idle') {
      const stopResult = await stopRecording()
      if (!stopResult.ok) {
        log.error(`[window] 退出前停止录制失败：${stopResult.error}`)
      }
    }
    app.quit()
    return true
  })
  ipcMain.handle(IPC.recordArm, (_event, settings: RecordSettings) => armRecording(deps.appRoot, settings))
  ipcMain.handle(IPC.recordArmCancel, () => {
    cancelArm()
    return true
  })
  ipcMain.on(IPC.recordArmSnapshot, (_event, settings: RecordSettings) => updateArmSnapshot(settings))
  ipcMain.handle(IPC.outputDirGet, () => getOutputDirInfo())
  ipcMain.handle(IPC.outputDirChoose, async () => {
    const tr = translator(currentShellLang())
    const result = await dialog.showOpenDialog({
      title: tr('dialog.chooseOutputDir'),
      buttonLabel: tr('dialog.chooseOutputDirButton'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return undefined
    }
    const chosen = result.filePaths[0]
    if (chosen === undefined) {
      return undefined
    }
    log.info(`[settings] 输出目录更新：${chosen}`)
    return setCustomOutputDir(chosen)
  })
  ipcMain.handle(IPC.outputDirReset, () => {
    log.info('[settings] 输出目录已恢复默认')
    return setCustomOutputDir(undefined)
  })
}
