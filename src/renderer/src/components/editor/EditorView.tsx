import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  applySpeedToRange,
  exportedDurationSec,
  normalizeRange,
  removeRange
} from '../../../../core/editing/segment-ops'
import { mediaUrlFor } from '../../../../shared/media-url'
import type { EditSegment, EditProject, RecordingSummary } from '../../../../shared/types'
import { DRAG_STYLE, NO_DRAG_STYLE } from '../../drag-style'
import { useT } from '../../i18n'
import {
  IconBack,
  IconExport,
  IconFast,
  IconPause,
  IconPlay,
  IconScissors,
  IconTrash,
  IconUndo
} from '../icons'
import { BADGE_CLS, BTN, NOTICE_CLS } from '../../ui'
import { TimelineTrack } from './TimelineTrack'

/** 编辑器视图属性 */
export type EditorViewProps = {
  readonly summary: RecordingSummary
  readonly onClose: () => void
}

/** 秒 → m:ss */
const clock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

/** 播放倍速档位（点击循环） */
const RATES: readonly number[] = [1, 1.5, 2, 4]
/** 加速档位（作用于选区，点击循环应用） */
const SPEED_STEPS: readonly number[] = [1.5, 2, 3, 4]
const ICON_CLS = 'h-3.5 w-3.5'

/** 内嵌播放器 + 轻量剪辑：滑轨 seek、倍速播放、轨道选区裁剪/加速/删除、导出 MP4 */
export const EditorView = (props: EditorViewProps): JSX.Element => {
  const { summary } = props
  const { t } = useT()
  const videoRef = useRef<HTMLVideoElement | undefined>(undefined)
  const [playing, setPlaying] = useState<boolean>(false)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [rateIndex, setRateIndex] = useState<number>(0)
  const [segments, setSegments] = useState<readonly EditSegment[]>([
    { startSec: 0, endSec: summary.durationSec, speed: 1 }
  ])
  const [history, setHistory] = useState<readonly (readonly EditSegment[])[]>([])
  const [trimMode, setTrimMode] = useState<boolean>(false)
  const [pointA, setPointA] = useState<number | undefined>(undefined)
  const [pointB, setPointB] = useState<number | undefined>(undefined)
  const [speedStep, setSpeedStep] = useState<number>(0)
  const [exporting, setExporting] = useState<boolean>(false)
  const [notice, setNotice] = useState<string>('')

  const duration: number = Math.max(summary.durationSec, 0.001)
  const selection = pointA !== undefined && pointB !== undefined ? normalizeRange(pointA, pointB) : undefined

  // 播放倍速切换即时生效
  useEffect(() => {
    const video = videoRef.current
    if (video !== undefined) {
      video.playbackRate = RATES[rateIndex] ?? 1
    }
  }, [rateIndex])

  const togglePlay = (): void => {
    const video = videoRef.current
    if (video === undefined) {
      return
    }
    if (video.paused) {
      // play() 可能因加载失败/策略被拒——显式提示而不是静默无反应
      video.play().catch((error: unknown) => {
        setNotice(t('editor.playFail', { msg: error instanceof Error ? error.message : String(error) }))
      })
    } else {
      video.pause()
    }
  }

  const seekTo = (seconds: number): void => {
    const video = videoRef.current
    if (video !== undefined) {
      video.currentTime = seconds
      setCurrentTime(seconds)
    }
  }

  /** 操作入栈（供撤销），应用新片段列表 */
  const commitSegments = (next: readonly EditSegment[]): void => {
    setHistory((prev) => [...prev.slice(-19), segments])
    setSegments(next)
  }

  /** 轨道拾取：选区模式下第一点=起点、第二点=终点 */
  const pickPoint = (seconds: number): void => {
    if (pointA === undefined || (pointA !== undefined && pointB !== undefined)) {
      setPointA(seconds)
      setPointB(undefined)
      return
    }
    setPointB(seconds)
  }

  /** 拖动「开始/结束」标记微调裁剪边界（限制在时长内） */
  const movePoint = (which: 'a' | 'b', seconds: number): void => {
    const clamped: number = Math.min(Math.max(0, seconds), duration)
    if (which === 'a') {
      setPointA(clamped)
    } else {
      setPointB(clamped)
    }
  }

  const applySpeed = (): void => {
    if (selection === undefined) {
      setNotice(t('editor.needSelectionSpeed'))
      return
    }
    const nextSpeed: number = SPEED_STEPS[speedStep] ?? 1.5
    commitSegments(applySpeedToRange(segments, selection[0], selection[1], nextSpeed))
    setSpeedStep((speedStep + 1) % SPEED_STEPS.length)
    setNotice(t('editor.speedApplied', { n: nextSpeed }))
  }

  const deleteSelection = (): void => {
    if (selection === undefined) {
      setNotice(t('editor.needSelectionDelete'))
      return
    }
    commitSegments(removeRange(segments, selection[0], selection[1]))
    setNotice(t('editor.deleted'))
    setPointA(undefined)
    setPointB(undefined)
  }

  const undo = (): void => {
    if (history.length === 0) {
      setNotice(t('editor.nothingToUndo'))
      return
    }
    const last = history[history.length - 1]
    if (last === undefined) {
      return
    }
    setSegments(last)
    setHistory(history.slice(0, -1))
    setNotice(t('editor.undone'))
  }

  const runExport = (): void => {
    if (segments.length === 0) {
      setNotice(t('editor.allDeleted'))
      return
    }
    setExporting(true)
    setNotice(t('editor.exporting'))
    const project: EditProject = {
      sourceFilePath: summary.filePath,
      durationSec: summary.durationSec,
      hasAudio: summary.hasAudio,
      segments
    }
    void window.api
      .exportEdited(project)
      .then((result) => {
        setNotice(result.ok ? t('editor.exportedOk', { path: result.outputPath }) : t('editor.exportFail', { msg: result.error }))
      })
      .catch((error: unknown) => {
        setNotice(t('editor.exportFail', { msg: error instanceof Error ? error.message : String(error) }))
      })
      .finally(() => setExporting(false))
  }

  return (
    <div className="flex h-full w-full flex-col gap-2.5 rounded-2xl bg-neutral-900/90 p-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
      {/* 标题行（空白区域可拖动窗口） */}
      <div className="flex items-center gap-2 px-1" style={DRAG_STYLE}>
        <span style={NO_DRAG_STYLE}>
          <button className={`${BTN.ghost} h-7 w-7 !px-0`} onClick={props.onClose} title={t('editor.back')}>
            <IconBack className={ICON_CLS} />
          </button>
        </span>
        <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
        <span className="shrink-0 text-xs font-medium text-neutral-100">{summary.file}</span>
        <span className={BADGE_CLS}>{t('editor.source')} {clock(duration)}</span>
        <span className={BADGE_CLS}>{t('editor.exported')} {clock(exportedDurationSec(segments))}</span>
        <span className="ml-auto shrink-0 text-[10px] text-neutral-500">
          {trimMode ? t('editor.trimModeHint') : ''}
        </span>
      </div>

      {/* 播放器 */}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
        <video
          ref={videoRef as RefObject<HTMLVideoElement>}
          className="h-full w-full object-contain"
          src={mediaUrlFor(summary.filePath)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setNotice(t('editor.loadFail'))}
          onClick={togglePlay}
        />
        {/* 中央播放按钮（暂停时浮现，点击画面也可切换） */}
        {!playing && (
          <button
            className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors hover:bg-black/70"
            onClick={togglePlay}
            title={t('editor.play')}
          >
            <IconPlay className="ml-0.5 h-5 w-5" />
          </button>
        )}
      </div>

      {/* 播放控制行 */}
      <div className="flex items-center gap-2.5 px-1">
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 shadow ring-1 ring-white/40 transition-colors hover:bg-white"
          onClick={togglePlay}
          title={playing ? t('common.pause') : t('editor.play')}
        >
          {playing ? <IconPause className="h-3.5 w-3.5" /> : <IconPlay className="ml-0.5 h-3.5 w-3.5" />}
        </button>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-300">
          {clock(currentTime)}
        </span>
        <input
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-cyan-400"
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={Math.min(currentTime, duration)}
          onChange={(event) => seekTo(Number(event.target.value))}
        />
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">{clock(duration)}</span>
        <button className={`${BTN.idle} shrink-0 font-mono`} onClick={() => setRateIndex((rateIndex + 1) % RATES.length)}>
          {String(RATES[rateIndex])}x
        </button>
      </div>

      {/* 轨道轴 */}
      <div className="px-1">
        <TimelineTrack
          durationSec={duration}
          segments={segments}
          selection={selection}
          trimMode={trimMode}
          playheadSec={currentTime}
          pointA={pointA}
          pointB={pointB}
          onSeek={seekTo}
          onPickPoint={pickPoint}
          onMovePoint={movePoint}
        />
      </div>

      {/* 工具行 */}
      <div className="flex items-center gap-1.5 px-1" style={NO_DRAG_STYLE}>
        <button
          className={trimMode ? BTN.active : BTN.idle}
          onClick={() => {
            const next = !trimMode
            setTrimMode(next)
            setPointA(undefined)
            setPointB(undefined)
            setNotice(next ? t('editor.trimStartTip') : '')
          }}
        >
          <IconScissors className="h-3 w-3" />
          {t('editor.trim')}
        </button>
        <button className={BTN.idle} onClick={applySpeed} title={t('editor.speedTitle')}>
          <IconFast className="h-3 w-3" />
          {t('editor.speedSelection')}
        </button>
        <button className={BTN.idle} onClick={deleteSelection}>
          <IconTrash className="h-3 w-3" />
          {t('editor.deleteSelection')}
        </button>
        <button className={BTN.idle} onClick={undo}>
          <IconUndo className="h-3 w-3" />
          {t('editor.undo')}
        </button>
        <button
          className={`${BTN.danger} ml-auto ${exporting ? 'pointer-events-none opacity-60' : ''}`}
          disabled={exporting}
          onClick={runExport}
        >
          {exporting ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <IconExport className="h-3 w-3" />
          )}
          {exporting ? t('editor.exporting') : t('editor.exportMp4')}
        </button>
      </div>

      {notice.length > 0 && (
        <div className="px-1 pb-0.5">
          <div className={NOTICE_CLS}>
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            {notice}
          </div>
        </div>
      )}
    </div>
  )
}
