import { describe, expect, it } from 'vitest'
import {
  buildGdigrabRecordArgs,
  buildRecordArgs,
  buildVideoFilterArgs,
  evenCropRect,
  isD3d11PassthroughEncoder
} from '../src/recorder/ffmpeg/ffmpeg-args'
import { buildRemuxArgs } from '../src/recorder/remux'
import { buildMuxAudioArgs } from '../src/recorder/mux-audio'
import { buildEncoderProbeArgs, probeFirstAvailableEncoder } from '../src/recorder/ffmpeg/encoder-probe'
import type { RecordSettings, RegionRect } from '../src/shared/types'

const FULLSCREEN_30: RecordSettings = {
  mode: { kind: 'fullscreen', outputIndex: 0 },
  framerate: 30,
  captureSystemAudio: false,
  captureMicrophone: false
}

const REGION_60: RecordSettings = {
  mode: { kind: 'region', outputIndex: 1, region: { x: 101, y: 202, width: 963, height: 507 } },
  framerate: 60,
  captureSystemAudio: true,
  captureMicrophone: true
}

describe('FFmpeg 录制参数构建（golden）', () => {
  it('整屏 + NVENC：GPU 帧直通，无滤镜，MKV 流式封装，每秒一个关键帧', () => {
    expect(buildRecordArgs(FULLSCREEN_30, 'h264_nvenc', 'out/screen-001.mkv')).toEqual([
      '-hide_banner',
      '-loglevel', 'warning',
      '-y',
      '-f', 'lavfi',
      '-i', 'ddagrab=output_idx=0:framerate=30',
      '-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-g', '30',
      '-f', 'matroska',
      'out/screen-001.mkv'
    ])
  })

  it('整屏 + libx264：需先 hwdownload 回内存', () => {
    expect(buildRecordArgs(FULLSCREEN_30, 'libx264', 'out/screen-001.mkv')).toEqual([
      '-hide_banner',
      '-loglevel', 'warning',
      '-y',
      '-f', 'lavfi',
      '-i', 'ddagrab=output_idx=0:framerate=30',
      '-vf', 'hwdownload,format=bgra',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '30',
      '-f', 'matroska',
      'out/screen-001.mkv'
    ])
  })

  it('区域 + NVENC：ddagrab 原生区域捕获（DXGI 层裁剪，零滤镜直通）', () => {
    expect(buildRecordArgs(REGION_60, 'h264_nvenc', 'out/screen-001.mkv')).toEqual([
      '-hide_banner',
      '-loglevel', 'warning',
      '-y',
      '-f', 'lavfi',
      '-i', 'ddagrab=output_idx=1:framerate=60:offset_x=101:offset_y=202:video_size=962x506',
      '-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-g', '60',
      '-f', 'matroska',
      'out/screen-001.mkv'
    ])
  })
})

describe('GDI 回退录制参数（golden）', () => {
  it('整屏：gdigrab 抓主显示器 + libx264 软编 + MKV', () => {
    expect(buildGdigrabRecordArgs(FULLSCREEN_30, 'out/fallback.mkv')).toEqual([
      '-hide_banner',
      '-loglevel', 'warning',
      '-y',
      '-f', 'gdigrab', '-framerate', '30', '-i', 'desktop',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '30',
      '-f', 'matroska',
      'out/fallback.mkv'
    ])
  })

  it('区域：offset + 尺寸（偶数收敛）', () => {
    expect(buildGdigrabRecordArgs(REGION_60, 'out/fallback.mkv')).toEqual([
      '-hide_banner',
      '-loglevel', 'warning',
      '-y',
      '-f', 'gdigrab', '-framerate', '60',
      '-offset_x', '101', '-offset_y', '202',
      '-video_size', '962x506',
      '-i', 'desktop',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '60',
      '-f', 'matroska',
      'out/fallback.mkv'
    ])
  })
})

describe('MKV → MP4 无损 remux 参数（golden）', () => {
  it('流拷贝 + faststart', () => {
    expect(buildRemuxArgs('out/screen-001.mkv', 'out/screen-001.mp4')).toEqual([
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', 'out/screen-001.mkv',
      '-c', 'copy',
      '-movflags', '+faststart',
      'out/screen-001.mp4'
    ])
  })
})

describe('音视频合成参数（golden）', () => {
  it('视频流拷贝 + AAC 音频按分段偏移切入 + shortest 对齐', () => {
    expect(buildMuxAudioArgs('out/screen-001.mp4', 'out/audio-mix.wav', 'out/screen-001.muxed.mp4', 1500)).toEqual([
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', 'out/screen-001.mp4',
      '-ss', '1.500', '-i', 'out/audio-mix.wav',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest',
      'out/screen-001.muxed.mp4'
    ])
  })

  it('负偏移收敛为 0（首段对齐会话起点）', () => {
    const args = buildMuxAudioArgs('a.mp4', 'a.wav', 'a.out.mp4', -300)
    expect(args[args.indexOf('-ss') + 1]).toBe('0.000')
  })
})

describe('编码器直通判定', () => {
  it('NVENC 与 AMF 支持 D3D11 直通，QSV 与 libx264 不支持', () => {
    expect(isD3d11PassthroughEncoder('h264_nvenc')).toBe(true)
    expect(isD3d11PassthroughEncoder('h264_amf')).toBe(true)
    expect(isD3d11PassthroughEncoder('h264_qsv')).toBe(false)
    expect(isD3d11PassthroughEncoder('libx264')).toBe(false)
  })
})

describe('区域偶数收敛', () => {
  it('宽高向下收敛为 2 的倍数，坐标与尺寸有下限保护', () => {
    const region: RegionRect = { x: -5, y: 0, width: 3, height: 101 }
    expect(evenCropRect(region)).toEqual({ x: 0, y: 0, width: 2, height: 100 })
  })
})

describe('编码器探测', () => {
  it('按候选顺序返回首个可用编码器', async () => {
    const tried: string[] = []
    const encoder = await probeFirstAvailableEncoder(async (candidate) => {
      tried.push(candidate)
      return candidate === 'h264_amf'
    })
    expect(encoder).toBe('h264_amf')
    expect(tried).toEqual(['h264_nvenc', 'h264_amf'])
  })

  it('全部不可用时回退 libx264', async () => {
    const encoder = await probeFirstAvailableEncoder(async () => false)
    expect(encoder).toBe('libx264')
  })

  it('探测命令为 256x256 黑帧短编码（golden）', () => {
    expect(buildEncoderProbeArgs('h264_nvenc')).toEqual([
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'color=black:s=256x256:d=0.2',
      '-c:v', 'h264_nvenc',
      '-f', 'null', '-'
    ])
  })
})

describe('窗口捕获模式（golden）', () => {
  it('window kind 与区域同参：ddagrab 原生矩形 + 直通编码无滤镜', () => {
    const settings: RecordSettings = {
      mode: { kind: 'window', outputIndex: 0, region: { x: 100, y: 80, width: 1281, height: 721 }, title: '记事本' },
      framerate: 30,
      captureSystemAudio: false,
      captureMicrophone: false
    }
    expect(buildRecordArgs(settings, 'h264_nvenc', 'out/screen-001.mkv')).toEqual([
      '-hide_banner',
      '-loglevel', 'warning',
      '-y',
      '-f', 'lavfi',
      '-i', 'ddagrab=output_idx=0:framerate=30:offset_x=100:offset_y=80:video_size=1280x720',
      '-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-g', '30',
      '-f', 'matroska',
      'out/screen-001.mkv'
    ])
  })
})
