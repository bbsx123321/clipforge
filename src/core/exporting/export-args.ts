import type { EditProject } from '../../shared/types'

/**
 * 剪辑导出命令构建（纯函数）：
 * EditProject → FFmpeg 参数。每个片段 trim 出源区间，视频 setpts / 音频 atempo 变速，
 * 最后 concat 拼接为一条成片。视频编码参数由调用方注入（硬编探测结果或软编兜底）。
 * 字幕（可选）：烧录 = concat 之后套 subtitles 滤镜（ASS 为成片时间轴，天然对齐）；
 * 软字幕轨 = 第二输入 .srt + mov_text。两种方式可组合。
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

/** 字幕文件输入（由主进程在导出前生成；undefined = 不启用该方式） */
export type ExportSubtitleInputs = {
  /** 烧录用 ASS（成片时间轴） */
  readonly assPath: string | undefined
  /** 软字幕轨输入 SRT（成片时间轴） */
  readonly srtPath: string | undefined
}

/** FFmpeg 滤镜路径转义：反斜杠转正斜杠、盘符冒号转义（subtitles 滤镜用） */
export const escapeFilterPath = (filePath: string): string =>
  filePath.replace(/\\/g, '/').replace(/:/g, '\\:')

/** 构建完整导出参数（golden 快照测试锁定格式） */
export const buildExportArgs = (
  project: EditProject,
  outputPath: string,
  videoEncoderArgs: readonly string[],
  subtitleInputs: ExportSubtitleInputs
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
  // 烧录：concat 输出后套 subtitles 滤镜（ass 已是成片时间轴）
  const burnFilter: string | undefined = subtitleInputs.assPath !== undefined
    ? `[vout]subtitles=filename='${escapeFilterPath(subtitleInputs.assPath)}'[vsub]`
    : undefined
  const concat: string = project.hasAudio
    ? `${videoLabels.join('')}${audioLabels.join('')}concat=n=${String(segments.length)}:v=1:a=1[vout][aout]`
    : `${videoLabels.join('')}concat=n=${String(segments.length)}:v=1:a=0[vout]`
  const filterGraph: string = burnFilter !== undefined
    ? `${chains.join(';')};${concat};${burnFilter}`
    : `${chains.join(';')};${concat}`
  const videoMap: string = burnFilter !== undefined ? '[vsub]' : '[vout]'
  const maps: readonly string[] = project.hasAudio
    ? ['-map', videoMap, '-map', '[aout]']
    : ['-map', videoMap]
  const args: string[] = [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', project.sourceFilePath
  ]
  // 软字幕轨：第二输入 SRT + 流映射
  if (subtitleInputs.srtPath !== undefined) {
    args.push('-i', subtitleInputs.srtPath)
  }
  args.push(
    '-filter_complex', filterGraph,
    ...maps
  )
  if (subtitleInputs.srtPath !== undefined) {
    args.push('-map', '1:0', '-c:s', 'mov_text')
  }
  args.push(
    ...videoEncoderArgs,
    '-movflags', '+faststart',
    outputPath
  )
  return args
}
