import type { JSX } from 'react'
import { useRef, useState } from 'react'
import {
  applySpeedToRange,
  exportedDurationSec,
  normalizeRange,
  removeRange
} from '../../../../core/editing/segment-ops'
import { mediaUrlFor } from '../../../../shared/media-url'
import type { EditProject, EditSegment, ExportSubtitleOptions, RecordingSummary } from '../../../../shared/types'
import { DRAG_STYLE, NO_DRAG_STYLE } from '../../drag-style'
import { useT } from '../../i18n'
import { useSubtitleProject } from '../../hooks/use-subtitle-project'
import {
  IconBack,
  IconExport,
  IconFast,
  IconScissors,
  IconTrash,
  IconUndo
} from '../icons'
import { BADGE_CLS, BTN, NOTICE_CLS } from '../../ui'
import { PlayerStage } from './PlayerStage'
import type { PlayerHandle } from './PlayerStage'
import { SubtitlesPanel } from './SubtitlesPanel'
import { SubtitleTrack } from './SubtitleTrack'
import { TimelineTrack } from './TimelineTrack'
import { WaveTrack } from './WaveTrack'

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

/** 加速档位（作用于选区，点击循环应用） */
const SPEED_STEPS: readonly number[] = [1.5, 2, 3, 4]
const ICON_CLS = 'h-3.5 w-3.5'

/** 内嵌播放器 + 三轨剪辑（视频/声音/字幕）+ 字幕编辑 + 导出 MP4 */
export const EditorView = (props: EditorViewProps): JSX.Element => {
  const { summary } = props
  const { t } = useT()
  const playerRef = useRef<PlayerHandle | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(0)
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
  const [subtitleSelectedId, setSubtitleSelectedId] = useState<string | undefined>(undefined)
  const [exportOptions, setExportOptions] = useState<ExportSubtitleOptions>({ burn: true, srtFile: true, softTrack: false })

  const subtitle = useSubtitleProject(summary, (file) => {
    // 工程加载/识别完成重载：恢复剪辑片段（用户尚未操作或以工程为准）
    setSegments(file.segments)
  })
  const cues = subtitle.state.cues

  const duration: number = Math.max(summary.durationSec, 0.001)
  const selection = pointA !== undefined && pointB !== undefined ? normalizeRange(pointA, pointB) : undefined

  const seekTo = (seconds: number): void => {
    playerRef.current?.seek(seconds)
    setCurrentTime(seconds)
  }

  /** 操作入栈（供撤销），应用新片段列表并同步工程保存 */
  const commitSegments = (next: readonly EditSegment[]): void => {
    setHistory((prev) => [...prev.slice(-19), segments])
    setSegments(next)
    subtitle.updateSegments(next)
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
    subtitle.updateSegments(last)
    setNotice(t('editor.undone'))
  }

  /** 字幕操作（cue-ops 封装在 hook 内，含工程保存） */
  const addCueAt = (seconds: number): void => {
    setSubtitleSelectedId(subtitle.cueActions.addAt(seconds, duration))
    setNotice(t('subtitle.addedAt'))
  }

  const retryTranscription = (): void => {
    void window.api
      .startTranscription(summary.dirPath, summary.file)
      .then((accepted: boolean) => {
        setNotice(accepted ? t('subtitle.transcribingQueued') : t('subtitle.none'))
      })
      .catch(() => setNotice(t('subtitle.failed', { msg: 'IPC' })))
  }

  const runExport = (): void => {
    if (segments.length === 0) {
      setNotice(t('editor.allDeleted'))
      return
    }
    const subtitleEnabled: boolean = exportOptions.burn || exportOptions.srtFile || exportOptions.softTrack
    setExporting(true)
    setNotice(t('editor.exporting'))
    const project: EditProject = {
      sourceFilePath: summary.filePath,
      durationSec: summary.durationSec,
      hasAudio: summary.hasAudio,
      segments,
      subtitles: subtitleEnabled
        ? { cues, style: subtitle.state.style, options: exportOptions }
        : undefined
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

  const handleClose = (): void => {
    subtitle.flush()
    props.onClose()
  }

  return (
    <div className="flex h-full w-full flex-col gap-2 rounded-2xl bg-neutral-900/90 p-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
      {/* 标题行（空白区域可拖动窗口） */}
      <div className="flex items-center gap-2 px-1" style={DRAG_STYLE}>
        <span style={NO_DRAG_STYLE}>
          <button className={`${BTN.ghost} h-7 w-7 !px-0`} onClick={handleClose} title={t('editor.back')}>
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

      {/* 播放器（含字幕叠加与控制行） */}
      <PlayerStage
        ref={playerRef}
        src={mediaUrlFor(summary.filePath)}
        durationSec={duration}
        cues={cues}
        style={subtitle.state.style}
        onTimeUpdate={setCurrentTime}
        onNotice={setNotice}
      />

      {/* 三轨时间轴：视频（标记行+片段轨）/ 声音（波形）/ 字幕（cue 块） */}
      <div className="flex flex-col gap-1 px-1">
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
        <WaveTrack
          durationSec={duration}
          waveform={subtitle.state.waveform}
          playheadSec={currentTime}
          onSeek={seekTo}
        />
        <SubtitleTrack
          durationSec={duration}
          cues={cues}
          selectedId={subtitleSelectedId}
          playheadSec={currentTime}
          onSeek={seekTo}
          onSelect={setSubtitleSelectedId}
          onMoveCue={(id, startSec, endSec) => subtitle.cueActions.move(id, startSec, endSec, duration)}
          onAddAt={addCueAt}
        />
      </div>

      {/* 字幕工作区（状态 + cue 编辑 + 样式 + 导出选项） */}
      <div className="px-1" style={NO_DRAG_STYLE}>
        <SubtitlesPanel
          asrStatus={subtitle.state.asrStatus}
          asrProgress={subtitle.state.asrProgress}
          asrError={subtitle.state.asrError}
          cues={cues}
          selectedId={subtitleSelectedId}
          style={subtitle.state.style}
          exportOptions={exportOptions}
          onSelect={setSubtitleSelectedId}
          onUpdateCueText={(id, text) => subtitle.cueActions.updateText(id, text)}
          onDeleteCue={(id) => {
            subtitle.cueActions.remove(id)
            setSubtitleSelectedId(undefined)
          }}
          onAddCue={() => addCueAt(currentTime)}
          onClearAll={() => {
            subtitle.cueActions.clearAll()
            setSubtitleSelectedId(undefined)
            setNotice(t('subtitle.cleared'))
          }}
          onRetry={retryTranscription}
          onStyleChange={subtitle.updateStyle}
          onExportOptionsChange={setExportOptions}
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
