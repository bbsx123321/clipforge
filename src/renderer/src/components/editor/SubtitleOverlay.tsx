import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { cuesAtTime } from '../../../../core/subtitles/cue-ops'
import type { SubtitleCue, SubtitleStyle } from '../../../../shared/types'

/**
 * 播放器字幕叠加层：按字幕样式渲染当前时刻的 cue 文本。
 * 样式参数与烧录（ASS）同一语义（相对视频画面百分比），预览即所得：
 * 先按视频宽高比把容器内 letterbox 的实际显示区域算出来，再在其内定位。
 */
export type SubtitleOverlayProps = {
  readonly cues: readonly SubtitleCue[]
  readonly style: SubtitleStyle
  readonly currentTime: number
  /** 视频原始尺寸（onLoadedMetadata 读取；0 = 未知，回退 16:9） */
  readonly videoWidth: number
  readonly videoHeight: number
}

export const SubtitleOverlay = (props: SubtitleOverlayProps): JSX.Element => {
  const { cues, style, currentTime, videoWidth, videoHeight } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<{ readonly w: number; readonly h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const element = containerRef.current
    if (element === null) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) {
        setBox({ w: entry.contentRect.width, h: entry.contentRect.height })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const active: readonly SubtitleCue[] = cuesAtTime(cues, currentTime)
  if (active.length === 0) {
    return <div ref={containerRef} className="pointer-events-none absolute inset-0" />
  }

  // letterbox 内的视频实际显示区域（与 object-contain 一致）
  const aspect: number = videoWidth > 0 && videoHeight > 0 ? videoWidth / videoHeight : 16 / 9
  const boxAspect: number = box.w > 0 && box.h > 0 ? box.w / box.h : aspect
  const displayW: number = boxAspect > aspect ? box.h * aspect : box.w
  const displayH: number = displayW / aspect
  const offsetX: number = (box.w - displayW) / 2
  const offsetY: number = (box.h - displayH) / 2

  const fontSizePx: number = (style.fontSizePct / 100) * displayH
  const marginPx: number = (style.marginPct / 100) * displayH
  const textColor: string = `rgba(255, 255, 255, ${String(Math.min(1, Math.max(0, style.textOpacity)))})`
  const boxBg: string = style.boxEnabled
    ? `rgba(0, 0, 0, ${String(Math.min(1, Math.max(0, style.boxOpacity)))})`
    : 'transparent'

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      <div
        className="absolute flex w-full flex-col items-center gap-1"
        style={{
          left: `${String(offsetId(offsetX))}px`,
          top: `${String(offsetId(offsetY))}px`,
          width: `${String(Math.max(0, displayW))}px`,
          height: `${String(Math.max(0, displayH))}px`,
          justifyContent: style.position === 'top' ? 'flex-start' : 'flex-end',
          paddingTop: style.position === 'top' ? `${String(Math.max(0, marginPx))}px` : undefined,
          paddingBottom: style.position === 'bottom' ? `${String(Math.max(0, marginPx))}px` : undefined
        }}
      >
        {active.map((cue) => (
          <span
            key={cue.id}
            className="max-w-[92%] rounded-md text-center leading-snug font-medium"
            style={{
              fontSize: `${String(Math.max(10, fontSizePx))}px`,
              color: textColor,
              backgroundColor: boxBg,
              padding: boxBg !== 'transparent' ? '0.25em 0.6em' : '0.25em 0.4em',
              textShadow: boxBg !== 'transparent' ? undefined : '0 1px 3px rgba(0,0,0,0.9)',
              wordBreak: 'break-word'
            }}
          >
            {cue.text}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 负零保护（-0 序列化成字符串会带负号） */
const offsetId = (value: number): number => (Object.is(value, -0) ? 0 : value)
