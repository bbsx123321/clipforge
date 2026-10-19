import { renameSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { runFfmpegOnce } from './ffmpeg/ffmpeg-run'

/**
 * 音视频合成：把整段混音 WAV 按「分段起始偏移」切出对应区间，
 * 与视频分段封装为同一个 MP4（视频流 copy 零重编码，音频转 AAC）。
 */

/** 合成超时：分钟级视频的 AAC 编码也在秒级完成，给足余量 */
const MUX_TIMEOUT_MS: number = 180000

/** 每秒 1 个分段时偏移精度 0.001s 足够 */
const formatOffsetSec = (startOffsetMs: number): string => (Math.max(0, startOffsetMs) / 1000).toFixed(3)

/** 音视频合成命令参数（纯函数，供 golden 测试）：
 *  -ss 置于音频输入之前 = 输入级定位（WAV PCM 下快速且精确），
 *  -shortest 使音频在视频流结束时截断（对齐分段时长）。 */
export const buildMuxAudioArgs = (
  videoPath: string,
  audioPath: string,
  outputPath: string,
  audioStartOffsetMs: number
): readonly string[] => [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-i', videoPath,
  '-ss', formatOffsetSec(audioStartOffsetMs), '-i', audioPath,
  '-c:v', 'copy',
  '-c:a', 'aac', '-b:a', '192k',
  '-shortest',
  outputPath
]

/** 音视频合成结果 */
export type MuxOutcome =
  | { readonly ok: true; readonly muxedFile: string }
  | { readonly ok: false; readonly reason: string }

/** 把混音 WAV 的对应区间合入视频分段：
 *  输出到临时名成功后原子替换原 MP4；失败时原无声 MP4 与 WAV 均保留。 */
export const muxAudioIntoVideoSegment = async (
  ffmpegPath: string,
  rootDir: string,
  videoFile: string,
  audioFile: string,
  audioStartOffsetMs: number
): Promise<MuxOutcome> => {
  const videoPath: string = path.join(rootDir, videoFile)
  const muxedFile: string = `${videoFile.replace(/\.mp4$/, '')}.muxed.mp4`
  const muxedPath: string = path.join(rootDir, muxedFile)
  const succeeded: boolean = await runFfmpegOnce(
    ffmpegPath,
    buildMuxAudioArgs(videoPath, path.join(rootDir, audioFile), muxedPath, audioStartOffsetMs),
    MUX_TIMEOUT_MS
  )
  if (!succeeded) {
    return { ok: false, reason: `分段 ${videoFile} 音频合成失败（无声版与 audio-mix.wav 均已保留）` }
  }
  try {
    if (statSync(muxedPath).size < 1024) {
      return { ok: false, reason: `分段 ${videoFile} 音频合成产物异常（无声版与 audio-mix.wav 均已保留）` }
    }
  } catch {
    return { ok: false, reason: `分段 ${videoFile} 音频合成产物未生成（无声版与 audio-mix.wav 均已保留）` }
  }
  unlinkSync(videoPath)
  renameSync(muxedPath, videoPath)
  return { ok: true, muxedFile: videoFile }
}
