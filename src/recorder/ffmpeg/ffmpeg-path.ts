import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * 解析 FFmpeg 可执行文件路径：
 * 1. 优先使用应用内置的 resources/ffmpeg/ffmpeg.exe（保证分发环境行为一致）
 * 2. 回退到 PATH 中的 ffmpeg（开发机常见情形）
 * 找不到时仍返回 'ffmpeg'，由 spawn 失败暴露明确错误。
 */
export const resolveFfmpegPath = (appRoot: string, isPackaged: boolean): string => {
  const bundledPath: string = isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    : path.join(appRoot, 'resources', 'ffmpeg', 'ffmpeg.exe')
  if (existsSync(bundledPath)) {
    return bundledPath
  }
  return 'ffmpeg'
}

/** 解析 ffprobe 路径（与 ffmpeg 同目录解析规则） */
export const resolveFfprobePath = (appRoot: string, isPackaged: boolean): string => {
  const bundledPath: string = isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffprobe.exe')
    : path.join(appRoot, 'resources', 'ffmpeg', 'ffprobe.exe')
  if (existsSync(bundledPath)) {
    return bundledPath
  }
  return 'ffprobe'
}
