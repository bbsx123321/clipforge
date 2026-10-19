import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { DisplayInfo, HotkeyConfig, OutputDirInfo, RecordPhase, RecordMode, RecordingSummary, RecordSettings } from '../../shared/types'
import { translator, type Lang } from '../../shared/strings'
import { DEFAULT_HOTKEYS } from '../../core/hotkeys'
import {
  checkWorkletAvailability,
  startAudioCapture,
  type AudioCaptureHandle,
  type AudioCaptureResult
} from './audio/capture'
import { useT } from './i18n'
import { SettingsPanel } from './components/SettingsPanel'
import { RecordingsList } from './components/RecordingsList'
import { ResizableFrame } from './components/ResizableFrame'
import { EditorView } from './components/editor/EditorView'
import { IconClose, IconMinus, IconPause, IconPlay, IconSettings, IconStop } from './components/icons'
import { DRAG_STYLE, NO_DRAG_STYLE } from './drag-style'
import { BTN, NOTICE_CLS } from './ui'

/** 毫秒 → mm:ss（纯函数） */
export const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** 当前录制模式的展示文案（纯函数，双语） */
export const modeLabel = (mode: RecordMode, lang: Lang): string => {
  const tr = translator(lang)
  if (mode.kind === 'fullscreen') {
    return tr('mode.fullscreen', { n: mode.outputIndex + 1 })
  }
  if (mode.kind === 'window') {
    return tr('mode.window', { w: mode.region.width, h: mode.region.height })
  }
  return tr('mode.region', { w: mode.region.width, h: mode.region.height })
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const DEFAULT_SETTINGS: RecordSettings = {
  mode: { kind: 'fullscreen', outputIndex: 0 },
  framerate: 30,
  captureSystemAudio: true,
  captureMicrophone: false
}

const ICON_CLS = 'h-3.5 w-3.5'

export const App = (): JSX.Element => {
  const { t, lang } = useT()
  const [phase, setPhase] = useState<RecordPhase>('idle')
  const [elapsedMs, setElapsedMs] = useState<number>(0)
  const [settings, setSettings] = useState<RecordSettings>(DEFAULT_SETTINGS)
  const [displays, setDisplays] = useState<readonly DisplayInfo[]>([])
  const [expanded, setExpanded] = useState<boolean>(false)
  const [notice, setNotice] = useState<string>('')
  const [outputDir, setOutputDir] = useState<OutputDirInfo | undefined>(undefined)
  const [armed, setArmed] = useState<boolean>(false)
  const [recordings, setRecordings] = useState<readonly RecordingSummary[]>([])
  const [editing, setEditing] = useState<RecordingSummary | undefined>(undefined)
  const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT_HOTKEYS)
  const audioHandleRef = useRef<AudioCaptureHandle | undefined>(undefined)
  const accumulatedRef = useRef<number>(0)
  const resumeAtRef = useRef<number>(0)

  // 订阅主进程录制阶段广播（状态唯一来源是主进程状态机）
  useEffect(() => {
    const unsubscribe = window.api.onRecordPhase((next) => setPhase(next))
    return unsubscribe
  }, [])

  // 启动自检：worklet 模块可加载性（问题早暴露到日志，而不是等到点「开始」才失败）
  useEffect(() => {
    void checkWorkletAvailability()
      .then(() => window.api.log({ level: 'info', message: '音频模块自检通过' }))
      .catch((error: unknown) => {
        window.api.log({ level: 'error', message: `音频模块自检失败：${toErrorMessage(error)}` })
      })
  }, [])

  // 订阅录制致命错误（如编码进程意外退出），立即在悬浮条上提示
  useEffect(() => {
    const unsubscribe = window.api.onRecordError((message) => {
      setNotice(message)
      setArmed(false)
      void releaseAudio()
    })
    return unsubscribe
  }, [])

  // 阶段回到 recording（倒计时结束自动开录）或 idle（取消）时复位待录态
  useEffect(() => {
    if (phase === 'recording' || phase === 'idle') {
      setArmed(false)
    }
  }, [phase])

  // phase → recording（含倒计时结束自动开录）：立即启动音频采集，与视频起点对齐
  useEffect(() => {
    if (phase !== 'recording' || audioHandleRef.current !== undefined) {
      return
    }
    const wantAudio: boolean = settings.captureSystemAudio || settings.captureMicrophone
    if (!wantAudio) {
      return
    }
    void (async () => {
      try {
        const result: AudioCaptureResult = await startAudioCapture({
          systemAudio: settings.captureSystemAudio,
          microphone: settings.captureMicrophone,
          onChunk: (chunk) => window.api.sendAudioChunk(chunk)
        })
        audioHandleRef.current = result.handle
        if (result.warnings.length > 0) {
          window.api.log({ level: 'warn', message: result.warnings.join('；') })
        }
      } catch (error) {
        window.api.log({ level: 'error', message: `音频采集失败，本次仅录视频：${toErrorMessage(error)}` })
      }
    })()
  }, [phase, settings])

  // 设置变化即上报主进程（F10 快捷键入口开录时使用最新设置）
  useEffect(() => {
    window.api.syncArmSettings(settings)
  }, [settings])

  // 订阅区域选区结果：覆盖层确认后写入录制模式（UI 重构时曾丢失此订阅导致框选失效）
  useEffect(() => {
    const unsubscribe = window.api.onRegionSelected((region) => {
      setSettings((prev) => ({
        ...prev,
        mode: { kind: 'region', outputIndex: prev.mode.outputIndex, region }
      }))
    })
    return unsubscribe
  }, [])

  // 订阅窗口捕获结果：写入窗口录制模式（rect 已是所属显示器内物理坐标）
  useEffect(() => {
    const unsubscribe = window.api.onWindowSelected((probe) => {
      setSettings((prev) => ({
        ...prev,
        mode: {
          kind: 'window',
          outputIndex: probe.outputIndex,
          region: probe.rect,
          title: probe.title
        }
      }))
    })
    return unsubscribe
  }, [])

  // 初始加载显示器列表，默认选主显示器；语言切换后重拉（label 随语言变化）
  useEffect(() => {
    void window.api
      .listDisplays()
      .then((list) => {
        setDisplays(list)
        const primary = list.find((display) => display.isPrimary) ?? list[0]
        if (primary !== undefined) {
          setSettings((prev) => {
            // 已手动选择过录制目标（区域/窗口/其他显示器）时不覆盖
            if (prev.mode.kind !== 'fullscreen') {
              return prev
            }
            return { ...prev, mode: { kind: 'fullscreen', outputIndex: primary.outputIndex } }
          })
        }
      })
      .catch((error: unknown) => {
        window.api.log({ level: 'error', message: `显示器枚举失败：${toErrorMessage(error)}` })
      })
  }, [lang])

  // 计时：recording 推进；暂停/停止冻结；新会话清零
  useEffect(() => {
    if (phase === 'recording') {
      resumeAtRef.current = Date.now()
      const timer = window.setInterval(() => {
        setElapsedMs(accumulatedRef.current + (Date.now() - resumeAtRef.current))
      }, 200)
      return () => {
        window.clearInterval(timer)
        accumulatedRef.current += Date.now() - resumeAtRef.current
      }
    }
    if (phase === 'idle') {
      accumulatedRef.current = 0
      setElapsedMs(0)
    }
    return undefined
  }, [phase])

  // 加载当前输出目录
  useEffect(() => {
    void window.api
      .getOutputDir()
      .then(setOutputDir)
      .catch((error: unknown) => {
        window.api.log({ level: 'error', message: `输出目录读取失败：${toErrorMessage(error)}` })
      })
  }, [])

  // 加载当前生效的快捷键配置
  useEffect(() => {
    void window.api
      .getHotkeys()
      .then(setHotkeys)
      .catch(() => undefined)
  }, [])

  /** 更新快捷键：冲突预检 → 注册（失败回滚由主进程完成）→ 持久化 */
  const updateHotkey = (which: 'record' | 'pause', accelerator: string): void => {
    const next: HotkeyConfig = which === 'record' ? { ...hotkeys, record: accelerator } : { ...hotkeys, pause: accelerator }
    if (next.record === next.pause) {
      setNotice(t('notice.hotkeySame'))
      return
    }
    void window.api.updateHotkeys(next).then((applied) => {
      if (applied) {
        setHotkeys(next)
        setNotice('')
      } else {
        setNotice(t('notice.hotkeyRegisterFail'))
      }
    })
  }

  /** 刷新最近录制列表 */
  const loadRecordings = (): void => {
    void window.api
      .listRecordings()
      .then(setRecordings)
      .catch((error: unknown) => {
        window.api.log({ level: 'error', message: `录制列表读取失败：${toErrorMessage(error)}` })
      })
  }

  // 启动即加载；录制结束（回 idle）后刷新
  useEffect(() => {
    loadRecordings()
  }, [])
  useEffect(() => {
    if (phase === 'idle') {
      loadRecordings()
    }
  }, [phase])

  // 窗口尺寸随视图切换：编辑器大窗 / 设置展开 / 有录制列表 / 基础悬浮条
  useEffect(() => {
    if (editing !== undefined) {
      void window.api.resizeControlWindow(840, 660)
      return
    }
    if (expanded) {
      void window.api.resizeControlWindow(360, 560)
      return
    }
    void window.api.resizeControlWindow(360, recordings.length > 0 ? 250 : 84)
  }, [editing, expanded, recordings.length])

  /** 释放音频采集（等待尾部音频块派发完成） */
  const releaseAudio = async (): Promise<void> => {
    const handle = audioHandleRef.current
    audioHandleRef.current = undefined
    await handle?.stop()
  }

  /** 点「开始」：进入待录状态并开始 3 秒倒计时（倒计时结束由主进程自动开录并最小化到托盘） */
  const handleArm = (): void => {
    setNotice('')
    setExpanded(false)
    void window.api.expandControlWindow(false)
    void window.api.armRecording(settings).then((result) => {
      if (result.ok) {
        setArmed(true)
      } else {
        setNotice(result.error)
      }
    })
  }

  /** 倒计时取消（未开录） */
  const handleCancelArm = (): void => {
    setArmed(false)
    void window.api.cancelArm()
  }

  /** 弹出目录选择框并同步展示 */
  const chooseOutputDir = (): void => {
    void window.api
      .chooseOutputDir()
      .then((info) => {
        if (info !== undefined) {
          setOutputDir(info)
          setNotice('')
        }
      })
      .catch((error: unknown) => {
        setNotice(t('notice.outputDirFail', { msg: toErrorMessage(error) }))
      })
  }

  /** 恢复默认输出目录 */
  const resetOutputDir = (): void => {
    void window.api
      .resetOutputDir()
      .then(setOutputDir)
      .catch((error: unknown) => {
        setNotice(t('notice.outputDirResetFail', { msg: toErrorMessage(error) }))
      })
  }

  const handlePause = (): void => {
    void window.api.pauseRecording().catch((error: unknown) => {
      setNotice(t('notice.pauseFail', { msg: toErrorMessage(error) }))
    })
  }

  const handleResume = (): void => {
    void window.api.resumeRecording().catch((error: unknown) => {
      setNotice(t('notice.resumeFail', { msg: toErrorMessage(error) }))
    })
  }

  const handleStop = (): void => {
    void (async () => {
      await releaseAudio()
      const result = await window.api.stopRecording()
      if (!result.ok) {
        setNotice(result.error)
        return
      }
      setNotice(
        result.warnings.length > 0
          ? t('notice.savedWithWarnings', { warnings: result.warnings.join('；'), path: result.outputDir })
          : t('notice.saved', { path: result.outputDir })
      )
    })()
  }

  const toggleSettings = (): void => {
    const next: boolean = !expanded
    setExpanded(next)
    void window.api.expandControlWindow(next)
  }

  // 编辑器视图：整窗替换为播放器 + 剪辑工具（四角可拖拽缩放）
  if (editing !== undefined) {
    return (
      <div className="h-full w-full p-1">
        <ResizableFrame minWidth={560} minHeight={420}>
          <EditorView summary={editing} onClose={() => setEditing(undefined)} />
        </ResizableFrame>
      </div>
    )
  }

  const statusDot: string =
    phase === 'recording'
      ? 'recording-breathe bg-red-500'
      : phase === 'paused'
        ? 'bg-amber-400'
        : armed
          ? 'animate-pulse bg-amber-400'
          : 'bg-neutral-600'

  return (
    <div className="h-full w-full p-1">
      <ResizableFrame minWidth={360} minHeight={84}>
      <div
        className="flex h-full flex-col overflow-hidden rounded-2xl bg-neutral-900/90 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
        style={DRAG_STYLE}
      >
        {/* 主控制行 */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <span className={`h-3 w-3 shrink-0 rounded-full ${statusDot}`} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span
              className={`font-mono text-[15px] font-semibold tabular-nums ${
                phase === 'idle' && !armed ? 'text-neutral-500' : 'text-neutral-50'
              }`}
            >
              {armed ? t('bar.startingSoon') : formatElapsed(elapsedMs)}
            </span>
            <span className="truncate text-[10px] text-neutral-500">{modeLabel(settings.mode, lang)}</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5" style={NO_DRAG_STYLE}>
            {phase === 'idle' ? (
              armed ? (
                <button className={BTN.idle} onClick={handleCancelArm}>
                  {t('common.cancel')}
                </button>
              ) : (
                <button className={BTN.danger} onClick={handleArm}>
                  <IconPlay className="h-3 w-3" />
                  {t('common.start')}
                </button>
              )
            ) : (
              <>
                {phase === 'recording' ? (
                  <button className={BTN.idle} onClick={handlePause} title={t('common.pause')}>
                    <IconPause className={ICON_CLS} />
                  </button>
                ) : (
                  <button className={BTN.idle} onClick={handleResume} title={t('common.resume')}>
                    <IconPlay className={ICON_CLS} />
                  </button>
                )}
                <button className={BTN.light} onClick={handleStop} title={t('common.stop')}>
                  <IconStop className="h-3 w-3" />
                  {t('common.stop')}
                </button>
              </>
            )}
            <span className="mx-0.5 h-4 w-px bg-white/10" />
            <button
              className={`${expanded ? 'text-cyan-300' : ''} ${BTN.ghost} h-7 w-7 !px-0`}
              onClick={toggleSettings}
              title={t('bar.settingsTitle')}
            >
              <IconSettings className={ICON_CLS} />
            </button>
            <button className={`${BTN.win} !h-7 !w-7`} onClick={() => void window.api.minimizeToTray()} title={t('bar.minimizeTitle')}>
              <IconMinus className="h-3 w-3" />
            </button>
            <button
              className={BTN.winClose}
              onClick={() => void window.api.closeApplication()}
              title={phase === 'idle' ? t('bar.quitTitle') : t('bar.quitRecordingTitle')}
            >
              <IconClose className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* 提示条 */}
        {notice.length > 0 && (
          <div className="px-3.5 pb-2" style={NO_DRAG_STYLE}>
            <div className={NOTICE_CLS}>
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              {notice}
            </div>
          </div>
        )}

        {/* 设置面板 */}
        {expanded && (
          <div className="border-t border-white/10 px-3.5 py-3" style={NO_DRAG_STYLE}>
            <SettingsPanel
              displays={displays}
              settings={settings}
              onSettingsChange={setSettings}
              outputDir={outputDir}
              onChooseOutputDir={chooseOutputDir}
              onResetOutputDir={resetOutputDir}
              hotkeys={hotkeys}
              onUpdateHotkey={updateHotkey}
            />
          </div>
        )}

        {/* 最近录制：弹性填充窗口剩余高度，随窗口缩放 */}
        {recordings.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-white/10" style={NO_DRAG_STYLE}>
            <RecordingsList
              recordings={recordings}
              onOpen={(summary) => setEditing(summary)}
              onRefresh={loadRecordings}
              onBeforeManage={() => setEditing(undefined)}
            />
          </div>
        )}
      </div>
      </ResizableFrame>
    </div>
  )
}
