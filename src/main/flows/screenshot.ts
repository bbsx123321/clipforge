import { app, desktopCapturer, screen } from 'electron'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import log from 'electron-log/main'
import path from 'node:path'
import { resolveFfmpegPath, resolveFfprobePath } from '../../recorder/ffmpeg/ffmpeg-path'
import { listRecordings } from '../media-service'
import { getOutputDirInfo, setCustomOutputDir } from '../record-controller'
import { createCaptureBeacon, createRegionFrameWindow, getControlWindow, setControlWindowSize, showControlWindow } from '../windows'

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 截图输出目录 */
const shotsDir = (appRoot: string): string => path.join(appRoot, 'store', 'listing', 'shots')

/**
 * 合成素材视频（FFmpeg mandelbrot 分形动画 8 秒）并伪造 session 清单。
 * 不走真实录制：画面完全可控（彩色动画、不暴露桌面），且不受桌面复制
 * 脏区机制影响（Chromium 动画窗覆盖录制区会触发独立翻转，DDA 拿不到帧）。
 */
const makeSyntheticClip = (appRoot: string, smokeRoot: string): void => {
  const stamp: string = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir: string = path.join(smokeRoot, `store-shots-${stamp}`)
  mkdirSync(dir, { recursive: true })
  const video: string = path.join(dir, 'screen-001.mp4')
  const ffmpegPath: string = resolveFfmpegPath(appRoot, app.isPackaged)
  const args: readonly string[] = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'mandelbrot=size=1280x720:rate=30',
    '-t', '8',
    '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '19', '-b:v', '0',
    '-pix_fmt', 'yuv420p',
    video
  ]
  const run = spawnSync(ffmpegPath, [...args], { stdio: 'pipe' })
  if (run.status !== 0 || !existsSync(video)) {
    throw new Error(`素材合成失败：${run.stderr.toString('utf8').slice(0, 300)}`)
  }
  const now: number = Date.now()
  // 伪造与真实产物同构的 session.json（列表扫描与编辑器播放走真实路径）
  const manifest = {
    version: 1,
    sessionId: `store-shots-${stamp}`,
    startedAtWallMs: now - 8000,
    stoppedAtWallMs: now,
    settings: {
      mode: { kind: 'fullscreen', outputIndex: 0 },
      framerate: 30,
      captureSystemAudio: false,
      captureMicrophone: false
    },
    segments: [{ file: 'screen-001.mp4', startOffsetMs: 0 }],
    warnings: [] as readonly string[]
  }
  writeFileSync(path.join(dir, 'session.json'), JSON.stringify(manifest, null, 2), 'utf8')
  log.info(`[shots] 素材合成完成：${video}`)
}

/** 在控制条渲染端进入编辑器并布置「播放中 + 裁剪选区」画面（真实 DOM 事件路径） */
const setupEditorScene = async (): Promise<string> => {
  const win = getControlWindow()
  if (win === undefined) {
    throw new Error('控制条窗口不存在')
  }
  const result: unknown = await win.webContents.executeJavaScript(`
    (async () => {
      // 等最近录制列表出现 mp4 条目
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          if (document.querySelectorAll('[title$=".mp4"]').length > 0) { clearInterval(timer); resolve(); }
        }, 200)
        setTimeout(() => { clearInterval(timer); resolve(); }, 8000)
      })
      const item = document.querySelector('[title$=".mp4"]')
      if (item === null) { return 'no-item' }
      item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      // 等编辑器视频可渲染
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          const video = document.querySelector('video')
          if (video !== null && video.readyState >= 2) { clearInterval(timer); resolve(); }
        }, 200)
        setTimeout(() => { clearInterval(timer); resolve(); }, 8000)
      })
      const video = document.querySelector('video')
      if (video === null) { return 'no-video' }
      video.currentTime = 2
      void video.play().catch(() => undefined)
      await new Promise((r) => setTimeout(r, 700))
      // 开裁剪模式并点出选区（轨道 30% / 65% 两点）
      const trimBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('裁剪'))
      if (trimBtn !== undefined) { trimBtn.click() }
      await new Promise((r) => setTimeout(r, 300))
      const track = document.querySelector('.cursor-crosshair')
      if (track !== null) {
        const rect = track.getBoundingClientRect()
        for (const ratio of [0.3, 0.65]) {
          track.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true,
            clientX: rect.left + rect.width * ratio, clientY: rect.top + 8
          }))
          await new Promise((r) => setTimeout(r, 250))
        }
      }
      return 'editor-ready'
    })()
  `)
  return String(result)
}

/** 控制条窗口整窗截图（capturePage 输出逻辑像素 PNG） */
const captureControlWindow = async (file: string): Promise<void> => {
  const win = getControlWindow()
  if (win === undefined) {
    throw new Error('控制条窗口不存在')
  }
  const image = await win.webContents.capturePage()
  writeFileSync(file, image.toPNG())
  log.info(`[shots] 已保存 ${path.basename(file)}（${String(image.getSize().width)}×${String(image.getSize().height)}）`)
}

/** 全屏截图（desktopCapturer，含区域红框等所有置顶窗口；必须显式指定缩略图尺寸） */
const captureScreen = async (file: string): Promise<void> => {
  const display = screen.getPrimaryDisplay()
  const physical = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  }
  const primary = (
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: physical })
  )[0]
  if (primary === undefined) {
    throw new Error('desktopCapturer 未返回屏幕源')
  }
  const size = primary.thumbnail.getSize()
  writeFileSync(file, primary.thumbnail.toPNG())
  log.info(`[shots] 已保存 ${path.basename(file)}（${String(size.width)}×${String(size.height)}）`)
}

/**
 * 商店截图生成（--make-store-shots）：
 * 1. FFmpeg 合成动画素材 → 2. 编辑器视图（中/英各一张，含播放画面与裁剪选区）
 * → 3. 全屏截图（区域红框指示）。产物输出 store/listing/shots/。
 */
export const runStoreShotsFlow = async (appRoot: string): Promise<void> => {
  await sleep(2000)
  const outDir = shotsDir(appRoot)
  mkdirSync(outDir, { recursive: true })
  // 先把输出目录指向冒烟目录（渲染端「最近录制」在录制结束回 idle 时刷新，
  // 必须在此之前生效才能看到素材；结束恢复原设置）
  const original = getOutputDirInfo()
  const smokeRoot: string = path.join(appRoot, 'logs', 'smoke')
  setCustomOutputDir(smokeRoot)
  try {
    makeSyntheticClip(appRoot, smokeRoot)

    // 校验素材入列（ffprobe 扫描出时长）
    const ffprobePath: string = resolveFfprobePath(appRoot, app.isPackaged)
    const items = await listRecordings(smokeRoot, ffprobePath)
    log.info(`[shots] 最近录制 ${String(items.length)} 条，最新：${items[0]?.file ?? '(无)'}`)
    const freshItem = items[0]
    if (freshItem === undefined || !freshItem.file.endsWith('.mp4')) {
      throw new Error(`素材未入列（最新：${freshItem?.file ?? '无'}）`)
    }

    // 编辑器大窗 + 场景布置 + 中英两张（进入编辑器后渲染端会重设窗口尺寸，之后再放大）。
    // 素材不是真实录制产物，渲染端不会收到 phase 变化——重载页面触发列表重新扫描。
    showControlWindow(true)
    await getControlWindow()?.webContents.executeJavaScript('location.reload()')
    await sleep(2500)
    const scene = await setupEditorScene()
    if (scene !== 'editor-ready') {
      throw new Error(`编辑器场景布置失败：${scene}`)
    }
    setControlWindowSize(1400, 800)
    await sleep(700)
    await captureControlWindow(path.join(outDir, 'editor-zh.png'))
    await getControlWindow()?.webContents.executeJavaScript('window.api.setLanguage("en")')
    await sleep(800)
    await captureControlWindow(path.join(outDir, 'editor-en.png'))
    await getControlWindow()?.webContents.executeJavaScript('window.api.setLanguage("zh")')

    // 区域红框全屏（红框指示是核心卖点画面；红框矩形物理像素 = 逻辑 × 缩放比）
    const beaconLogical = { x: 200, y: 160, width: 880, height: 495 }
    const scale: number = screen.getPrimaryDisplay().scaleFactor
    const framePhysical = {
      x: Math.round(beaconLogical.x * scale) - 24,
      y: Math.round(beaconLogical.y * scale) - 24,
      width: Math.round(beaconLogical.width * scale) + 48,
      height: Math.round(beaconLogical.height * scale) + 48
    }
    createCaptureBeacon(beaconLogical.x, beaconLogical.y, beaconLogical.width, beaconLogical.height)
    await sleep(600)
    createRegionFrameWindow(framePhysical, framePhysical)
    await sleep(800)
    await captureScreen(path.join(outDir, 'region-frame.png'))

    log.info('[shots] 全部截图完成 ✓')
    app.exit(0)
  } catch (error) {
    log.error(`[shots] 失败：${error instanceof Error ? error.message : String(error)}`)
    app.exit(1)
  } finally {
    // 恢复原输出目录设置（用户自定义过则还原自定义值，否则恢复默认）
    setCustomOutputDir(original.isDefault ? undefined : original.dir)
  }
}
