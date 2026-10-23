import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * 解析 whisper.cpp 可执行文件与模型路径（字幕语音识别用）：
 * 1. 优先使用应用内置的 resources/whisper/（scripts/download-whisper.sh 或 CI 下载）
 * 2. 找不到时返回空串，由调用方跳过识别（字幕功能优雅降级，不影响录制）
 */
export const resolveWhisperCliPath = (appRoot: string, isPackaged: boolean): string => {
  const bundledPath: string = isPackaged
    ? path.join(process.resourcesPath, 'whisper', 'whisper-cli.exe')
    : path.join(appRoot, 'resources', 'whisper', 'whisper-cli.exe')
  return existsSync(bundledPath) ? bundledPath : ''
}

/** 内置 base 量化模型文件名（与 scripts/download-whisper.sh 保持一致） */
export const WHISPER_MODEL_FILE: string = 'ggml-base-q5_1.bin'

/** 解析 whisper 模型路径；找不到返回空串（识别功能降级） */
export const resolveWhisperModelPath = (appRoot: string, isPackaged: boolean): string => {
  const bundledPath: string = isPackaged
    ? path.join(process.resourcesPath, 'whisper', WHISPER_MODEL_FILE)
    : path.join(appRoot, 'resources', 'whisper', WHISPER_MODEL_FILE)
  return existsSync(bundledPath) ? bundledPath : ''
}
