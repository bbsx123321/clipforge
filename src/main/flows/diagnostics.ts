import { app } from 'electron'
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import log from 'electron-log/main'

/**
 * 诊断流程（--spawn-matrix / --region-verbose）：
 * 在真实 Electron 主进程内复现特定 ffmpeg 调用，用于定位环境级问题。
 */

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** stderr 进度里取最后的 frame 计数；无输出返回 -1 */
const lastFrameCount = (stderr: string): number => {
  const matches = [...stderr.matchAll(/frame=\s*(\d+)/g)]
  const last = matches[matches.length - 1]
  return last !== undefined ? Number(last[1]) : -1
}

/** spawn 配置矩阵（--spawn-matrix）：验证不同 spawn 选项下 ddagrab 直通是否可用 */
export const runSpawnMatrixFlow = async (ffmpegPath: string): Promise<void> => {
  await sleep(3000)
  const configs: readonly (readonly [string, object])[] = [
    ['A: windowsHide+pipe', { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }],
    ['B: windowsHide=false', { windowsHide: false, stdio: ['ignore', 'ignore', 'pipe'] }],
    ['C: detached', { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], detached: true }],
    ['D: 全默认', { stdio: ['ignore', 'ignore', 'pipe'] }]
  ]
  const args: readonly string[] = [
    '-hide_banner', '-loglevel', 'info',
    '-f', 'lavfi', '-i', 'ddagrab=framerate=30',
    '-c:v', 'h264_nvenc',
    '-f', 'null', '-'
  ]
  for (const [label, opts] of configs) {
    const frames: number = await new Promise<number>((resolve) => {
      const child = spawn(ffmpegPath, [...args], opts as never)
      let stderr: string = ''
      child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
      child.on('error', () => resolve(-1))
      setTimeout(() => {
        child.kill()
        resolve(lastFrameCount(stderr))
      }, 4000)
    })
    log.info(`[spawn-matrix] ${label} → frame=${String(frames)}`)
  }
  app.exit(0)
}

/** 区域写文件逐秒诊断（--region-verbose）：观察 size 与 frame 的增长关系，
 *  区分「捕获无帧」（frame 不动）与「写盘被挂」（frame 走而 size 不动）。 */
export const runRegionVerboseFlow = async (ffmpegPath: string): Promise<void> => {
  await sleep(2000)
  const out = 'C:/Users/boss/Downloads/region-verbose.mkv'
  const child = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'info', '-y',
    '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=30:offset_x=220:offset_y=180:video_size=840x520',
    '-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-g', '30',
    '-f', 'matroska', out
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
  for (let t = 1; t <= 6; t += 1) {
    await sleep(1000)
    let size = -1
    try {
      size = statSync(out).size
    } catch {
      size = -1
    }
    log.info(`[region-verbose] t=${String(t)}s size=${String(size)} frame=${String(lastFrameCount(stderr))}`)
  }
  child.kill()
  app.exit(0)
}

/** 窗口探查诊断（--window-probe）：验证 Z 序窗口查询链路（含自家窗口与桌面排除）。
 *  探测屏幕中央（自动化环境无人工鼠标，中央通常有终端窗口）。 */
export const runWindowProbeFlow = async (): Promise<void> => {
  await sleep(2000)
  const { screen } = require('electron') as typeof import('electron')
  const { probeWindowAt, disposeWindowProbe } = await import('../../recorder/window-rect')
  const { ownWindowHandles } = await import('../windows')
  const primary = screen.getPrimaryDisplay()
  const cx = Math.round((primary.bounds.x + primary.bounds.width / 2) * primary.scaleFactor)
  const cy = Math.round((primary.bounds.y + primary.bounds.height / 2) * primary.scaleFactor)
  const excludes = ownWindowHandles()
  const raw = await probeWindowAt(cx, cy, excludes)
  log.info(
    `[window-probe] 屏幕中央物理(${String(cx)},${String(cy)}) 排除自家窗口 ${String(excludes.length)} 个 → ` +
      (raw === undefined ? '无窗口' : `hwnd=${raw.hwnd} rect=(${String(raw.left)},${String(raw.top)},${String(raw.right)},${String(raw.bottom)}) title=${raw.title}`)
  )
  disposeWindowProbe()
  app.exit(raw === undefined ? 1 : 0)
}

/** 窗口选择全链路冒烟（--smoke-window-hover）：打开真实选择覆盖层 → 程序化移动鼠标
 *  到屏幕中央（其下有真实窗口）→ 渲染端 window.api 探查 → 断言拿到窗口数据。
 *  完整复现用户 hover 路径（覆盖层渲染 → preload/IPC → PS 探查 → 排除自家）。 */
export const runWindowHoverFlow = async (): Promise<void> => {
  await sleep(1500)
  const { screen } = require('electron') as typeof import('electron')
  const { warmupWindowProbe, disposeWindowProbe } = await import('../../recorder/window-rect')
  const { createOverlayWindow, getOverlayWindow, closeOverlay } = await import('../windows')
  warmupWindowProbe()
  createOverlayWindow('window')
  await sleep(4500)
  // 程序化把鼠标移到屏幕中央（DPI 感知的一行 PS），中央下方有真实窗口
  const primary = screen.getPrimaryDisplay()
  const cx = Math.round(primary.bounds.x + primary.bounds.width / 2)
  const cy = Math.round(primary.bounds.y + primary.bounds.height / 2)
  const mover = spawn('powershell.exe', [
    '-NoProfile', '-Command',
    "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class M{[DllImport(\"user32.dll\")]public static extern bool SetProcessDPIAware();[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);}'; [M]::SetProcessDPIAware()|Out-Null; [M]::SetCursorPos(" + String(cx) + "," + String(cy) + ")"
  ], { windowsHide: true, stdio: 'ignore' })
  const moveCode: number = await new Promise<number>((resolve) => { mover.on('close', (code) => resolve(code ?? -1)) })
  const afterMove = screen.getCursorScreenPoint()
  log.info(`[smoke-hover] 鼠标移动进程退出码=${String(moveCode)}，移动后光标逻辑坐标=(${String(afterMove.x)},${String(afterMove.y)})`)
  await sleep(800)
  const overlay = getOverlayWindow()
  if (overlay === undefined) {
    log.error('[smoke-hover] 覆盖层不存在')
    app.exit(1)
    return
  }
  const probe: unknown = await overlay.webContents.executeJavaScript('window.api.probeWindowAtCursor()')
  log.info(`[smoke-hover] 渲染端探查（中央 ${String(cx)},${String(cy)}）：${JSON.stringify(probe)}`)
  closeOverlay()
  disposeWindowProbe()
  const ok: boolean = probe !== null && probe !== undefined
  if (!ok) {
    log.error('[smoke-hover] 渲染端未拿到窗口数据')
  }
  app.exit(ok ? 0 : 1)
}
