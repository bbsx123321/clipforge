import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import log from 'electron-log/main'
import path from 'node:path'
import type { EditProject, EditProjectFile, RecordManifest } from '../../shared/types'
import { loadEditProjectFile } from '../../core/subtitles/edit-project-io'
import { probeVideo, runExport } from '../media-service'
import { startTranscription, whisperResourcesAvailable } from '../services/subtitle-service'
import { getControlWindow } from '../windows'

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 一次性子进程（stdout 收集），失败返回空串 */
const runCapture = (command: string, args: readonly string[]): Promise<string> =>
  new Promise<string>((resolve) => {
    const child = spawn(command, [...args], { windowsHide: true })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(stdout))
  })

/** SAPI TTS 合成英文语音 wav（Windows 自带 .NET 语音，本机与 CI runner 均可用） */
const synthesizeSpeech = async (wavPath: string, text: string): Promise<boolean> => {
  const psScript = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wavPath.replace(/\\/g, '\\\\')}'); $s.Speak('${text}'); $s.Dispose(); Write-Host TTS-OK`
  const stdout = await runCapture('powershell', ['-NoProfile', '-Command', psScript])
  return stdout.includes('TTS-OK') && existsSync(wavPath)
}

/** FFmpeg 一次性任务（退出码判定） */
const runFfmpeg = (ffmpegPath: string, args: readonly string[]): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const child = spawn(ffmpegPath, [...args], { windowsHide: true })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })

/**
 * 字幕全链路冒烟（--smoke-subtitle）：
 * TTS 合成语音 → 伪造 session（含音轨视频 + mic.wav）→ whisper 识别 →
 * 工程文件 cues 断言 → 渲染端 loadEditProject IPC（波形生成）→ 三方式导出断言。
 * 前置条件：resources/whisper 已就绪（scripts/download-whisper.sh 或 CI 下载）。
 */
export const runSubtitleFlow = async (ffmpegPath: string, ffprobePath: string): Promise<void> => {
  await sleep(2000)
  const checks: { readonly name: string; readonly ok: boolean }[] = []
  const check = (name: string, ok: boolean): void => {
    checks.push({ name, ok })
    log.info(`[smoke-subtitle] 检查点 ${name}：${ok ? '✓' : '✗'}`)
  }

  if (!whisperResourcesAvailable()) {
    log.error('[smoke-subtitle] whisper 资源缺失（先跑 scripts/download-whisper.sh）')
    app.exit(1)
    return
  }

  // 冒烟产物目录（与录制冒烟同根：logs/smoke/）
  const baseDir: string = app.isPackaged ? app.getPath('userData') : app.getAppPath()
  const rootDir: string = path.join(baseDir, 'logs', 'smoke', `subtitle-${Date.now()}`)
  mkdirSync(rootDir, { recursive: true })

  // ① TTS 合成麦克风语音
  const ttsWav: string = path.join(rootDir, 'tts-source.wav')
  check('tts-synthesize', await synthesizeSpeech(ttsWav, 'Hello world. This is a subtitle smoke test for ClipForge.'))

  // ② 素材：mic.wav（48k 立体声，模拟真实落盘形态）+ 含音轨视频
  const micWav: string = path.join(rootDir, 'mic.wav')
  const videoFile: string = path.join(rootDir, 'screen-001.mp4')
  const micOk: boolean = await runFfmpeg(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', ttsWav, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', micWav
  ])
  check('mic-wav-prepare', micOk)
  const videoOk: boolean = await runFfmpeg(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'mandelbrot=size=640x360:rate=30',
    '-i', ttsWav,
    '-t', '6',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    videoFile
  ])
  check('video-prepare', videoOk)

  // ③ 伪造 session.json（识别触发条件：captureMicrophone + mic.wav）
  const manifest: RecordManifest = {
    version: 1,
    sessionId: randomUUID(),
    startedAtWallMs: Date.now() - 6000,
    stoppedAtWallMs: Date.now(),
    settings: {
      mode: { kind: 'fullscreen', outputIndex: 0 },
      framerate: 30,
      captureSystemAudio: true,
      captureMicrophone: true
    },
    segments: [{ file: 'screen-001.mp4', startOffsetMs: 0 }],
    audio: undefined,
    warnings: []
  }
  writeFileSync(path.join(rootDir, 'session.json'), JSON.stringify(manifest, null, 2), 'utf8')

  // ④ 识别（主进程直接执行，等待完成）
  const started: boolean = await startTranscription(rootDir, 'screen-001.mp4')
  check('transcription-accepted', started)
  const project: EditProjectFile = loadEditProjectFile(rootDir, 'screen-001.mp4', 6)
  check('asr-ready', project.asr.status === 'ready')
  check('cues-nonempty', project.cues.length > 0)
  log.info(`[smoke-subtitle] 识别结果：${String(project.cues.length)} 条 → ${project.cues.map((cue) => cue.text).join(' / ')}`)
  check('mic-wav-cleaned', !existsSync(micWav))

  // ⑤ 渲染端 IPC：loadEditProject（触发波形生成）
  const win = getControlWindow()
  if (win !== undefined) {
    const probe: unknown = await win.webContents.executeJavaScript(`
      (async () => {
        const file = await window.api.loadEditProject(${JSON.stringify(rootDir)}, 'screen-001.mp4', 6, true)
        return JSON.stringify({ cues: file.cues.length, waveform: file.waveform.length, status: file.asr.status })
      })()
    `)
    log.info(`[smoke-subtitle] 渲染端工程读取：${String(probe)}`)
    const loaded = JSON.parse(String(probe)) as { readonly cues: number; readonly waveform: number; readonly status: string }
    check('renderer-load', loaded.cues > 0 && loaded.status === 'ready')
    check('waveform-generated', loaded.waveform > 0)
  } else {
    check('renderer-load', false)
    check('waveform-generated', false)
  }

  // ⑥ 三方式导出（主进程直跑，绕过保存对话框）
  const outputPath: string = path.join(rootDir, 'smoke-edited.mp4')
  const exportProject: EditProject = {
    sourceFilePath: videoFile,
    durationSec: 6,
    hasAudio: true,
    segments: [{ startSec: 0, endSec: 6, speed: 1 }],
    subtitles: {
      cues: project.cues,
      style: project.style,
      options: { burn: true, srtFile: true, softTrack: true }
    }
  }
  const exportResult = await runExport(ffmpegPath, ffprobePath, exportProject, 'libx264', 30, outputPath)
  check('export-ok', exportResult.ok)
  const srtPath: string = outputPath.replace(/\.mp4$/, '.srt')
  check('export-srt', existsSync(srtPath) && readFileSync(srtPath, 'utf8').includes(' --> '))
  if (exportResult.ok) {
    const probe = await probeVideo(ffprobePath, outputPath)
    check('export-duration', probe.durationSec > 4)
    log.info(`[smoke-subtitle] 导出产物时长 ${String(probe.durationSec)}s（烧录+软轨+srt）`)
  }

  const passed: boolean = checks.every((item) => item.ok)
  log.info(`[smoke-subtitle] ${passed ? '全部检查点通过 ✓' : `失败检查点：${checks.filter((item) => !item.ok).map((item) => item.name).join(', ')}`}`)
  app.exit(passed ? 0 : 1)
}
