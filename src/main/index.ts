import { app, BrowserWindow, desktopCapturer, session } from 'electron'
import path from 'node:path'
import { resolveFfmpegPath } from '../recorder/ffmpeg/ffmpeg-path'
import { resolveFfprobePath } from '../recorder/ffmpeg/ffmpeg-path'
import { initLogging } from './log'
import { registerIpcHandlers } from './ipc'
import { currentPhase, initRecordController, setPhaseListener, setRecordErrorListener, setSessionFinalizedListener, warmUpEncoderProbe } from './record-controller'
import { handleSessionFinalized, initSubtitleService } from './services/subtitle-service'
import { resolveWhisperCliPath, resolveWhisperModelPath } from '../recorder/asr/whisper-path'
import { runArmFlow, runMediaProbeFlow, runRegionFlow, runSmokeAudioFlow, runSmokeFlow } from './flows/smoke'
import { runRegionVerboseFlow, runSpawnMatrixFlow, runWindowHoverFlow, runWindowProbeFlow } from './flows/diagnostics'
import { runManageFlow } from './flows/smoke-manage'
import { runI18nFlow } from './flows/smoke-i18n'
import { runSubtitleFlow } from './flows/smoke-subtitle'
import { runStoreShotsFlow } from './flows/screenshot'
import { createTray, disposeShell, handlePhaseForShell, primeHotkeys, registerGlobalShortcuts, setShellLang } from './shell'
import { registerAppProtocol, registerAppSchemePrivileges } from './media-protocol'
import { disposeWindowProbe } from '../recorder/window-rect'
import {
  broadcastRecordError,
  broadcastRecordPhase,
  closeOverlay,
  closeRegionFrameWindow,
  createControlWindow,
  createOverlayWindow,
  createRegionFrameWindow,
  getControlWindow,
  setControlWindowBounds,
  setControlWindowExpanded,
  setControlWindowSize,
  showControlWindow
} from './windows'
import { IPC } from '../shared/ipc-channels'
import type { RecordPhase } from '../shared/types'
import { DEFAULT_HOTKEYS } from '../core/hotkeys'
import { loadAppConfig } from '../recorder/app-settings'

const isSmokeMode: boolean =
  process.argv.includes('--smoke') ||
  process.argv.includes('--smoke-audio') ||
  process.argv.includes('--smoke-manage') ||
  process.argv.includes('--smoke-i18n') ||
  process.argv.includes('--smoke-subtitle') ||
  process.argv.includes('--make-store-shots')

/** 单实例锁：第二个实例直接退出，由首个实例唤起窗口。
 *  冒烟/诊断模式例外：绕过锁直接运行（本机常开着正式实例，自动化流程不应被静默吞掉）。 */
const isAutomationRun: boolean = process.argv.some((arg) =>
  arg.startsWith('--smoke') || arg === '--spawn-matrix' || arg === '--region-verbose' ||
  arg === '--window-probe' || arg === '--make-store-shots'
)
const gotInstanceLock: boolean = isAutomationRun || app.requestSingleInstanceLock()
if (!gotInstanceLock) {
  app.quit()
}

/**
 * getDisplayMedia 自动授权：渲染进程请求屏幕采集时直接返回主屏 + 系统声 loopback，
 * 不弹系统共享选择框（录制目标由应用自己的 UI 决定）。
 */
const registerDisplayMediaHandler = (): void => {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        const first = sources[0]
        if (first === undefined) {
          callback({})
          return
        }
        callback({ video: first, audio: 'loopback' })
      })
      .catch(() => {
        callback({})
      })
  })
}

if (gotInstanceLock) {
  /** 注册 app:// 协议特权（必须在 app ready 之前；页面/静态资源/媒体流都走它） */
  registerAppSchemePrivileges()

  /** 再次启动：唤起已有实例的控制条 */
  app.on('second-instance', () => {
    showControlWindow(true)
  })

  /** 录制阶段变化 → 广播 UI + 联动托盘；录制结束回显控制条并收起区域描边 */
  setPhaseListener((phase: RecordPhase) => {
    broadcastRecordPhase(phase)
    handlePhaseForShell(app.getAppPath(), phase)
    if (phase === 'idle') {
      closeRegionFrameWindow()
      showControlWindow(true)
    }
  })

  /** 录制致命错误 → 广播到控制条窗口 */
  setRecordErrorListener((message: string) => {
    broadcastRecordError(message)
  })

  app.whenReady().then(() => {
    initLogging(app)
    registerAppProtocol(path.join(import.meta.dirname, '../renderer'))
    registerDisplayMediaHandler()

    const appRoot: string = app.getAppPath()
    const ffmpegPath: string = resolveFfmpegPath(appRoot, app.isPackaged)
    const ffprobePath: string = resolveFfprobePath(appRoot, app.isPackaged)
    const userDataDir: string = app.getPath('userData')
    // 启动时应用持久化配置：自定义快捷键（未配置用默认 F10/F11）与界面语言（默认中文）
    const bootConfig = loadAppConfig(userDataDir)
    primeHotkeys(bootConfig.hotkeys ?? DEFAULT_HOTKEYS)
    setShellLang(appRoot, bootConfig.lang ?? 'zh')
    initRecordController({
      appRoot,
      ffmpegPath,
      smokeMode: isSmokeMode,
      isPackaged: app.isPackaged,
      userDataDir
    })

    // 字幕识别服务：whisper 二进制/模型缺失时优雅降级（不影响录制）
    const whisperCliPath: string = resolveWhisperCliPath(appRoot, app.isPackaged)
    const whisperModelPath: string = resolveWhisperModelPath(appRoot, app.isPackaged)
    initSubtitleService({
      ffmpegPath,
      ffprobePath,
      whisperCliPath,
      whisperModelPath,
      broadcastProgress: (event) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC.subtitleProgress, event)
          }
        }
      }
    })
    // 会话收尾 → 自动字幕识别（开麦克风且资源齐备时后台执行）
    setSessionFinalizedListener(handleSessionFinalized)

    registerIpcHandlers({
      getControlWindow,
      openOverlay: () => createOverlayWindow('region'),
      openWindowPickerOverlay: () => createOverlayWindow('window'),
      closeOverlay,
      showRegionFrame: (region) => createRegionFrameWindow(region, region),
      closeRegionFrame: closeRegionFrameWindow,
      setControlWindowExpanded,
      setControlWindowVisible: showControlWindow,
      setControlWindowSize,
      setControlWindowBounds,
      appRoot,
      ffmpegPath,
      ffprobePath,
      userDataDir
    })
    createControlWindow()
    createTray(appRoot)
    registerGlobalShortcuts(appRoot)
    void warmUpEncoderProbe().then((encoder) => {
      getControlWindow()?.webContents.send(IPC.appLog, {
        level: 'info',
        message: `编码器探测完成：${encoder}`
      })
    })

    if (process.argv.includes('--spawn-matrix')) {
      void runSpawnMatrixFlow(ffmpegPath)
    } else if (process.argv.includes('--region-verbose')) {
      void runRegionVerboseFlow(ffmpegPath)
    } else if (process.argv.includes('--window-probe')) {
      void runWindowProbeFlow()
    } else if (process.argv.includes('--make-store-shots')) {
      void runStoreShotsFlow(appRoot)
    } else if (process.argv.includes('--smoke-window-hover')) {
      void runWindowHoverFlow()
    } else if (process.argv.includes('--smoke-arm')) {
      void runArmFlow(appRoot)
    } else if (process.argv.includes('--smoke-media')) {
      void runMediaProbeFlow()
    } else if (process.argv.includes('--smoke-region')) {
      void runRegionFlow()
    } else if (process.argv.includes('--smoke-manage')) {
      void runManageFlow()
    } else if (process.argv.includes('--smoke-i18n')) {
      void runI18nFlow()
    } else if (process.argv.includes('--smoke-subtitle')) {
      void runSubtitleFlow(ffmpegPath, ffprobePath)
    } else if (process.argv.includes('--smoke-audio')) {
      void runSmokeAudioFlow()
    } else if (isSmokeMode) {
      void runSmokeFlow()
    }
  })
}

app.on('will-quit', () => {
  disposeShell()
  disposeWindowProbe()
})

app.on('window-all-closed', () => {
  // 托盘常驻：关闭窗口不退出应用，由托盘菜单/关闭按钮显式退出
})
