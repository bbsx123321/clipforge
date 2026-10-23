/**
 * 字幕识别链路的 FFmpeg 参数构建（纯函数，golden 测试锁定）：
 * - buildAsrWavArgs：麦克风 WAV 切首段区间 → 16kHz mono wav（whisper 输入要求）
 * - buildWaveformPcmArgs：视频音轨 → 16kHz mono s16le 原始 PCM 到 stdout（波形峰值扫描）
 */

/** 切识别输入 wav：-ss 输入级定位（与混音 mux 同款），首段 offset 恒 0 */
export const buildAsrWavArgs = (
  sourceWav: string,
  startSec: number,
  durationSec: number,
  outputWav: string
): readonly string[] => [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-ss', (Math.max(0, startSec)).toFixed(3),
  '-t', (Math.max(0, durationSec)).toFixed(3),
  '-i', sourceWav,
  '-ar', '16000',
  '-ac', '1',
  '-c:a', 'pcm_s16le',
  outputWav
]

/** 波形提取：无音轨时 ffmpeg 非零退出，调用方以空波形兜底 */
export const buildWaveformPcmArgs = (videoPath: string): readonly string[] => [
  '-hide_banner',
  '-loglevel', 'error',
  '-i', videoPath,
  '-map', '0:a:0',
  '-ar', '16000',
  '-ac', '1',
  '-f', 's16le',
  '-'
]
