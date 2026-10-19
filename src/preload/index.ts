import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { RecordingApi } from '../shared/api'
import { IPC } from '../shared/ipc-channels'
import type { EditProject, HotkeyConfig, LogMessage, RecordPhase, RecordSettings, RegionRect, WindowProbe } from '../shared/types'
import type { Lang } from '../shared/strings'

/**
 * 以类型安全方式实现渲染进程 API 契约，并注入 window.api。
 * 暴露面最小化：只暴露白名单函数，不泄漏 ipcRenderer 原始对象。
 */
const api: RecordingApi = {
  listDisplays: () => ipcRenderer.invoke(IPC.listDisplays),
  startRecording: (settings: RecordSettings) => ipcRenderer.invoke(IPC.recordStart, settings),
  pauseRecording: () => ipcRenderer.invoke(IPC.recordPause),
  resumeRecording: () => ipcRenderer.invoke(IPC.recordResume),
  stopRecording: () => ipcRenderer.invoke(IPC.recordStop),
  sendAudioChunk: (pcmBuffer: ArrayBuffer) => ipcRenderer.send(IPC.audioChunk, pcmBuffer),
  log: (message: LogMessage) => ipcRenderer.send(IPC.appLog, message),
  openRegionPicker: async () => {
    await ipcRenderer.invoke(IPC.regionPickerOpen)
  },
  sendRegionSelected: (region: RegionRect) => ipcRenderer.send(IPC.regionSelected, region),
  cancelRegionPicker: () => ipcRenderer.send(IPC.regionCancel),
  onRegionSelected: (handler: (region: RegionRect) => void) =>
    subscribe(IPC.regionSelected, handler),
  onRecordPhase: (handler: (phase: RecordPhase) => void) =>
    subscribe<RecordPhase>(IPC.recordPhase, handler),
  onRecordError: (handler: (message: string) => void) =>
    subscribe<string>(IPC.recordError, handler),
  expandControlWindow: async (expanded: boolean) => {
    await ipcRenderer.invoke(IPC.windowExpand, expanded)
  },
  minimizeToTray: async () => {
    await ipcRenderer.invoke(IPC.windowMinimize)
  },
  closeApplication: async () => {
    await ipcRenderer.invoke(IPC.windowClose)
  },
  armRecording: (settings: RecordSettings) => ipcRenderer.invoke(IPC.recordArm, settings),
  cancelArm: async () => {
    await ipcRenderer.invoke(IPC.recordArmCancel)
  },
  syncArmSettings: (settings: RecordSettings) => ipcRenderer.send(IPC.recordArmSnapshot, settings),
  onCountdown: (handler: (seconds: number) => void) =>
    subscribe<number>(IPC.recordCountdown, handler),
  getOutputDir: () => ipcRenderer.invoke(IPC.outputDirGet),
  chooseOutputDir: () => ipcRenderer.invoke(IPC.outputDirChoose),
  resetOutputDir: () => ipcRenderer.invoke(IPC.outputDirReset),
  resizeControlWindow: async (width: number, height: number) => {
    await ipcRenderer.invoke(IPC.windowResize, width, height)
  },
  listRecordings: () => ipcRenderer.invoke(IPC.recordingsList),
  deleteRecordingFiles: (dirPaths: readonly string[]) =>
    ipcRenderer.invoke(IPC.recordingsDeleteFiles, dirPaths),
  hideRecordingRecords: (dirPaths: readonly string[]) =>
    ipcRenderer.invoke(IPC.recordingsHideRecords, dirPaths),
  exportEdited: (project: EditProject) => ipcRenderer.invoke(IPC.exportRun, project),
  setWindowBounds: async (bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }) => {
    await ipcRenderer.invoke(IPC.windowSetBounds, bounds)
  },
  getHotkeys: () => ipcRenderer.invoke(IPC.hotkeysGet),
  updateHotkeys: (config: HotkeyConfig) => ipcRenderer.invoke(IPC.hotkeysUpdate, config),
  closeRegionFrame: () => ipcRenderer.send(IPC.regionFrameClose),
  openWindowPicker: async () => {
    await ipcRenderer.invoke(IPC.windowPickerOpen)
  },
  probeWindowAtCursor: () => ipcRenderer.invoke(IPC.windowHoverProbe) as Promise<WindowProbe | undefined>,
  pickWindowAtCursor: () => ipcRenderer.invoke(IPC.windowPick) as Promise<WindowProbe | undefined>,
  cancelWindowPicker: () => ipcRenderer.send(IPC.windowPickerCancel),
  onWindowSelected: (handler: (probe: WindowProbe) => void) =>
    subscribe<WindowProbe>(IPC.windowSelected, handler),
  getLanguage: () => ipcRenderer.invoke(IPC.languageGet) as Promise<Lang>,
  setLanguage: (lang: Lang) => ipcRenderer.invoke(IPC.languageSet, lang) as Promise<Lang>,
  onLanguageChanged: (handler: (lang: Lang) => void) =>
    subscribe<Lang>(IPC.languageChanged, handler)
}

/** 通用事件订阅：包装监听器并返回取消函数 */
const subscribe = <T,>(channel: string, handler: (payload: T) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, payload: T): void => {
    handler(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
