import { spawn, type ChildProcess } from 'node:child_process'

/**
 * Win32 窗口查询辅助（PowerShell 常驻进程 + P/Invoke）：
 * 光标坐标 → 按 Z 序自顶向下找第一个「可见 + 包含该点 + 非排除句柄 + 非桌面/任务栏」的
 * 顶层窗口 → DWM 可见边界（排除阴影投影）+ 标题 + 句柄。
 * 关键：调用方传入自家应用的全部窗口句柄（选择覆盖层本身在最顶层，必须排除，
 * 否则探查永远命中自己导致「全屏捕获」）；桌面窗口（Progman/WorkerW）按类名排除。
 * 坐标均为物理像素（进程已 SetProcessDPIAware）。
 */

/** 一次探查的结果（hwnd 为十进制字符串，便于跨协议比较） */
export type WindowProbeResult = {
  readonly hwnd: string
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly title: string
} | undefined

/**
 * PS 辅助脚本路径：开发态取 appRoot/resources，打包态取 process.resourcesPath。
 * 用 -File 方式启动（内联 -Command 在部分环境下编码/转义不稳定，-File 实测可靠）。
 */
const resolveProbeScript = (): string => {
  const { app } = require('electron') as typeof import('electron')
  const devPath = require('node:path').join(app.getAppPath(), 'resources', 'scripts', 'window-probe.ps1')
  if (require('node:fs').existsSync(devPath)) {
    return devPath
  }
  return require('node:path').join(process.resourcesPath, 'scripts', 'window-probe.ps1')
}

let probeProcess: ChildProcess | undefined
let pending: ((line: string) => void) | undefined
let lineBuffer: string = ''
let readyResolvers: ((ready: boolean) => void)[] = []
/** 进程已就绪标志：ready 只发一次，预热可能提前消耗，后续查询凭标志直接放行 */
let processReady: boolean = false

/** 等待辅助进程就绪（首次 Add-Type 编译 2~3 秒）；已就绪立即返回；进程死亡返回 false */
const waitReady = (timeoutMs: number): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    if (processReady) {
      resolve(true)
      return
    }
    if (probeProcess === undefined) {
      resolve(false)
      return
    }
    const timer = setTimeout(() => {
      readyResolvers = readyResolvers.filter((fn) => fn !== finish)
      resolve(false)
    }, timeoutMs)
    const finish = (ready: boolean): void => {
      clearTimeout(timer)
      resolve(ready)
    }
    readyResolvers.push(finish)
  })

/** 确保辅助进程在运行（懒启动） */
const ensureProcess = (): ChildProcess | undefined => {
  if (probeProcess !== undefined && probeProcess.exitCode === null) {
    return probeProcess
  }
  const child = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', resolveProbeScript()
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  child.stdout.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString('utf8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length === 0) {
        continue
      }
      if (trimmed === 'ready') {
        processReady = true
        const resolvers = readyResolvers
        readyResolvers = []
        for (const fn of resolvers) {
          fn(true)
        }
        continue
      }
      pending?.(trimmed)
      pending = undefined
    }
  })
  child.on('close', () => {
    probeProcess = undefined
    processReady = false
    const resolvers = readyResolvers
    readyResolvers = []
    for (const fn of resolvers) {
      fn(false)
    }
    pending?.('none')
    pending = undefined
  })
  probeProcess = child
  return child
}

/** 解析辅助进程输出行 → 结果（none/格式错误返回 undefined） */
export const parseProbeLine = (line: string): WindowProbeResult => {
  if (line === 'none' || !line.includes('|')) {
    return undefined
  }
  const parts = line.split('|')
  const hwnd = parts[0] ?? ''
  const left = Number(parts[1])
  const top = Number(parts[2])
  const right = Number(parts[3])
  const bottom = Number(parts[4])
  const title = parts.slice(5).join('|')
  const hwndValid: boolean = /^\d+$/.test(hwnd)
  if (!hwndValid || ![left, top, right, bottom].every(Number.isFinite) || right - left < 2 || bottom - top < 2) {
    return undefined
  }
  return { hwnd, left, top, right, bottom, title }
}

/**
 * 查询物理坐标 (x,y) 下的捕获目标窗口（Z 序自顶向下，跳过排除句柄与桌面/任务栏）。
 * excludeHwnds：调用方自家窗口句柄（十进制字符串），无有效窗口/超时返回 undefined。
 */
export const probeWindowAt = (
  physicalX: number,
  physicalY: number,
  excludeHwnds: readonly string[] = [],
  timeoutMs: number = 700
): Promise<WindowProbeResult> => {
  const child = ensureProcess()
  if (child === undefined || child.stdin === undefined) {
    return Promise.resolve(undefined)
  }
  // 等待就绪（首次编译）后再发查询；未就绪/进程异常一律返回 undefined
  return waitReady(10000).then((ready) =>
    new Promise<WindowProbeResult>((resolve) => {
      if (!ready || probeProcess === undefined) {
        resolve(undefined)
        return
      }
      // 新查询顶掉未完成的旧查询（hover 高频节流场景防泄漏）
      pending?.('none')
      const timer = setTimeout(() => {
        pending = undefined
        resolve(undefined)
      }, timeoutMs)
      pending = (line: string) => {
        clearTimeout(timer)
        resolve(parseProbeLine(line))
      }
      const exclude = excludeHwnds.length > 0 ? `|${excludeHwnds.join(';')}` : ''
      probeProcess.stdin?.write(`${String(Math.round(physicalX))},${String(Math.round(physicalY))}${exclude}\n`)
    })
  )
}

/** 预热：立即启动辅助进程并开始 P/Invoke 编译（打开选择器时调用，消除首查 2~3 秒延迟） */
export const warmupWindowProbe = (): void => {
  ensureProcess()
}

/** 退出辅助进程（应用退出时清理） */
export const disposeWindowProbe = (): void => {
  const child = probeProcess
  probeProcess = undefined
  pending?.('none')
  pending = undefined
  if (child !== undefined) {
    child.kill()
  }
}
