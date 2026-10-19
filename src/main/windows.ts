import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { IPC } from '../shared/ipc-channels'

/** preload 脚本（electron-vite ESM 构建输出为 .mjs） */
const PRELOAD_PATH: string = path.join(import.meta.dirname, '../preload/index.mjs')

/** 按运行环境加载渲染页面：dev 走 electron-vite dev server，prod 走 app:// 自定义协议（file:// 下 worklet/fetch 不可用） */
const loadRenderer = (win: BrowserWindow, hash: string): void => {
  const devUrl: string | undefined = process.env['ELECTRON_RENDERER_URL']
  if (devUrl !== undefined) {
    void win.loadURL(`${devUrl}/${hash}`)
    return
  }
  void win.loadURL(`app://bundle/index.html#${hash}`)
}

/** 按运行环境加载产物根的静态页面（如 beacon.html；不带 hash 路由） */
const loadStaticPage = (win: BrowserWindow, page: string): void => {
  const devUrl: string | undefined = process.env['ELECTRON_RENDERER_URL']
  if (devUrl !== undefined) {
    void win.loadURL(`${devUrl}/${page}`)
    return
  }
  void win.loadURL(`app://bundle/${page}`)
}

let controlWindow: BrowserWindow | undefined
let overlayWindow: BrowserWindow | undefined
let countdownWindow: BrowserWindow | undefined
let regionFrameWindow: BrowserWindow | undefined

/** 创建录制控制悬浮条窗口（置顶、无边框、透明背景——圆角外无白边） */
export const createControlWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 360,
    height: 84,
    frame: false,
    transparent: true,
    resizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  // 屏幕捕获保护（WDA_EXCLUDEFROMCAPTURE）：悬浮条对用户可见，但不会被桌面复制捕获录进视频
  win.setContentProtection(true)
  win.on('ready-to-show', () => win.show())
  loadRenderer(win, '/')
  controlWindow = win
  win.on('closed', () => {
    controlWindow = undefined
  })
  return win
}

/** 获取当前控制条窗口（可能已关闭） */
export const getControlWindow = (): BrowserWindow | undefined => controlWindow

/** 自家全部窗口句柄（十进制字符串）：窗口捕获探查时排除，避免选中自己的覆盖层 */
export const ownWindowHandles = (): readonly string[] => {
  const handles: string[] = []
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) {
      continue
    }
    const buffer = win.getNativeWindowHandle()
    if (buffer.length >= 8) {
      handles.push(buffer.readBigUInt64LE(0).toString())
    } else if (buffer.length >= 4) {
      handles.push(String(buffer.readUInt32LE(0)))
    }
  }
  return handles
}

/** 创建全屏透明覆盖层窗口（区域选区 / 窗口捕获选择共用，仅覆盖主显示器） */
export const createOverlayWindow = (view: 'region' | 'window'): void => {
  closeOverlay()
  const { workArea, scaleFactor } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.moveTop()
  win.on('closed', () => {
    overlayWindow = undefined
  })
  // 缩放比传给覆盖层组件，用于物理/逻辑像素换算
  loadRenderer(win, `/${view}?scale=${String(scaleFactor)}`)
  overlayWindow = win
}

/** 获取当前覆盖层窗口（选区/窗口选择共用；可能不存在） */
export const getOverlayWindow = (): BrowserWindow | undefined => overlayWindow

/** 关闭选区覆盖层（幂等） */
export const closeOverlay = (): void => {
  const win = overlayWindow
  overlayWindow = undefined
  if (win !== undefined && !win.isDestroyed()) {
    win.close()
  }
}

/** 展开/收起控制条窗口（设置面板开合） */
export const setControlWindowExpanded = (expanded: boolean): void => {
  const win = controlWindow
  if (win !== undefined && !win.isDestroyed()) {
    win.setContentSize(360, expanded ? 520 : 84)
  }
}

/** 通用窗口尺寸调整（视图切换：列表/编辑器） */
export const setControlWindowSize = (width: number, height: number): void => {
  const win = controlWindow
  if (win !== undefined && !win.isDestroyed()) {
    win.setContentSize(width, height)
  }
}

/** 手动设置窗口位置与尺寸（四角拖拽缩放，左/上角拖动需同步移动窗口） */
export const setControlWindowBounds = (bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): void => {
  const win = controlWindow
  if (win !== undefined && !win.isDestroyed()) {
    win.setBounds({ ...bounds }, false)
  }
}

/** 创建倒计时覆盖层：全屏透明置顶、点击穿透、不抢焦点，仅显示 3-2-1 大数字 */
export const createCountdownWindow = (): void => {
  closeCountdownWindow()
  const { workArea } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: false
    }
  })
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  // 倒计时数字绝不能被录进视频（开录瞬间的时序竞隙兜底）
  win.setContentProtection(true)
  win.on('ready-to-show', () => win.showInactive())
  win.on('closed', () => {
    countdownWindow = undefined
  })
  loadRenderer(win, '/countdown')
  countdownWindow = win
}

/** 关闭倒计时覆盖层（幂等） */
export const closeCountdownWindow = (): void => {
  const win = countdownWindow
  countdownWindow = undefined
  if (win !== undefined && !win.isDestroyed()) {
    win.close()
  }
}

/** 倒计时覆盖层是否存在 */
export const hasCountdownWindow = (): boolean =>
  countdownWindow !== undefined && !countdownWindow.isDestroyed()

/** 逻辑像素矩形（相对主显示器工作区，用于区域指示覆盖层渲染） */
export type LogicalRegion = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * 创建「录制区域红色描边」覆盖层：全屏透明、点击穿透、置顶，
 * 物理像素区域换算为逻辑像素后经 hash 传给渲染层描边。
 * 物理分辨率（pw/ph）同时传递用于角标展示。
 */
export const createRegionFrameWindow = (physicalRegion: LogicalRegion, physicalSize: LogicalRegion): void => {
  closeRegionFrameWindow()
  const { workArea, scaleFactor } = screen.getPrimaryDisplay()
  const toLogical = (value: number): number => Math.round(value / scaleFactor)
  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: false
    }
  })
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  // 核心需求：红框对用户可见（提示录制区域），但通过 WDA_EXCLUDEFROMCAPTURE
  // 从桌面复制捕获中完全排除——录出的视频只有区域内容，绝无红线描边。
  win.setContentProtection(true)
  win.on('ready-to-show', () => win.showInactive())
  win.on('closed', () => {
    regionFrameWindow = undefined
  })
  const query = [
    `x=${String(toLogical(physicalRegion.x))}`,
    `y=${String(toLogical(physicalRegion.y))}`,
    `w=${String(toLogical(physicalRegion.width))}`,
    `h=${String(toLogical(physicalRegion.height))}`,
    `pw=${String(Math.round(physicalSize.width))}`,
    `ph=${String(Math.round(physicalSize.height))}`
  ].join('&')
  loadRenderer(win, `/region-frame?${query}`)
  regionFrameWindow = win
}

/** 关闭区域描边覆盖层（幂等） */
export const closeRegionFrameWindow = (): void => {
  const win = regionFrameWindow
  regionFrameWindow = undefined
  if (win !== undefined && !win.isDestroyed()) {
    win.close()
  }
}

let beaconWindow: BrowserWindow | undefined

/**
 * 捕获活性信标（冒烟专用）：在指定逻辑区域内显示持续变化的动画。
 * ddagrab 是脏区驱动——区域内画面完全静止时 DXGI 不产出帧（真实用户有鼠标/操作，
 * 不会遇到）；自动化冒烟用信标制造画面变化，以验证捕获管线。
 * 页面走 app://bundle/beacon.html（data: 顶层加载在打包态 sandbox 下不可靠）。
 */
export const createCaptureBeacon = (logicalX: number, logicalY: number, width: number, height: number): void => {
  closeCaptureBeacon()
  const win = new BrowserWindow({
    x: logicalX,
    y: logicalY,
    width,
    height,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: false,
    webPreferences: { sandbox: true }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.on('ready-to-show', () => win.showInactive())
  win.on('closed', () => {
    beaconWindow = undefined
  })
  loadStaticPage(win, 'beacon.html')
  beaconWindow = win
}

/** 关闭捕获信标（幂等） */
export const closeCaptureBeacon = (): void => {
  const win = beaconWindow
  beaconWindow = undefined
  if (win !== undefined && !win.isDestroyed()) {
    win.close()
  }
}

/** 向控制条窗口广播录制阶段变化（阶段由 record-controller 推送） */
export const broadcastRecordPhase = (phase: string): void => {
  const win = controlWindow
  if (win !== undefined && !win.isDestroyed()) {
    win.webContents.send(IPC.recordPhase, phase)
  }
}

/** 向控制条窗口广播录制错误（如编码进程意外退出） */
export const broadcastRecordError = (message: string): void => {
  const win = controlWindow
  if (win !== undefined && !win.isDestroyed()) {
    win.webContents.send(IPC.recordError, message)
  }
}

/** 向倒计时覆盖层广播当前秒数 */
export const broadcastCountdown = (seconds: number): void => {
  const win = countdownWindow
  if (win !== undefined && !win.isDestroyed()) {
    win.webContents.send(IPC.recordCountdown, seconds)
  }
}

/** 显示/隐藏控制条窗口（托盘恢复、录制结束后回显） */
export const showControlWindow = (visible: boolean): void => {
  const win = controlWindow
  if (win === undefined || win.isDestroyed()) {
    return
  }
  if (visible) {
    win.show()
    win.focus()
  } else {
    win.hide()
  }
}
