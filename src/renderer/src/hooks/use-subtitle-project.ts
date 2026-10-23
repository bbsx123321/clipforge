import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AsrStatus,
  EditProjectFile,
  EditSegment,
  RecordingSummary,
  SubtitleCue,
  SubtitleStyle
} from '../../../shared/types'
import { DEFAULT_SUBTITLE_STYLE } from '../../../core/subtitles/edit-project-io'
import { addCue, clearAllCues, nextCueId, removeCue, updateCueText, updateCueTime } from '../../../core/subtitles/cue-ops'

/**
 * 字幕工程 hook：
 * - 挂载时 loadEditProject（主进程按需生成波形），segments 经 onProjectLoaded 回调父组件恢复
 * - 识别进度事件匹配当前工程；进度到 100 后延迟重载（获取识别出的 cues）
 * - cues 增删改/样式/segments 更新器内部维护最新值并 1s 防抖全量保存；flush 供关闭时立即落盘
 * 注意：识别进行中主进程也会写工程文件（进度/asr 状态），此窗口内用户编辑存在覆盖竞态，
 * 属低频场景（识别通常数十秒内完成），接受该限制。
 */

export type SubtitleProjectState = {
  readonly loaded: boolean
  readonly cues: readonly SubtitleCue[]
  readonly style: SubtitleStyle
  readonly waveform: readonly number[]
  readonly asrStatus: AsrStatus
  readonly asrProgress: number
  readonly asrError: string | undefined
}

/** cue 高级操作集（cue-ops 纯函数封装；durationSec 为源视频时长） */
export type SubtitleCueActions = {
  /** 在指定时间新建 cue（默认 3 秒），返回新 id */
  readonly addAt: (seconds: number, durationSec: number) => string
  /** 拖动/调边后的新时间（内部钳制排序） */
  readonly move: (id: string, startSec: number, endSec: number, durationSec: number) => void
  readonly updateText: (id: string, text: string) => void
  readonly remove: (id: string) => void
  readonly clearAll: () => void
}

export type SubtitleProjectHandle = {
  readonly state: SubtitleProjectState
  readonly cueActions: SubtitleCueActions
  /** 替换样式 */
  readonly updateStyle: (next: SubtitleStyle) => void
  /** 通知 segments 变化（EditorView 持有 segments 状态） */
  readonly updateSegments: (next: readonly EditSegment[]) => void
  /** 立即落盘待保存内容（编辑器关闭前调用） */
  readonly flush: () => void
}

/** 工程文件内容变化回调（挂载加载与识别完成后重载都会触发；segments 由父组件恢复） */
export type OnProjectLoaded = (file: EditProjectFile) => void

export const useSubtitleProject = (
  summary: RecordingSummary,
  onProjectLoaded: OnProjectLoaded
): SubtitleProjectHandle => {
  const [state, setState] = useState<SubtitleProjectState>({
    loaded: false,
    cues: [],
    style: DEFAULT_SUBTITLE_STYLE,
    waveform: [],
    asrStatus: 'none',
    asrProgress: 0,
    asrError: undefined
  })
  const segmentsRef = useRef<readonly EditSegment[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dirtyRef = useRef<boolean>(false)
  const stateRef = useRef<SubtitleProjectState>(state)
  const loadedCbRef = useRef<OnProjectLoaded>(onProjectLoaded)
  stateRef.current = state
  loadedCbRef.current = onProjectLoaded

  const applyFile = useCallback((file: EditProjectFile): void => {
    setState({
      loaded: true,
      cues: file.cues,
      style: file.style,
      waveform: file.waveform,
      asrStatus: file.asr.status,
      asrProgress: file.asr.progress,
      asrError: file.asr.error
    })
    segmentsRef.current = file.segments
    loadedCbRef.current(file)
  }, [])

  const reload = useCallback((): void => {
    void window.api
      .loadEditProject(summary.dirPath, summary.file, summary.durationSec, summary.hasAudio)
      .then(applyFile)
      .catch(() => undefined)
  }, [applyFile, summary.dirPath, summary.file, summary.durationSec, summary.hasAudio])

  // 挂载：加载工程（仅一次）
  useEffect(() => {
    reload()
  }, [reload])

  // 订阅识别进度：匹配当前工程；完成（100%）后延迟重载取 cues
  useEffect(() => {
    const unsubscribe = window.api.onSubtitleProgress((event) => {
      if (event.dirPath !== summary.dirPath || event.videoFile !== summary.file) {
        return
      }
      const current: SubtitleProjectState = stateRef.current
      setState({
        ...current,
        asrStatus: 'pending',
        asrProgress: event.progress,
        asrError: undefined
      })
      if (event.progress >= 100) {
        setTimeout(reload, 600)
      }
    })
    return unsubscribe
  }, [reload, summary.dirPath, summary.file])

  /** 按当前 stateRef/segmentsRef 组装工程并保存 */
  const saveNow = useCallback((): void => {
    if (!dirtyRef.current) {
      return
    }
    dirtyRef.current = false
    const current: SubtitleProjectState = stateRef.current
    const file: EditProjectFile = {
      version: 1,
      sourceFile: summary.file,
      segments: segmentsRef.current,
      cues: current.cues,
      style: current.style,
      waveform: current.waveform,
      asr: { status: current.asrStatus, progress: current.asrProgress, error: current.asrError }
    }
    void window.api.saveEditProject(summary.dirPath, file).catch(() => undefined)
  }, [summary.dirPath, summary.file])

  /** 防抖 1s 保存（更新器都会先写 refs 再调度） */
  const scheduleSave = useCallback((): void => {
    dirtyRef.current = true
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout((): void => {
      timerRef.current = undefined
      saveNow()
    }, 1000)
  }, [saveNow])

  const updateCues = useCallback((next: readonly SubtitleCue[]): void => {
    setState((prev) => ({ ...prev, cues: next }))
    scheduleSave()
  }, [scheduleSave])

  /** cue 操作集：从 stateRef 取当前 cues，经 cue-ops 纯函数变换后更新 */
  const cueActions: SubtitleCueActions = {
    addAt: (seconds: number, durationSec: number): string => {
      const id: string = nextCueId()
      const end: number = Math.min(seconds + 3, durationSec)
      updateCues(addCue(stateRef.current.cues, {
        id,
        startSec: Math.min(seconds, Math.max(0, durationSec - 0.2)),
        endSec: end,
        text: ''
      }, durationSec))
      return id
    },
    move: (id: string, startSec: number, endSec: number, durationSec: number): void => {
      updateCues(updateCueTime(stateRef.current.cues, id, startSec, endSec, durationSec))
    },
    updateText: (id: string, text: string): void => {
      updateCues(updateCueText(stateRef.current.cues, id, text))
    },
    remove: (id: string): void => {
      updateCues(removeCue(stateRef.current.cues, id))
    },
    clearAll: (): void => {
      updateCues(clearAllCues())
    }
  }

  const updateStyle = useCallback((next: SubtitleStyle): void => {
    setState((prev) => ({ ...prev, style: next }))
    scheduleSave()
  }, [scheduleSave])

  const updateSegments = useCallback((next: readonly EditSegment[]): void => {
    segmentsRef.current = next
    scheduleSave()
  }, [scheduleSave])

  const flush = useCallback((): void => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    saveNow()
  }, [saveNow])

  // 卸载：未保存内容立即落盘
  useEffect(() => {
    const save = saveNow
    return () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current)
        timerRef.current = undefined
      }
      save()
    }
  }, [saveNow])

  return { state, cueActions, updateStyle, updateSegments, flush }
}
