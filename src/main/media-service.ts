import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { EditProject, ExportResult, Framerate, RecordManifest, RecordingSummary } from '../shared/types'
import { buildExportArgs } from '../core/exporting/export-args'
import type { VideoEncoderId } from '../recorder/ffmpeg/ffmpeg-args'
import { buildVideoCodecArgs } from '../recorder/ffmpeg/ffmpeg-args'

/**
 * 素材库与导出服务：
 * - 扫描输出目录下的 session.json → 最近录制列表（ffprobe 探测时长与音轨）
 * - 执行剪辑工程导出（FFmpeg 长任务，编码参数注入硬编探测结果）
 */

const LIST_LIMIT: number = 10

/** ffprobe 探测结果 */
type ProbeResult = {
  readonly durationSec: number
  readonly hasAudio: boolean
}

/** 单次 ffprobe：时长 + 是否有音轨；失败返回零值 */
export const probeVideo = (ffprobePath: string, filePath: string): Promise<ProbeResult> =>
  new Promise<ProbeResult>((resolve) => {
    const child = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'json',
      filePath
    ], { windowsHide: true })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.on('error', () => resolve({ durationSec: 0, hasAudio: false }))
    child.on('close', () => {
      try {
        const parsed: unknown = JSON.parse(stdout)
        const formatDuration = (parsed as { readonly format?: { readonly duration?: string } }).format?.duration
        const streams = (parsed as { readonly streams?: readonly unknown[] }).streams
        resolve({
          durationSec: formatDuration !== undefined ? Number(formatDuration) : 0,
          hasAudio: Array.isArray(streams) && streams.length > 0
        })
      } catch {
        resolve({ durationSec: 0, hasAudio: false })
      }
    })
  })

/** 扫描输出目录下的录制记录（每个 session 的首个视频分段），按时间倒序 */
export const listRecordings = async (
  outputRoot: string,
  ffprobePath: string
): Promise<readonly RecordingSummary[]> => {
  if (!existsSync(outputRoot)) {
    return []
  }
  const summaries: RecordingSummary[] = []
  for (const entry of readdirSync(outputRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const dirPath = path.join(outputRoot, entry.name)
    const manifestFile = path.join(dirPath, 'session.json')
    if (!existsSync(manifestFile)) {
      continue
    }
    try {
      const manifest: RecordManifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as RecordManifest
      const first = manifest.segments[0]
      if (first === undefined) {
        continue
      }
      const filePath = path.join(dirPath, first.file)
      if (!existsSync(filePath)) {
        continue
      }
      const probe = await probeVideo(ffprobePath, filePath)
      summaries.push({
        id: `${manifest.sessionId}:${String(first.file)}`,
        file: String(first.file),
        filePath,
        dirPath,
        durationSec: probe.durationSec,
        recordedAtMs: manifest.stoppedAtWallMs,
        hasAudio: probe.hasAudio
      })
    } catch {
      // 单条损坏的 session.json 不影响列表
    }
  }
  return summaries.sort((a, b) => b.recordedAtMs - a.recordedAtMs).slice(0, LIST_LIMIT)
}

/** 隐藏标记文件名（仅移除记录时把清单改名，扫描自然跳过） */
const IGNORED_MANIFEST: string = 'session.ignored.json'

/** 路径安全校验（纯函数）：child 必须位于 root 目录之内，防止越权删除任意目录 */
export const isPathInsideRoot = (child: string, root: string): boolean => {
  const normalizedChild: string = path.resolve(child)
  const normalizedRoot: string = path.resolve(root)
  return normalizedChild.startsWith(`${normalizedRoot}${path.sep}`)
}

/** 批量删除录制源文件（整个 session 目录）。
 *  只允许删除输出根目录内的路径；返回删除失败的目录列表（文件被占用等）。 */
export const deleteRecordingFiles = (
  dirPaths: readonly string[],
  outputRoot: string
): readonly string[] => {
  const failed: string[] = []
  for (const dirPath of dirPaths) {
    if (!isPathInsideRoot(dirPath, outputRoot)) {
      failed.push(dirPath)
      continue
    }
    try {
      rmSync(dirPath, { recursive: true, force: true })
    } catch {
      failed.push(dirPath)
    }
  }
  return failed
}

/** 批量仅移除记录：session.json → session.ignored.json（视频文件保留在磁盘）。
 *  幂等：目标已存在（此前移除过）视为成功；返回失败的目录列表。 */
export const hideRecordingRecords = (
  dirPaths: readonly string[],
  outputRoot: string
): readonly string[] => {
  const failed: string[] = []
  for (const dirPath of dirPaths) {
    if (!isPathInsideRoot(dirPath, outputRoot)) {
      failed.push(dirPath)
      continue
    }
    const manifestFile: string = path.join(dirPath, 'session.json')
    const targetFile: string = path.join(dirPath, IGNORED_MANIFEST)
    if (existsSync(targetFile)) {
      continue
    }
    try {
      renameSync(manifestFile, targetFile)
    } catch {
      failed.push(dirPath)
    }
  }
  return failed
}

/** 执行导出：构建滤镜命令并等待完成（无超时——长视频导出可达分钟级） */
export const runExport = (
  ffmpegPath: string,
  project: EditProject,
  encoder: VideoEncoderId,
  framerate: Framerate,
  outputPath: string
): Promise<ExportResult> =>
  new Promise<ExportResult>((resolve) => {
    const args = buildExportArgs(project, outputPath, buildVideoCodecArgs(encoder, framerate))
    const child = spawn(ffmpegPath, [...args], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => resolve({ ok: false, error: String(error) }))
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, outputPath })
        return
      }
      resolve({ ok: false, error: stderr.slice(-800).trim() || `FFmpeg 退出码 ${String(code)}` })
    })
  })
