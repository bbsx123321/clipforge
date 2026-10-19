import type { ChildProcess } from 'node:child_process'
import type { RecordSettings } from '../shared/types'
import { buildRecordArgs, type VideoEncoderId } from './ffmpeg/ffmpeg-args'
import { spawnFfmpegRecord } from './ffmpeg/ffmpeg-run'

/** 分段进程退出信息（诊断用） */
export type SessionExit = {
  /** 是否为主动 stop 触发的退出 */
  readonly expected: boolean
  /** 进程退出码；被信号终止或无法获取时为 null */
  readonly exitCode: number | null
  /** 退出前 stderr 的最后若干行 */
  readonly stderr: readonly string[]
}

/**
 * 单个分段录制会话：管理一个 FFmpeg 子进程的生命周期。
 * 属外部系统（FFmpeg 进程）连接器，是项目中唯一允许持有可变进程状态的封装。
 * 进程意外死亡（非主动 stop）会触发 onUnexpectedExit，绝不静默丢失败。
 */
export class FfmpegRecordSession {
  private child: ChildProcess | undefined
  private expectedStop: boolean = false
  private stderrTail: readonly string[] = []
  private unexpectedExitHandler: ((exit: SessionExit) => void) | undefined

  public constructor(private readonly ffmpegPath: string) {}

  /** 注册意外退出回调（整个应用生命周期设置一次） */
  public setUnexpectedExitHandler(handler: (exit: SessionExit) => void): void {
    this.unexpectedExitHandler = handler
  }

  /** 启动分段录制（ddagrab 主路径）；重复调用视为编程错误，抛出以尽早暴露状态机漏洞 */
  public start(settings: RecordSettings, encoder: VideoEncoderId, outputPath: string): void {
    const args = buildRecordArgs(settings, encoder, outputPath)
    this.startRaw(args, outputPath)
  }

  /** 以完整命令参数启动分段（GDI 回退路径用） */
  public startRaw(args: readonly string[], outputPath: string): void {
    if (this.child !== undefined) {
      throw new Error('分段会话已在运行中，禁止重复 start')
    }
    this.expectedStop = false
    this.stderrTail = []
    const child = spawnFfmpegRecord(this.ffmpegPath, args)
    this.child = child
    child.stderr?.on('data', (chunk: Buffer) => {
      // 仅保留末尾若干行，供失败时诊断
      const line = chunk.toString('utf8').trim()
      if (line.length > 0) {
        this.stderrTail = [...this.stderrTail.slice(-19), line]
      }
    })
    child.on('close', (code) => {
      if (this.child === child) {
        this.child = undefined
      }
      if (!this.expectedStop) {
        this.unexpectedExitHandler?.({
          expected: false,
          exitCode: code,
          stderr: this.stderrTail
        })
      }
    })
  }

  /** 停止当前分段并等待进程退出；未启动时为幂等空操作。
   *  优先优雅退出：向 ffmpeg stdin 发送 'q' 触发 flush 尾部缓冲并写好容器尾
   *  （强杀会丢失 MKV 写盘缓冲中不足一个 flush 单位的尾部数据）；2 秒超时兜底强杀。 */
  public stop(): Promise<void> {
    const child = this.child
    if (child === undefined) {
      return Promise.resolve()
    }
    this.expectedStop = true
    return new Promise<void>((resolve) => {
      const killTimer: NodeJS.Timeout = setTimeout(() => {
        child.kill()
      }, 2000)
      child.on('close', () => {
        clearTimeout(killTimer)
        resolve()
      })
      child.stdin?.write('q')
    })
  }

  /** 是否存在活跃分段进程 */
  public isRunning(): boolean {
    return this.child !== undefined
  }

  /** 最近若干条 stderr 输出（诊断用） */
  public recentStderr(): readonly string[] {
    return this.stderrTail
  }
}
