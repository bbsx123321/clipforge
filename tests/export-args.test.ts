import { describe, expect, it } from 'vitest'
import { buildExportArgs } from '../src/core/exporting/export-args'
import type { EditProject } from '../src/shared/types'

const ENCODER: readonly string[] = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '30']

describe('导出命令构建（golden）', () => {
  it('单段原速 + 有音轨', () => {
    const project: EditProject = {
      sourceFilePath: 'D:/rec/screen-001.mp4',
      durationSec: 10,
      hasAudio: true,
      segments: [{ startSec: 0, endSec: 10, speed: 1 }]
    }
    expect(buildExportArgs(project, 'D:/out.mp4', ENCODER)).toEqual([
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
      ]
    }
    const args = buildExportArgs(project, 'D:/out.mp4', ENCODER)
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
      segments: [{ startSec: 0, endSec: 10, speed: 3 }]
    }
    const args = buildExportArgs(project, 'o.mp4', ENCODER)
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('atempo=3')
    expect(filter).toContain('setpts=PTS/3')
  })
})
