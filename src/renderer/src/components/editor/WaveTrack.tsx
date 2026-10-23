import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { clientXToSeconds, secondsToPct } from '../../../../core/editing/timeline-math'
import { useT } from '../../i18n'

/**
 * 声音轨：混音轨波形峰值（主进程预计算，每 0.1s 一点）+ 播放头 + 点击 seek。
 * 空波形（无音轨/未生成）显示占位文本。
 */
export type WaveTrackProps = {
  readonly durationSec: number
  readonly waveform: readonly number[]
  readonly playheadSec: number
  readonly onSeek: (seconds: number) => void
}

export const WaveTrack = (props: WaveTrackProps): JSX.Element => {
  const { durationSec, waveform, playheadSec, onSeek } = props
  const { t } = useT()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [width, setWidth] = useState<number>(0)

  // 容器宽度变化时重画（ResizeObserver 首测 + 窗口缩放）
  useEffect(() => {
    const element = containerRef.current
    if (element === null) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // 波形绘制：水平中轴对称的峰值条
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || width <= 0) {
      return
    }
    const dpr: number = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
    const height: number = 28
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')
    if (ctx === undefined || ctx === null) {
      return
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (waveform.length === 0) {
      return
    }
    const points: readonly number[] = waveform
    const mid: number = height / 2
    ctx.fillStyle = 'rgba(56, 189, 248, 0.55)'
    for (let x = 0; x < width; x += 1) {
      const index: number = Math.min(points.length - 1, Math.floor((x / width) * points.length))
      const peak: number = Math.max(points[index] ?? 0, 0.02)
      const barHalf: number = Math.max(0.75, peak * (height / 2 - 1))
      ctx.fillRect(x, mid - barHalf, 1, barHalf * 2)
    }
  }, [waveform, width])

  return (
    <div
      ref={containerRef}
      className="relative h-8 w-full cursor-pointer overflow-hidden rounded-xl bg-neutral-800/70 ring-1 ring-white/10"
      onClick={(event) => {
        onSeek(clientXToSeconds(event.clientX, containerRef.current?.getBoundingClientRect(), durationSec))
      }}
      title={t('subtitle.audioTrack')}
    >
      {waveform.length === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-500">
          {t('subtitle.audioTrack')}
        </span>
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      )}
      {/* 播放头细线（与视频轨视觉统一） */}
      <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: secondsToPct(playheadSec, durationSec) }}>
        <span className="absolute top-0 bottom-0 -left-px w-0.5 bg-white/90" />
      </div>
    </div>
  )
}
