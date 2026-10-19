import { describe, expect, it } from 'vitest'
import { buildWavHeader, WavStreamWriter, WAV_CHANNELS, WAV_SAMPLE_RATE } from '../src/recorder/wav-writer'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('WAV 头构建（golden）', () => {
  it('44 字节标准 PCM 头，长度字段正确回填', () => {
    const header = buildWavHeader(1000, WAV_SAMPLE_RATE, WAV_CHANNELS)
    expect(header.byteLength).toBe(44)
    expect(header.toString('ascii', 0, 4)).toBe('RIFF')
    expect(header.readUInt32LE(4)).toBe(36 + 1000)
    expect(header.toString('ascii', 8, 12)).toBe('WAVE')
    expect(header.toString('ascii', 12, 16)).toBe('fmt ')
    expect(header.readUInt32LE(16)).toBe(16)
    expect(header.readUInt16LE(20)).toBe(1)
    expect(header.readUInt16LE(22)).toBe(2)
    expect(header.readUInt32LE(24)).toBe(48000)
    // byteRate = sampleRate * blockAlign = 48000 * 4
    expect(header.readUInt32LE(28)).toBe(192000)
    expect(header.readUInt16LE(32)).toBe(4)
    expect(header.readUInt16LE(34)).toBe(16)
    expect(header.toString('ascii', 36, 40)).toBe('data')
    expect(header.readUInt32LE(40)).toBe(1000)
  })
})

describe('WavStreamWriter', () => {
  it('追加数据后关闭时回填正确长度', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wav-test-'))
    const filePath = path.join(dir, 'audio-mix.wav')
    try {
      const writer = new WavStreamWriter(filePath, WAV_SAMPLE_RATE, WAV_CHANNELS)
      const chunk = Buffer.alloc(200, 7)
      writer.append(chunk)
      writer.append(chunk)
      expect(writer.writtenDataBytes()).toBe(400)
      writer.close()
      // 幂等：重复 close 不抛错
      writer.close()

      const file = readFileSync(filePath)
      expect(file.byteLength).toBe(44 + 400)
      expect(file.readUInt32LE(40)).toBe(400)
      expect(file.readUInt32LE(4)).toBe(36 + 400)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('关闭后继续写入抛错（防静默丢数据）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'wav-test-'))
    const filePath = path.join(dir, 'audio-mix.wav')
    try {
      const writer = new WavStreamWriter(filePath, WAV_SAMPLE_RATE, WAV_CHANNELS)
      writer.close()
      expect(() => writer.append(Buffer.alloc(10))).toThrow(/已关闭/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
