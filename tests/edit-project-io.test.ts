import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  DEFAULT_SUBTITLE_STYLE,
  defaultEditProjectFile,
  editProjectFileName,
  loadEditProjectFile,
  saveEditProjectFile,
  updateEditProjectFile
} from '../src/core/subtitles/edit-project-io'

const makeTempDir = (): string => mkdtempSync(path.join(tmpdir(), 'edit-project-'))

describe('字幕工程文件读写', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('工程文件名：视频段名换后缀', () => {
    expect(editProjectFileName('screen-001.mp4')).toBe('screen-001.edit.json')
    expect(editProjectFileName('screen-002.mkv')).toBe('screen-002.edit.json')
  })

  it('不存在 → 默认工程（全片单段 + 默认样式）', () => {
    const dir = dirs.push(makeTempDir()) > 0 ? dirs[dirs.length - 1] as string : ''
    const file = loadEditProjectFile(dir, 'screen-001.mp4', 120)
    expect(file.segments).toEqual([{ startSec: 0, endSec: 120, speed: 1 }])
    expect(file.cues).toEqual([])
    expect(file.style).toEqual(DEFAULT_SUBTITLE_STYLE)
    expect(file.asr.status).toBe('none')
  })

  it('保存后读回：剪辑片段 + cues + 样式 + asr 状态', () => {
    const dir = makeTempDir()
    dirs.push(dir)
    const project = {
      ...defaultEditProjectFile('screen-001.mp4', 100),
      segments: [{ startSec: 5, endSec: 80, speed: 2 }],
      cues: [{ id: 'c1', startSec: 5, endSec: 8, text: '你好' }],
      asr: { status: 'ready' as const, progress: 100, error: undefined }
    }
    saveEditProjectFile(dir, project)
    const loaded = loadEditProjectFile(dir, 'screen-001.mp4', 100)
    expect(loaded.segments).toEqual(project.segments)
    expect(loaded.cues).toEqual(project.cues)
    expect(loaded.asr.status).toBe('ready')
  })

  it('损坏 JSON → 回退默认工程', () => {
    const dir = makeTempDir()
    dirs.push(dir)
    writeFileSync(path.join(dir, 'screen-001.edit.json'), '{broken', 'utf8')
    const file = loadEditProjectFile(dir, 'screen-001.mp4', 50)
    expect(file.segments.length).toBe(1)
    expect(file.cues).toEqual([])
  })

  it('updateEditProjectFile：读-合并-写（识别任务更新 asr）', () => {
    const dir = makeTempDir()
    dirs.push(dir)
    saveEditProjectFile(dir, defaultEditProjectFile('screen-001.mp4', 60))
    const merged = updateEditProjectFile(dir, 'screen-001.mp4', 60, {
      asr: { status: 'pending', progress: 40, error: undefined }
    })
    expect(merged.asr.progress).toBe(40)
    expect(loadEditProjectFile(dir, 'screen-001.mp4', 60).asr.status).toBe('pending')
  })

  it('非法字段被清洗：样式钳制、非法 cue/segment 丢弃', () => {
    const dir = makeTempDir()
    dirs.push(dir)
    const raw = {
      version: 1,
      sourceFile: 'screen-001.mp4',
      segments: [{ startSec: 0, endSec: -5, speed: 1 }, { startSec: 0, endSec: 30, speed: 1 }],
      cues: [{ id: 'ok', startSec: 1, endSec: 2, text: 'ok' }, { id: 'bad', startSec: 5, endSec: 5, text: '零长' }],
      style: { fontSizePct: 999, position: 'middle', marginPct: -1, textOpacity: 5, boxEnabled: 'yes', boxOpacity: 0.5 },
      waveform: [0.5, 2, -1, 'x', 0.2],
      asr: { status: 'weird', progress: 500 }
    }
    writeFileSync(path.join(dir, 'screen-001.edit.json'), JSON.stringify(raw), 'utf8')
    const file = loadEditProjectFile(dir, 'screen-001.mp4', 60)
    expect(file.segments.length).toBe(1)
    expect(file.cues.map((cue) => cue.id)).toEqual(['ok'])
    expect(file.style.fontSizePct).toBeLessThanOrEqual(12)
    expect(file.style.position).toBe('bottom')
    expect(file.waveform).toEqual([0.5, 0.2])
    expect(file.asr.status).toBe('none')
    expect(file.asr.progress).toBe(100)
  })
})
