import { describe, expect, it } from 'vitest'
import { buildWhisperArgs } from '../src/recorder/asr/whisper-args'
import { buildAsrWavArgs, buildWaveformPcmArgs } from '../src/recorder/asr/asr-ffmpeg-args'

describe('whisper-cli 参数构建（golden）', () => {
  it('模型/输入/JSON 输出/进度/线程', () => {
    expect(buildWhisperArgs('model.bin', 'in.wav', 'out-prefix', 4)).toEqual([
      '-m', 'model.bin',
      '-f', 'in.wav',
      '-l', 'auto',
      '-oj',
      '-of', 'out-prefix',
      '-pp',
      '-t', '4'
    ])
  })
})

describe('识别链路 FFmpeg 参数构建（golden）', () => {
  it('切 16k mono wav：-ss 输入级定位 + 时长钳制', () => {
    expect(buildAsrWavArgs('mic.wav', 0, 61.5, 'out.wav')).toEqual([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', '0.000',
      '-t', '61.500',
      '-i', 'mic.wav',
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      'out.wav'
    ])
    expect(buildAsrWavArgs('mic.wav', -3, 10, 'out.wav')[5]).toBe('0.000')
  })

  it('波形提取：首音轨 → s16le 原始 PCM 到 stdout', () => {
    expect(buildWaveformPcmArgs('v.mp4')).toEqual([
      '-hide_banner', '-loglevel', 'error',
      '-i', 'v.mp4',
      '-map', '0:a:0',
      '-ar', '16000',
      '-ac', '1',
      '-f', 's16le',
      '-'
    ])
  })
})
