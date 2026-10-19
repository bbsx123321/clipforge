import { VIDEO_ENCODER_CANDIDATES, type VideoEncoderId } from './ffmpeg-args'

/** 单个编码器探测命令：256x256 黑帧 0.2 秒试编码，能出片即视为可用 */
export const buildEncoderProbeArgs = (encoder: VideoEncoderId): readonly string[] => [
  '-hide_banner',
  '-loglevel', 'error',
  '-f', 'lavfi',
  '-i', 'color=black:s=256x256:d=0.2',
  '-c:v', encoder,
  '-f', 'null', '-'
]

/**
 * 按候选顺序探测首个可用编码器（依赖注入 runProbe 以便单测）。
 * 全部失败时返回 libx264 软编兜底，保证录制永远可用。
 */
export const probeFirstAvailableEncoder = async (
  runProbe: (encoder: VideoEncoderId) => Promise<boolean>
): Promise<VideoEncoderId> => {
  for (const encoder of VIDEO_ENCODER_CANDIDATES) {
    if (await runProbe(encoder)) {
      return encoder
    }
  }
  return 'libx264'
}
