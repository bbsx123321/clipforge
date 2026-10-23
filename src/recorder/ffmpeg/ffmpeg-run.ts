import { spawn, type ChildProcess } from 'node:child_process'

/**
 * 一次性运行 FFmpeg（编码器探测用）。
 * 在 timeoutMs 内以退出码 0 结束返回 true；超时、启动失败、非零退出均返回 false。
 */
export const runFfmpegOnce = (ffmpegPath: string, args: readonly string[], timeoutMs: number): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    let settled: boolean = false
    const settle = (result: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const child: ChildProcess = spawn(ffmpegPath, [...args], { windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill()
      settle(false)
    }, timeoutMs)
    child.on('error', () => settle(false))
    child.on('close', (code) => settle(code === 0))
  })

/**
 * 启动长驻录制进程（分段视频会话用）。
 * stdin 保持 pipe：停止时发送 'q' 让 ffmpeg 优雅 flush 尾部缓冲（强杀会丢尾部数据）。
 */
export const spawnFfmpegRecord = (ffmpegPath: string, args: readonly string[]): ChildProcess =>
  spawn(ffmpegPath, [...args], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })

/**
 * 一次性运行 FFmpeg 并收集全部 stdout 二进制数据（波形 PCM 提取用）。
 * 退出码 0 返回拼接 Buffer；启动失败、超时、非零退出返回 undefined。
 */
export const runFfmpegCollectStdout = (
  ffmpegPath: string,
  args: readonly string[],
  timeoutMs: number
): Promise<Buffer | undefined> =>
  new Promise<Buffer | undefined>((resolve) => {
    let settled: boolean = false
    const settle = (result: Buffer | undefined): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const child: ChildProcess = spawn(ffmpegPath, [...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const timer = setTimeout(() => {
      child.kill()
      settle(undefined)
    }, timeoutMs)
    const chunks: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    child.on('error', () => settle(undefined))
    child.on('close', (code) => settle(code === 0 ? Buffer.concat(chunks) : undefined))
  })
