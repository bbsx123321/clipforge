import type { JSX } from 'react'
import { useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { clientXToSeconds, secondsToPct } from '../../../../core/editing/timeline-math'
import type { SubtitleCue } from '../../../../shared/types'
import { useT } from '../../i18n'

/**
 * 字幕轨：cue 块渲染 + 选中 + 拖动整块/左右边缘调整时间 + 双击空白在播放头处新建。
 * 拖动复用标记轨的 Pointer Capture 模式（按下捕获 → 移动持续回调 → 松开释放）。
 */
export type SubtitleTrackProps = {
  readonly durationSec: number
  readonly cues: readonly SubtitleCue[]
  readonly selectedId: string | undefined
  readonly playheadSec: number
  readonly onSeek: (seconds: number) => void
  readonly onSelect: (id: string | undefined) => void
  /** 拖动/调边后的新时间（由父级经 cue-ops 钳制并 touch 保存） */
  readonly onMoveCue: (id: string, startSec: number, endSec: number) => void
  /** 双击空白新建（seconds = 双击位置） */
  readonly onAddAt: (seconds: number) => void
}

/** 拖动会话状态：move = 整块平移（保留时长），left/right = 调整边界 */
type DragState = {
  readonly mode: 'move' | 'left' | 'right'
  readonly cueId: string
  readonly grabOffsetSec: number
  readonly cueStart: number
  readonly cueEnd: number
}

export const SubtitleTrack = (props: SubtitleTrackProps): JSX.Element => {
  const { durationSec, cues, selectedId, playheadSec, onSeek, onSelect, onMoveCue, onAddAt } = props
  const { t } = useT()
  const trackRef = useRef<HTMLDivElement | null>(null) as RefObject<HTMLDivElement | null>
  const [drag, setDrag] = useState<DragState | undefined>(undefined)

  const pct = (seconds: number): string => secondsToPct(seconds, durationSec)
  const toSeconds = (clientX: number): number =>
    clientXToSeconds(clientX, trackRef.current?.getBoundingClientRect(), durationSec)

  const handleLaneClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    // 点击空白：取消选中 + seek（cue 块自身的点击会 stopPropagation）
    onSelect(undefined)
    onSeek(toSeconds(event.clientX))
  }

  const handleLaneDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    onAddAt(toSeconds(event.clientX))
  }

  /** cue 块按下：区分整块拖动 / 边缘调界（左右 6px 热区） */
  const startDrag = (cue: SubtitleCue, mode: DragState['mode']) => (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(cue.id)
    setDrag({ mode, cueId: cue.id, grabOffsetSec: toSeconds(event.clientX) - cue.startSec, cueStart: cue.startSec, cueEnd: cue.endSec })
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag === undefined || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }
    const seconds: number = toSeconds(event.clientX)
    if (drag.mode === 'move') {
      const duration: number = drag.cueEnd - drag.cueStart
      const start: number = seconds - drag.grabOffsetSec
      onMoveCue(drag.cueId, start, start + duration)
      return
    }
    if (drag.mode === 'left') {
      onMoveCue(drag.cueId, seconds, drag.cueEnd)
      return
    }
    onMoveCue(drag.cueId, drag.cueStart, seconds)
  }

  const endDrag = (): void => {
    setDrag(undefined)
  }

  return (
    <div
      ref={trackRef}
      className="relative h-9 w-full touch-none overflow-hidden rounded-xl bg-neutral-800/70 ring-1 ring-white/10 select-none"
      onClick={handleLaneClick}
      onDoubleClick={handleLaneDoubleClick}
      title={t('subtitle.dragHint')}
    >
      {/* cue 块：选中高亮；左右边缘热区拖拽调时间 */}
      {cues.map((cue) => (
        <div
          key={cue.id}
          className={`absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md px-1.5 text-[10px] leading-6 whitespace-nowrap ${
            cue.id === selectedId
              ? 'bg-violet-500/85 ring-2 ring-violet-300 text-white z-[5]'
              : 'bg-violet-500/50 text-violet-50'
          }`}
          style={{ left: pct(cue.startSec), width: `calc(${pct(cue.endSec - cue.startSec)} - 2px)` }}
          onPointerDown={startDrag(cue, 'move')}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={startDrag(cue, 'left')} onPointerMove={moveDrag} onPointerUp={endDrag} />
          <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={startDrag(cue, 'right')} onPointerMove={moveDrag} onPointerUp={endDrag} />
          <span className="pointer-events-none block truncate">{cue.text.length > 0 ? cue.text : '…'}</span>
        </div>
      ))}

      {/* 播放头 */}
      <div className="pointer-events-none absolute top-0 bottom-0 z-10" style={{ left: pct(playheadSec) }}>
        <span className="absolute top-0 bottom-0 -left-px w-0.5 bg-white/90" />
      </div>
    </div>
  )
}
