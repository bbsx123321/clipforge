import { describe, expect, it } from 'vitest'
import { buildRecordManifest, buildSegmentFileName } from '../src/core/recording/manifest'
import type { RecordSettings } from '../src/shared/types'

const SETTINGS: RecordSettings = {
  mode: { kind: 'fullscreen', outputIndex: 0 },
  framerate: 60,
  captureSystemAudio: true,
  captureMicrophone: false
}

describe('分段文件名', () => {
  it('从 1 开始三位编号，录制期为 MKV', () => {
    expect(buildSegmentFileName(1)).toBe('screen-001.mkv')
    expect(buildSegmentFileName(7)).toBe('screen-007.mkv')
    expect(buildSegmentFileName(42)).toBe('screen-042.mkv')
  })

  it('非法输入收敛到最小合法值', () => {
    expect(buildSegmentFileName(0)).toBe('screen-001.mkv')
    expect(buildSegmentFileName(-3)).toBe('screen-001.mkv')
  })
})

describe('录制清单组装', () => {
  it('无音频数据时 audio 为 undefined、无警告', () => {
    const manifest = buildRecordManifest({
      sessionId: 'abc',
      startedAtWallMs: 100,
      stoppedAtWallMs: 200,
      settings: SETTINGS,
      segments: [{ file: 'screen-001.mp4', startOffsetMs: 0 }],
      audio: undefined,
      warnings: []
    })
    expect(manifest.version).toBe(1)
    expect(manifest.sessionId).toBe('abc')
    expect(manifest.audio).toBeUndefined()
    expect(manifest.segments).toHaveLength(1)
    expect(manifest.warnings).toHaveLength(0)
  })

  it('有音频数据时完整登记音频参数', () => {
    const manifest = buildRecordManifest({
      sessionId: 'abc',
      startedAtWallMs: 100,
      stoppedAtWallMs: 200,
      settings: SETTINGS,
      segments: [
        { file: 'screen-001.mp4', startOffsetMs: 0 },
        { file: 'screen-002.mp4', startOffsetMs: 1500 }
      ],
      audio: { file: 'audio-mix.wav', sampleRate: 48000, channels: 2, startOffsetMs: 0 },
      warnings: []
    })
    expect(manifest.audio).toEqual({
      file: 'audio-mix.wav',
      sampleRate: 48000,
      channels: 2,
      startOffsetMs: 0
    })
    expect(manifest.segments[1]).toEqual({ file: 'screen-002.mp4', startOffsetMs: 1500 })
  })

  it('产物异常警告完整写入清单', () => {
    const manifest = buildRecordManifest({
      sessionId: 'abc',
      startedAtWallMs: 100,
      stoppedAtWallMs: 200,
      settings: SETTINGS,
      segments: [{ file: 'screen-001.mp4', startOffsetMs: 0 }],
      audio: undefined,
      warnings: ['视频编码进程意外退出，本次录制已终止']
    })
    expect(manifest.warnings).toEqual(['视频编码进程意外退出，本次录制已终止'])
  })
})
