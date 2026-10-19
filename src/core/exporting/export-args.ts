import type { EditProject } from '../../shared/types'

/**
 * 剪辑导出命令构建（纯函数）：
 * EditProject → FFmpeg 参数。每个片段 trim 出源区间，视频 setpts / 音频 atempo 变速，
 * 最后 concat 拼接为一条成片。视频编码参数由调用方注入（硬编探测结果或软编兜底）。
 */

const fmt = (seconds: number): string => seconds.toFixed(3)

/** 单片段的滤镜链（视频部分） */
const videoChain = (index: number, startSec: number, endSec: number, speed: number): string => {
  const trim = `trim=start=${fmt(startSec)}:end=${fmt(endSec)},setpts=PTS-STARTPTS`
  const tempo = speed !== 1 ? `,setpts=PTS/${String(speed)}` : ''
  return `[0:v]${trim}${tempo}[v${String(index)}]`
}

/** 单片段的滤镜链（音频部分；无音轨时由调用方整体跳过） */
const audioChain = (index: number, startSec: number, endSec: number, speed: number): string => {
  const trim = `atrim=start=${fmt(startSec)}:end=${fmt(endSec)},asetpts=PTS-STARTPTS`
  const tempo = speed !== 1 ? `,atempo=${String(speed)}` : ''
  return `[0:a]${trim}${tempo}[a${String(index)}]`
}

/** 构建完整导出参数（golden 快照测试锁定格式） */
export const buildExportArgs = (
  project: EditProject,
  outputPath: string,
  videoEncoderArgs: readonly string[]
): readonly string[] => {
  const segments = project.segments
  const videoLabels: string[] = []
  const audioLabels: string[] = []
  const chains: string[] = []
  segments.forEach((segment, index) => {
    chains.push(videoChain(index, segment.startSec, segment.endSec, segment.speed))
    videoLabels.push(`[v${String(index)}]`)
    if (project.hasAudio) {
      chains.push(audioChain(index, segment.startSec, segment.endSec, segment.speed))
      audioLabels.push(`[a${String(index)}]`)
    }
  })
  const concat: string = project.hasAudio
    ? `${videoLabels.join('')}${audioLabels.join('')}concat=n=${String(segments.length)}:v=1:a=1[vout][aout]`
    : `${videoLabels.join('')}concat=n=${String(segments.length)}:v=1:a=0[vout]`
  const maps: readonly string[] = project.hasAudio ? ['-map', '[vout]', '-map', '[aout]'] : ['-map', '[vout]']
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', project.sourceFilePath,
    '-filter_complex', `${chains.join(';')};${concat}`,
    ...maps,
    ...videoEncoderArgs,
    '-movflags', '+faststart',
    outputPath
  ]
}
