import type { Framerate, RecordMode, RecordSettings, RegionRect } from '../../shared/types'

/** 候选视频编码器，按硬编优先排序（探测依次回退） */
export const VIDEO_ENCODER_CANDIDATES = ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264'] as const

export type VideoEncoderId = (typeof VIDEO_ENCODER_CANDIDATES)[number]

/** 是否支持 D3D11 GPU 帧直通编码（无需先下载回内存） */
export const isD3d11PassthroughEncoder = (encoder: VideoEncoderId): boolean =>
  encoder === 'h264_nvenc' || encoder === 'h264_amf'

/** 屏幕输入：ddagrab 滤镜输出 D3D11 硬件帧。
 *  区域/窗口模式用 ddagrab 原生 offset/video_size 在 DXGI 层直接只复制目标矩形——
 *  全 GPU 零拷贝（输出尺寸即区域尺寸），且不经过 GDI（GDI 屏幕捕获在
 *  Electron 子进程中会因 Job UI 限制丢失窗口站读屏权限而挂起）。 */
export const buildScreenInputArgs = (framerate: Framerate, mode: RecordMode): readonly string[] => {
  if (mode.kind === 'fullscreen') {
    return [
      '-f', 'lavfi',
      '-i', `ddagrab=output_idx=${String(mode.outputIndex)}:framerate=${String(framerate)}`
    ]
  }
  const rect = evenCropRect(mode.region)
  return [
    '-f', 'lavfi',
    '-i',
    `ddagrab=output_idx=${String(mode.outputIndex)}:framerate=${String(framerate)}` +
      `:offset_x=${String(rect.x)}:offset_y=${String(rect.y)}` +
      `:video_size=${String(rect.width)}x${String(rect.height)}`
  ]
}

/**
 * 把任意区域收敛为偶数尺寸矩形（纯函数）。
 * 宽高向下收敛为 2 的倍数（编码器要求），向上取整会超出源边界。
 */
export const evenCropRect = (region: RegionRect): RegionRect => ({
  x: Math.max(0, Math.round(region.x)),
  y: Math.max(0, Math.round(region.y)),
  width: Math.max(2, Math.floor(region.width / 2) * 2),
  height: Math.max(2, Math.floor(region.height / 2) * 2)
})

/** 各编码器的视频参数（质量优先：nvenc 用 CQ 恒质量，硬编兜底用码率，软编用 CRF）。
 *  -g 设为帧率（每秒一个关键帧）：剪辑 seek 精度 1 秒，remux 无需重排。 */
export const buildVideoCodecArgs = (encoder: VideoEncoderId, framerate: Framerate): readonly string[] => {
  const gop: string = String(framerate)
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-g', gop]
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'balanced', '-b:v', '20M', '-g', gop]
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-b:v', '20M', '-g', gop]
    case 'libx264':
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', gop]
  }
}

/** 构建视频滤镜链（纯函数）：
 *  - 直通编码（NVENC/AMF）：无滤镜（区域已在 ddagrab 层裁好，GPU 帧直接进编码器）
 *  - 非直通编码（libx264）：hwdownload 下载回内存（bgra 与 ddagrab sw_format 一致） */
export const buildVideoFilterArgs = (encoder: VideoEncoderId): readonly string[] =>
  isD3d11PassthroughEncoder(encoder) ? [] : ['-vf', 'hwdownload,format=bgra']

/**
 * 组装完整录制命令参数（纯函数）。
 * 封装使用 MKV（matroska）：天生流式逐簇写入——既是崩溃安全的录制格式，
 * 也规避了 fragmented MP4 小块写模式被部分安全软件磁盘过滤驱动挂起的问题
 * （实测：movflags 碎片写 28B 卡死，MKV 流式写正常 524KB+）。
 * 停止录制时统一无损 remux 为 MP4（见 recorder/remux.ts）。
 */
export const buildRecordArgs = (settings: RecordSettings, encoder: VideoEncoderId, outputPath: string): readonly string[] => [
  '-hide_banner',
  '-loglevel', 'warning',
  '-y',
  ...buildScreenInputArgs(settings.framerate, settings.mode),
  ...buildVideoFilterArgs(encoder),
  ...buildVideoCodecArgs(encoder, settings.framerate),
  '-f', 'matroska',
  outputPath
]

/**
 * 回退录制参数（纯函数）：gdigrab 用 GDI 在 CPU 侧抓屏 + libx264 软编，
 * 完全不依赖 D3D11 / Desktop Duplication，作为主路径（ddagrab）零产出时的兜底。
 * 同样写入 MKV。
 */
export const buildGdigrabRecordArgs = (settings: RecordSettings, outputPath: string): readonly string[] => {
  const inputArgs: readonly string[] = settings.mode.kind === 'fullscreen'
    ? ['-f', 'gdigrab', '-framerate', String(settings.framerate), '-i', 'desktop']
    : (() => {
        const crop = evenCropRect(settings.mode.region)
        return [
          '-f', 'gdigrab', '-framerate', String(settings.framerate),
          '-offset_x', String(crop.x), '-offset_y', String(crop.y),
          '-video_size', `${String(crop.width)}x${String(crop.height)}`,
          '-i', 'desktop'
        ]
      })()
  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-y',
    ...inputArgs,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', String(settings.framerate),
    '-f', 'matroska',
    outputPath
  ]
}
