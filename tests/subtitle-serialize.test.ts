import { describe, expect, it } from 'vitest'
import { parseWhisperJson, toAss, toSrt } from '../src/core/subtitles/subtitle-serialize'
import { DEFAULT_SUBTITLE_STYLE } from '../src/core/subtitles/edit-project-io'
import type { SubtitleCue } from '../src/shared/types'

const cue = (id: string, startSec: number, endSec: number, text: string): SubtitleCue => ({
  id, startSec, endSec, text
})

describe('whisper JSON 解析', () => {
  it('解析 b5454 实测格式（offsets 毫秒 + transcription 数组）', () => {
    const json: string = JSON.stringify({
      result: { language: 'en' },
      transcription: [
        { timestamps: { from: '00:00:00,000', to: '00:00:05,920' }, offsets: { from: 0, to: 5920 }, text: ' Hello world.' },
        { timestamps: { from: '00:00:06,000', to: '00:00:09,500' }, offsets: { from: 6000, to: 9500 }, text: ' Second line.' }
      ]
    })
    const cues = parseWhisperJson(json)
    expect(cues.length).toBe(2)
    expect(cues[0]?.startSec).toBe(0)
    expect(cues[0]?.endSec).toBeCloseTo(5.92)
    expect(cues[1]?.text).toBe('Second line.')
  })

  it('丢弃空文本与非法时间条目；坏 JSON 返回空', () => {
    const json: string = JSON.stringify({
      transcription: [
        { offsets: { from: 1000, to: 2000 }, text: '   ' },
        { offsets: { from: 3000, to: 2500 }, text: '时间倒置' },
        { offsets: { from: 1000, to: 2000 }, text: 'ok' }
      ]
    })
    expect(parseWhisperJson(json).length).toBe(1)
    expect(parseWhisperJson('not json')).toEqual([])
  })
})

describe('SRT 序列化', () => {
  it('序号、时间戳与多行文本', () => {
    const srt = toSrt([
      cue('a', 0, 5.5, '第一行\n第二行'),
      cue('b', 61.25, 62, 'next')
    ])
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:05,500\n第一行\n第二行')
    expect(srt).toContain('2\n00:01:01,250 --> 00:01:02,000\nnext')
  })
})

describe('ASS 序列化（烧录样式）', () => {
  it('PlayRes/字号/位置/边距按视频尺寸换算，黑底透明度映射 AA', () => {
    const ass = toAss([cue('a', 1, 2, 'hello')], DEFAULT_SUBTITLE_STYLE, 1920, 1080)
    expect(ass).toContain('PlayResX: 1920')
    expect(ass).toContain('PlayResY: 1080')
    // 字号 = 1080×5% = 54；边距 = 1080×8% ≈ 86；盒不透明度 0.6 → AA = (1-0.6)×255 = 102 = 0x66
    expect(ass).toMatch(/Style: Sub,Microsoft YaHei,54,/)
    expect(ass).toMatch(/,3,1,0,2,40,40,86,1/)
    // 文字不透明度 1 → PrimaryColour = &H00FFFFFF；盒色 = &H66000000
    expect(ass).toContain('&H00FFFFFF,')
    expect(ass).toContain('&H66000000')
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:02.00,Sub,,0,0,0,,hello')
  })

  it('顶部位置 → Alignment 8；无盒 → BorderStyle 1', () => {
    const ass = toAss([], { ...DEFAULT_SUBTITLE_STYLE, position: 'top', boxEnabled: false }, 1280, 720)
    expect(ass).toMatch(/,1,1,0,8,/)
  })
})
