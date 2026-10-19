import type { RecordingSegment } from '../shared/types'
import { statSync } from 'node:fs'
import path from 'node:path'
import { runFfmpegOnce } from './ffmpeg/ffmpeg-run'

/**
 * 分段收尾：录制期 MKV → MP4 无损 remux 与产物健康检查。
 * OBS 同款策略：录制写 MKV（流式、崩溃安全），停止时 -c copy remux 为 MP4（秒级完成，不重编码）。
 */

/** remux 超时：-c copy 对 1 小时视频通常 < 30s，给足余量 */
const REMUX_TIMEOUT_MS: number = 120000

/** MKV → MP4 无损转封装参数（纯函数，供 golden 测试） */
export const buildRemuxArgs = (inputPath: string, outputPath: string): readonly string[] => [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-i', inputPath,
  '-c', 'copy',
  '-movflags', '+faststart',
  outputPath
]

/** 单个分段 remux 结果 */
export type RemuxOutcome =
  | { readonly ok: true; readonly mp4File: string }
  | { readonly ok: false; readonly reason: string }

/** 把一个 MKV 分段无损 remux 为同名 MP4；成功返回 mp4 文件名，失败返回原因（MKV 保留不删） */
export const remuxSegmentToMp4 = async (
  ffmpegPath: string,
  rootDir: string,
  mkvFile: string
): Promise<RemuxOutcome> => {
  const inputPath: string = path.join(rootDir, mkvFile)
  const mp4File: string = `${mkvFile.replace(/\.mkv$/, '')}.mp4`
  const outputPath: string = path.join(rootDir, mp4File)
  const succeeded: boolean = await runFfmpegOnce(ffmpegPath, buildRemuxArgs(inputPath, outputPath), REMUX_TIMEOUT_MS)
  if (!succeeded) {
    return { ok: false, reason: `分段 ${mkvFile} remux 失败（原始 MKV 已保留）` }
  }
  try {
    if (statSync(outputPath).size < 1024) {
      return { ok: false, reason: `remux 产物 ${mp4File} 异常（原始 MKV 已保留）` }
    }
  } catch {
    return { ok: false, reason: `remux 产物 ${mp4File} 未生成（原始 MKV 已保留）` }
  }
  return { ok: true, mp4File }
}

/** 分段产物健康检查（纯函数）：文件缺失或小于 1KB 视为无效录制 */
export const undersizedSegmentWarnings = (rootDir: string, segments: readonly RecordingSegment[]): readonly string[] => {
  const broken = segments.filter((segment) => {
    try {
      return statSync(path.join(rootDir, segment.file)).size < 1024
    } catch {
      return true
    }
  })
  if (broken.length === 0) {
    return []
  }
  const names = broken.map((segment) => segment.file).join('、')
  return [
    `视频文件异常（${names} 小于 1KB）：录制期间屏幕无输出（锁屏/休眠/独占全屏）或捕获进程故障，请重试；详情见日志`
  ]
}
