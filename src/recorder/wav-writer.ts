import { closeSync, openSync, writeSync } from 'node:fs'

/**
 * WAV(PCM Int16) 流式写入器。
 * 先写入 44 字节占位头，关闭时按实际数据长度回填 RIFF 尺寸字段。
 * 属外部文件系统接口，允许持有 fd 可变状态；头部构建为纯函数。
 */

const HEADER_BYTES: number = 44
const BITS_PER_SAMPLE: number = 16

/** 构建 PCM WAV 文件头（纯函数，供单测做 golden 校验） */
export const buildWavHeader = (dataBytes: number, sampleRate: number, channels: number): Buffer => {
  const blockAlign: number = channels * Math.floor(BITS_PER_SAMPLE / 8)
  const byteRate: number = sampleRate * blockAlign
  const header = Buffer.alloc(HEADER_BYTES)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM 线性量化
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(BITS_PER_SAMPLE, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)
  return header
}

/** 采样率与声道数（与渲染进程 AudioWorklet 约定一致） */
export const WAV_SAMPLE_RATE: number = 48000
export const WAV_CHANNELS: number = 2

export class WavStreamWriter {
  private fd: number | undefined
  private dataBytes: number = 0

  public constructor(
    private readonly filePath: string,
    private readonly sampleRate: number,
    private readonly channels: number
  ) {
    this.fd = openSync(filePath, 'w')
    writeSync(this.fd, buildWavHeader(0, sampleRate, channels))
  }

  /** 追加一段 Int16 PCM 数据；写入器已关闭时抛错（防静默丢数据） */
  public append(pcmInt16: Buffer): void {
    if (this.fd === undefined) {
      throw new Error('WavStreamWriter 已关闭，禁止继续写入')
    }
    writeSync(this.fd, pcmInt16)
    this.dataBytes += pcmInt16.byteLength
  }

  /** 回填文件头并关闭；幂等，重复调用无副作用 */
  public close(): void {
    const fd = this.fd
    if (fd === undefined) {
      return
    }
    this.fd = undefined
    const header = buildWavHeader(this.dataBytes, this.sampleRate, this.channels)
    writeSync(fd, header, 0, header.byteLength, 0)
    closeSync(fd)
  }

  /** 已写入的音频数据字节数 */
  public writtenDataBytes(): number {
    return this.dataBytes
  }
}
