import type { JSX } from 'react'
import { useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { EditSegment } from '../../../../shared/types'
import { calculateTicks, clientXToSeconds, formatTick, secondsToPct } from '../../../../core/editing/timeline-math'
import { useT } from '../../i18n'

/** 轨道轴属性 */
export type TimelineTrackProps = {
  readonly durationSec: number
  readonly segments: readonly EditSegment[]
  /** 当前选区（源时间秒），无选区为 undefined */
  readonly selection: readonly [number, number] | undefined
  /** 选区模式：点击拾取起点/终点；非选区模式：点击为播放头 seek */
  readonly trimMode: boolean
  readonly playheadSec: number
  /** 裁剪标记（起点/终点，秒；未放置为 undefined） */
  readonly pointA: number | undefined
  readonly pointB: number | undefined
  readonly onSeek: (seconds: number) => void
  readonly onPickPoint: (seconds: number) => void
  /** 拖动标记回调（拖动微调裁剪边界） */
  readonly onMovePoint: (which: 'a' | 'b', seconds: number) => void
}

/** 时间轴轨道：可拖动「开始/结束」标记 + 时间刻度 + 片段块 + 选区 + 播放头 */
export const TimelineTrack = (props: TimelineTrackProps): JSX.Element => {
  const { durationSec, segments, selection, trimMode, playheadSec, pointA, pointB, onSeek, onPickPoint, onMovePoint } = props
  const { t } = useT()
  const trackRef = useRef<HTMLDivElement | null>(null) as RefObject<HTMLDivElement | null>
  const ticks = calculateTicks(durationSec)

  const pct = (seconds: number): string => secondsToPct(seconds, durationSec)

  /** 容器内横向坐标 → 秒 */
  const toSeconds = (clientX: number): number =>
    clientXToSeconds(clientX, trackRef.current?.getBoundingClientRect(), durationSec)

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const seconds = toSeconds(event.clientX)
    if (trimMode) {
      onPickPoint(seconds)
    } else {
      onSeek(seconds)
    }
  }

  /** 标记按下 → 捕获指针开始拖动；移动中持续回调；松开自动释放捕获 */
  const handleMarkerDrag = (which: 'a' | 'b') => (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onMovePoint(which, toSeconds(event.clientX))
  }
  const handleMarkerMove = (which: 'a' | 'b') => (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.stopPropagation()
      onMovePoint(which, toSeconds(event.clientX))
    }
  }

  const marker = (which: 'a' | 'b', seconds: number | undefined, label: string): JSX.Element | undefined => {
    if (seconds === undefined) {
      return undefined
    }
    return (
      <div
        className="absolute top-0 z-20 flex -translate-x-1/2 cursor-ew-resize flex-col items-center touch-none"
        style={{ left: pct(seconds) }}
        onPointerDown={handleMarkerDrag(which)}
        onPointerMove={handleMarkerMove(which)}
      >
        <span className="whitespace-nowrap rounded-full bg-cyan-400 px-2 py-[1px] text-[10px] font-semibold text-neutral-900 shadow-md shadow-cyan-500/30">
          {label}
        </span>
        <span className="-mt-px text-[9px] leading-none text-cyan-400 drop-shadow">▼</span>
      </div>
    )
  }

  return (
    <div className="w-full select-none" ref={trackRef}>
      {/* 标记行（开始/结束 标签，可拖动） */}
      <div className="relative mb-1 h-5">
        {marker('a', pointA, t('timeline.start'))}
        {marker('b', pointB, t('timeline.end'))}
      </div>

      {/* 轨道本体 */}
      <div
        className={`relative h-11 w-full overflow-hidden rounded-xl bg-neutral-800/70 ring-1 ring-white/10 ${
          trimMode ? 'cursor-crosshair' : 'cursor-pointer'
        }`}
        onClick={handleClick}
      >
        {/* 时间刻度线（主刻度贯穿轨道） */}
        <div className="pointer-events-none absolute inset-0">
          {ticks.map((tick) => (
            <span
              key={String(tick)}
              className="absolute top-0 bottom-0 w-px bg-white/[0.07]"
              style={{ left: pct(tick) }}
            />
          ))}
        </div>

        {/* 片段块：变速段橙色并标注倍速 */}
        {segments.map((segment, index) => (
          <div
            key={`${String(segment.startSec)}-${String(index)}`}
            className={`absolute top-1.5 bottom-1.5 overflow-hidden rounded-md ${
              segment.speed !== 1
                ? 'bg-gradient-to-b from-amber-400/80 to-amber-600/80 shadow-sm shadow-amber-500/20'
                : 'bg-gradient-to-b from-cyan-500/50 to-cyan-700/50'
            }`}
            style={{ left: pct(segment.startSec), width: pct(segment.endSec - segment.startSec) }}
          >
            {segment.speed !== 1 && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow">
                {String(segment.speed)}x
              </span>
            )}
          </div>
        ))}

        {/* 选区覆盖（带边界把手） */}
        {selection !== undefined && (
          <div
            className="absolute top-0 bottom-0 border-x-2 border-cyan-300/90 bg-cyan-300/15"
            style={{ left: pct(selection[0]), width: pct(selection[1] - selection[0]) }}
          >
            <span className="absolute -left-[3px] top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-cyan-300" />
            <span className="absolute -right-[3px] top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-cyan-300" />
          </div>
        )}

        {/* 播放头（圆头把手 + 细线） */}
        <div className="pointer-events-none absolute top-0 bottom-0 z-10" style={{ left: pct(playheadSec) }}>
          <span className="absolute top-0 bottom-0 -left-px w-0.5 bg-white/90" />
          <span className="absolute -top-0.5 -left-[5px] h-2.5 w-2.5 rounded-full bg-white shadow ring-2 ring-neutral-900" />
        </div>
      </div>

      {/* 刻度文字行（首尾对齐边缘，中间居中） */}
      <div className="relative mt-1 h-3">
        {ticks.map((tick, index) => {
          const isFirst = index === 0
          const isLast = index === ticks.length - 1
          return (
            <span
              key={`label-${String(tick)}`}
              className={`absolute top-0 font-mono text-[9px] tabular-nums text-neutral-500 ${
                isFirst || isLast ? '' : '-translate-x-1/2'
              }`}
              style={isFirst ? { left: 0 } : isLast ? { right: 0 } : { left: pct(tick) }}
            >
              {formatTick(tick)}
            </span>
          )
        })}
      </div>
    </div>
  )
}
