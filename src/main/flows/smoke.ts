import { app, screen } from 'electron'
import { spawn } from 'node:child_process'
import log from 'electron-log/main'
import type { RecordSettings } from '../../shared/types'
import { createRegionFrameWindow, getControlWindow, closeCaptureBeacon, createCaptureBeacon } from '../windows'
import { currentPhase, startRecording, stopRecording } from '../record-controller'
import { armRecording, hasArmSnapshot } from '../shell'
import { resolveFfmpegPath } from '../../recorder/ffmpeg/ffmpeg-path'

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 冒烟参数：整屏 30fps，音频开关开启以贴近用户真实录制命令 */
export const SMOKE_SETTINGS: RecordSettings = {
  mode: { kind: 'fullscreen', outputIndex: 0 },
  framerate: 30,
  captureSystemAudio: true,
  captureMicrophone: true
}

/** 停止录制并退出（成功 exit 0 / 失败 exit 1） */
export const checkOutput = async (): Promise<void> => {
  const stop = await stopRecording()
  if (!stop.ok) {
    log.error(`[smoke] 停止失败：${stop.error}`)
    app.exit(1)
    return
  }
  log.info(`[smoke] 冒烟完成，产物目录：${stop.outputDir}`)
  app.exit(0)
}

/** 基础冒烟（--smoke）：纯视频管线 10 秒整屏录制 */
export const runSmokeFlow = async (): Promise<void> => {
  await sleep(3000)
  const start = await startRecording(SMOKE_SETTINGS)
  if (!start.ok) {
    log.error(`[smoke] 启动录制失败：${start.error}`)
    app.exit(1)
    return
  }
  log.info(`[smoke] 录制进行中（10 秒），会话 ${start.sessionId}`)
  await sleep(10000)
  await checkOutput()
}

/** 在控制条窗口里探测 Chromium 系统声采集（激活 WGC 后立即释放），返回探测结论 */
const probeSystemAudio = async (win: import('electron').BrowserWindow): Promise<string> => {
  const result: unknown = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        })
        const hasAudio = stream.getAudioTracks().length > 0
        for (const track of stream.getTracks()) track.stop()
        return hasAudio ? 'system-audio-ok' : 'no-audio-track'
      } catch (error) {
        return 'probe-failed: ' + String(error && error.message ? error.message : error)
      }
    })()
  `)
  return String(result)
}

/** 音频冲突冒烟（--smoke-audio）：先激活系统声采集，再启动 FFmpeg 录制 */
export const runSmokeAudioFlow = async (): Promise<void> => {
  await sleep(3000)
  const win = getControlWindow()
  if (win === undefined) {
    log.error('[smoke-audio] 控制条窗口不存在')
    app.exit(1)
    return
  }
  const probe = await probeSystemAudio(win).catch((error: unknown) => `execute-failed: ${String(error)}`)
  log.info(`[smoke-audio] 系统声探测：${probe}`)
  const start = await startRecording(SMOKE_SETTINGS)
  if (!start.ok) {
    log.error(`[smoke-audio] 启动录制失败：${start.error}`)
    app.exit(1)
    return
  }
  log.info(`[smoke-audio] 录制进行中（10 秒），会话 ${start.sessionId}`)
  await sleep(10000)
  await checkOutput()
}

/** 倒计时链路冒烟（--smoke-arm）：arm → 3 秒倒计时 → 自动开录 */
export const runArmFlow = async (appRoot: string): Promise<void> => {
  await sleep(2000)
  const arm = armRecording(appRoot, SMOKE_SETTINGS)
  if (!arm.ok) {
    log.error(`[smoke-arm] 进入待录失败：${arm.error}`)
    app.exit(1)
    return
  }
  log.info('[smoke-arm] 已进入倒计时（3 秒）')
  await sleep(6000)
  if (currentPhase() !== 'recording') {
    log.error(`[smoke-arm] 倒计时结束后未自动开录，当前阶段：${currentPhase()}`)
    app.exit(1)
    return
  }
  log.info('[smoke-arm] 倒计时结束已自动开录 ✓')
  await sleep(4000)
  await checkOutput()
}

/** 播放器媒体链路冒烟（--smoke-media）：录制后经 app://media 加载产物验证加载/播放/seek */
export const runMediaProbeFlow = async (): Promise<void> => {
  await sleep(2000)
  const start = await startRecording(SMOKE_SETTINGS)
  if (!start.ok) {
    log.error(`[smoke-media] 启动录制失败：${start.error}`)
    app.exit(1)
    return
  }
  await sleep(4500)
  const stop = await stopRecording()
  if (!stop.ok) {
    log.error(`[smoke-media] 停止录制失败：${stop.error}`)
    app.exit(1)
    return
  }
  const videoPath = `${stop.outputDir}\\screen-001.mp4`
  const win = getControlWindow()
  if (win === undefined) {
    log.error('[smoke-media] 控制条窗口不存在')
    app.exit(1)
    return
  }
  log.info(`[smoke-media] F10 设置快照：${hasArmSnapshot() ? '已上报 ✓' : '未上报 ✗'}`)
  const probe: unknown = await win.webContents.executeJavaScript(`
    (async () => {
      const video = document.createElement('video')
      video.muted = true
      video.src = 'app://media/' + encodeURIComponent(${JSON.stringify(videoPath)})
      const loadResult = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve('加载超时'), 8000)
        video.oncanplay = () => { clearTimeout(timer); resolve('canplay,duration=' + String(video.duration)) }
        video.onerror = () => { clearTimeout(timer); resolve('加载失败 code=' + String(video.error ? video.error.code : 'unknown')) }
        video.load()
      })
      if (!String(loadResult).startsWith('canplay')) return loadResult
      const playResult = await video.play().then(() => 'play-ok').catch((e) => 'play-fail:' + String(e))
      video.currentTime = Math.min(1, (video.duration || 1) / 2)
      const seekResult = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve('seek-timeout'), 4000)
        video.onseeked = () => { clearTimeout(timer); resolve('seek-ok@' + String(video.currentTime)) }
      })
      return String(loadResult) + ' | ' + playResult + ' | ' + seekResult
    })()
  `)
  log.info(`[smoke-media] 播放器链路探测：${String(probe)}`)
  const passed: boolean = String(probe).includes('canplay') && String(probe).includes('play-ok') && String(probe).includes('seek-ok')
  app.exit(passed ? 0 : 1)
}

/** 提取视频顶部若干行原始 RGB 像素（红边检测用） */
const readTopEdgePixels = async (ffmpegPath: string, videoPath: string, rows: number): Promise<Buffer> => {
  const child = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-i', videoPath,
    '-vf', `crop=iw:${String(rows)}:0:0`,
    '-frames:v', '1',
    '-pix_fmt', 'rgb24',
    '-f', 'rawvideo', '-'
  ], { windowsHide: true })
  const chunks: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => { chunks.push(chunk) })
  return new Promise<Buffer>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', () => resolve(Buffer.concat(chunks)))
  })
}

/** 区域冒烟使用的固定区域（物理像素，主显示器中央） */
const REGION_FOR_SMOKE = { x: 220, y: 180, width: 840, height: 520 }

/**
 * 区域录制冒烟（--smoke-region）：红框在场 + 区域内动画信标，验证：
 * 1. 视频分辨率 = 所选区域尺寸；2. 画面边缘无红色描边像素（捕获保护生效）。
 * ddagrab 是脏区驱动：静止桌面不产帧（真实用户有鼠标移动不会遇到），故冒烟需信标。
 */
export const runRegionFlow = async (): Promise<void> => {
  await sleep(2000)
  const scaleFactor: number = screen.getPrimaryDisplay().scaleFactor
  createRegionFrameWindow(REGION_FOR_SMOKE, REGION_FOR_SMOKE)
  await sleep(500)
  const settings: RecordSettings = {
    mode: { kind: 'region', outputIndex: 0, region: REGION_FOR_SMOKE },
    framerate: 30,
    captureSystemAudio: false,
    captureMicrophone: false
  }
  const start = await startRecording(settings)
  if (!start.ok) {
    log.error(`[smoke-region] 启动失败：${start.error}`)
    app.exit(1)
    return
  }
  // 区域中央放置动画信标制造画面变化
  const beaconSize: number = Math.round(360 / scaleFactor)
  createCaptureBeacon(
    Math.round(REGION_FOR_SMOKE.x / scaleFactor) + 240,
    Math.round(REGION_FOR_SMOKE.y / scaleFactor) + 80,
    beaconSize,
    beaconSize
  )
  await sleep(5000)
  closeCaptureBeacon()
  const stop = await stopRecording()
  if (!stop.ok) {
    log.error(`[smoke-region] 停止失败：${stop.error}`)
    app.exit(1)
    return
  }
  const videoPath = `${stop.outputDir}\\screen-001.mp4`
  const ffmpegPath: string = resolveFfmpegPath(app.getAppPath(), app.isPackaged)

  // ① 分辨率断言
  const ffprobePath: string = ffmpegPath.replace(/ffmpeg\.exe$/, 'ffprobe.exe')
  const probe: string = await new Promise<string>((resolve) => {
    const child = spawn(ffprobePath, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0', videoPath
    ], { windowsHide: true })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString('utf8') })
    child.on('close', () => resolve(out.trim()))
  })
  const expected = `${String(REGION_FOR_SMOKE.width)},${String(REGION_FOR_SMOKE.height)}`
  log.info(`[smoke-region] 分辨率：${probe}（期望 ${expected}）`)
  if (probe !== expected) {
    log.error('[smoke-region] 分辨率与所选区域不一致')
    app.exit(1)
    return
  }

  // ② 边缘红线检测（红框 border-red-500 ≈ rgb(239,68,68)）
  const pixels: Buffer = await readTopEdgePixels(ffmpegPath, videoPath, 6)
  let redCount = 0
  let total = 0
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const r: number = pixels[i] ?? 0
    const g: number = pixels[i + 1] ?? 0
    const b: number = pixels[i + 2] ?? 0
    total += 1
    if (r > 180 && g < 130 && b < 130) {
      redCount += 1
    }
  }
  const redRatio: number = total > 0 ? redCount / total : 1
  log.info(`[smoke-region] 顶缘红色像素占比：${(redRatio * 100).toFixed(2)}%（阈值 1%）`)
  const passed: boolean = redRatio < 0.01
  if (!passed) {
    log.error('[smoke-region] 检出红色描边像素——捕获保护未生效')
  } else {
    log.info('[smoke-region] 区域录制验证通过：无红线、尺寸正确 ✓')
  }
  app.exit(passed ? 0 : 1)
}
