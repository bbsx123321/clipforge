import type { JSX } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { RegionRect } from '../../../shared/types'
import { useT } from '../i18n'

type Point = {
  readonly x: number
  readonly y: number
}

const MIN_RECT_SIZE: number = 8

/** 从 hash 读取显示器缩放比（主进程在打开覆盖层时注入） */
export const parseScaleFactor = (hash: string): number => {
  const match = /overlay\?scale=([0-9.]+)/.exec(hash)
  const raw = match?.[1]
  const value = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(value) && value > 0 ? value : 1
}

/** 两点归一化为正矩形（纯函数） */
export const normalizeRect = (a: Point, b: Point): RegionRect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y)
})

/** 区域选区覆盖层：全屏透明遮罩，拖拽画框，Esc 取消 */
export const OverlayPicker = (): JSX.Element => {
  const { t } = useT()
  const scaleFactor = useMemo(() => parseScaleFactor(window.location.hash), [])
  const [start, setStart] = useState<Point | undefined>(undefined)
  const [current, setCurrent] = useState<Point | undefined>(undefined)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        window.api.cancelRegionPicker()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const rect =
    start !== undefined && current !== undefined ? normalizeRect(start, current) : undefined

  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const point: Point = { x: event.clientX, y: event.clientY }
    setStart(point)
    setCurrent(point)
  }

  const onMouseMove = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (start === undefined) {
      return
    }
    setCurrent({ x: event.clientX, y: event.clientY })
  }

  const onMouseUp = (): void => {
    if (rect !== undefined && rect.width >= MIN_RECT_SIZE && rect.height >= MIN_RECT_SIZE) {
      // 逻辑像素 → 物理像素（ddagrab 输出物理分辨率；M1 仅支持主显示器选区）
      window.api.sendRegionSelected({
        x: Math.round(rect.x * scaleFactor),
        y: Math.round(rect.y * scaleFactor),
        width: Math.round(rect.width * scaleFactor),
        height: Math.round(rect.height * scaleFactor)
      })
    }
    setStart(undefined)
    setCurrent(undefined)
  }

  return (
    <div
      className="h-full w-full cursor-crosshair select-none bg-cyan-300/5"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {rect !== undefined && (
        <div
          className="absolute border-2 border-cyan-400 bg-cyan-400/10"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-6 text-center text-sm text-cyan-200/90">
        {t('overlay.regionHint')}
      </div>
    </div>
  )
}
