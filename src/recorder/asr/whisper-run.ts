import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import log from 'electron-log/main'

/** whisper 运行结果：成功 = JSON 文件已生成 */
export type WhisperRunResult =
  | { readonly ok: true; readonly jsonPath: string }
  | { readonly ok: false; readonly error: string }

/** stderr 中的进度上报格式：whisper_print_progress_callback: progress = 42% */
const PROGRESS_PATTERN: RegExp = /progress = (\d+)%/g

/**
 * 运行一次 whisper-cli 转写（长任务）：
 * - 进度：解析 stderr 的 progress = N%，回调取每个数据块中的最后一个值
 * - 成功判定：退出码 0 且 JSON 输出文件存在
 * - 超时：达到 timeoutMs 强杀并返回失败（调用方按音频时长估算）
 */
export const runWhisperTranscribe = (
  cliPath: string,
  args: readonly string[],
  jsonPath: string,
  timeoutMs: number,
  onProgress: (percent: number) => void
): Promise<WhisperRunResult> =>
  new Promise<WhisperRunResult>((resolve) => {
    const child = spawn(cliPath, [...args], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderrTail = ''
    let settled = false
    const finish = (result: WhisperRunResult): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer: NodeJS.Timeout = setTimeout(() => {
      child.kill()
      finish({ ok: false, error: `whisper 超时（${String(Math.round(timeoutMs / 1000))} 秒）` })
    }, timeoutMs)

    child.stderr.on('data', (chunk: Buffer) => {
      const text: string = chunk.toString('utf8')
      stderrTail = (stderrTail + text).slice(-800)
      let lastPercent: number | undefined
      for (const match of text.matchAll(PROGRESS_PATTERN)) {
        const parsed: number = Number(match[1])
        if (Number.isFinite(parsed)) {
          lastPercent = parsed
        }
      }
      if (lastPercent !== undefined) {
        onProgress(lastPercent)
      }
    })
    child.on('error', (error: Error) => {
      finish({ ok: false, error: `whisper 启动失败：${error.message}` })
    })
    child.on('close', (code: number | null) => {
      if (code === 0 && existsSync(jsonPath)) {
        finish({ ok: true, jsonPath })
        return
      }
      log.warn(`[subtitle] whisper 退出码 ${String(code)}，stderr 尾部：${stderrTail.trim()}`)
      finish({ ok: false, error: stderrTail.trim().slice(-300) || `whisper 退出码 ${String(code)}` })
    })
  })
