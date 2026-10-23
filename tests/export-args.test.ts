import { describe, expect, it } from 'vitest'
import { buildExportArgs, escapeFilterPath } from '../src/core/exporting/export-args'
import type { EditProject, SubtitleCue, SubtitleStyle } from '../src/shared/types'

const ENCODER: readonly string[] = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '30']
const NO_SUBTITLES = { assPath: undefined, srtPath: undefined }

const STYLE: SubtitleStyle = {
  fontSizePct: 5, position: 'bottom', marginPct: 8,
  textOpacity: 1, boxEnabled: true, boxOpacity: 0.6
}

describe('导出命令构建（golden）', () => {
  it('单段原速 + 有音轨', () => {
    const project: EditProject = {
      sourceFilePath: 'D:/rec/screen-001.mp4',
      durationSec: 10,
      hasAudio: true,
      segments: [{ startSec: 0, endSec: 10, speed: 1 }],
      subtitles: undefined
    }
    expect(buildExportArgs(project, 'D:/out.mp4', ENCODER, NO_SUBTITLES)).toEqual([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', 'D:/rec/screen-001.mp4',
      '-filter_complex',
      '[0:v]trim=start=0.000:end=10.000,setpts=PTS-STARTPTS[v0];' +
        '[0:a]atrim=start=0.000:end=10.000,asetpts=PTS-STARTPTS[a0];' +
        '[v0][a0]concat=n=1:v=1:a=1[vout][aout]',
      '-map', '[vout]', '-map', '[aout]',
      ...ENCODER,
      '-movflags', '+faststart',
      'D:/out.mp4'
    ])
  })

  it('多段含变速 + 无音轨（跳过音频链）', () => {
    const project: EditProject = {
      sourceFilePath: 'D:/rec/screen-001.mp4',
      durationSec: 100,
      hasAudio: false,
      segments: [
        { startSec: 2, endSec: 10, speed: 1 },
        { startSec: 10, endSec: 30, speed: 2 }
      ],
      subtitles: undefined
    }
    const args = buildExportArgs(project, 'D:/out.mp4', ENCODER, NO_SUBTITLES)
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toBe(
      '[0:v]trim=start=2.000:end=10.000,setpts=PTS-STARTPTS[v0];' +
        '[0:v]trim=start=10.000:end=30.000,setpts=PTS-STARTPTS,setpts=PTS/2[v1];' +
        '[v0][v1]concat=n=2:v=1:a=0[vout]'
    )
    expect(args).not.toContain('[aout]')
  })

  it('变速段包含 atempo 音频链', () => {
    const project: EditProject = {
      sourceFilePath: 'x.mp4',
      durationSec: 10,
      hasAudio: true,
      segments: [{ startSec: 0, endSec: 10, speed: 3 }],
      subtitles: undefined
    }
    const args = buildExportArgs(project, 'o.mp4', ENCODER, NO_SUBTITLES)
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('atempo=3')
    expect(filter).toContain('setpts=PTS/3')
  })

  it('烧录字幕：concat 后套 subtitles 滤镜（Windows 路径转义）', () => {
    const project: EditProject = {
      sourceFilePath: 'D:/rec/a.mp4',
      durationSec: 10,
      hasAudio: true,
      segments: [{ startSec: 0, endSec: 10, speed: 1 }],
      subtitles: { cues: [], style: STYLE, options: { burn: true, srtFile: false, softTrack: false } }
    }
    const args = buildExportArgs(project, 'D:/out.mp4', ENCODER, {
      assPath: 'D:\\rec\\.export-sub.ass',
      srtPath: undefined
    })
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain("[vout]subtitles=filename='D\\:/rec/.export-sub.ass'[vsub]")
    expect(args).toContain('-map')
    expect(args).toContain('[vsub]')
    expect(args).not.toContain('mov_text')
  })

  it('软字幕轨：第二输入 srt + mov_text 映射', () => {
    const project: EditProject = {
      sourceFilePath: 'D:/rec/a.mp4',
      durationSec: 10,
      hasAudio: true,
      segments: [{ startSec: 0, endSec: 10, speed: 1 }],
      subtitles: { cues: [], style: STYLE, options: { burn: false, srtFile: false, softTrack: true } }
    }
    const args = buildExportArgs(project, 'D:/out.mp4', ENCODER, {
      assPath: undefined,
      srtPath: 'D:/rec/.export-sub.srt'
    })
    const inputIndex = args.indexOf('-i')
    expect(args[inputIndex + 1]).toBe('D:/rec/a.mp4')
    expect(args.filter((arg) => arg === '-i').length).toBe(2)
    expect(args).toContain('-map')
    expect(args).toContain('1:0')
    expect(args).toContain('mov_text')
  })
})

describe('滤镜路径转义', () => {
  it('反斜杠转正斜杠、冒号转义', () => {
    expect(escapeFilterPath('C:\\Users\\boss\\x.ass')).toBe('C\\:/Users/boss/x.ass')
    expect(escapeFilterPath('D:/rec/sub.ass')).toBe('D\\:/rec/sub.ass')
  })
})
