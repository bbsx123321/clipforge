import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { WindowProbe } from '../../../shared/types'
import { useT } from '../i18n'

/**
 * 窗口捕获选择覆盖层：全屏半透明遮罩，鼠标移动时主进程探查光标下的顶层窗口，
 * 红色描边实时包裹该窗口；点击确认捕获，Esc 取消。
 * 窗口矩形为「所属显示器内物理像素」，显示时按缩放比换算回逻辑像素。
 */

/** 从 hash 读取显示器缩放比 */
const parseScaleFactor = (hash: string): number => {
  const match = /window\?scale=([0-9.]+)/.exec(hash)
  const raw = match?.[1]
  const value = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(value) && value > 0 ? value : 1
}

/** hover 探查节流间隔 */
const PROBE_INTERVAL_MS: number = 90

export const WindowPickerOverlay = (): JSX.Element => {
  const { t } = useT()
  const scaleFactor = useMemo(() => parseScaleFactor(window.location.hash), [])
  const [probe, setProbe] = useState<WindowProbe | undefined>(undefined)
  const [tried, setTried] = useState<boolean>(false)
  const probingRef = useRef<boolean>(false)

  // Esc 取消
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        window.api.cancelWindowPicker()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // 鼠标移动 → 节流探查光标下窗口（探查本身在主进程完成，含全局物理坐标换算）
  const handleMouseMove = (): void => {
    if (probingRef.current) {
      return
    }
    probingRef.current = true
    window.setTimeout(() => {
      void window.api
        .probeWindowAtCursor()
        .then((next) => setProbe(next))
        .catch(() => undefined)
        .finally(() => {
          probingRef.current = false
        })
    }, PROBE_INTERVAL_MS)
  }

  const handleClick = (_event: ReactMouseEvent<HTMLDivElement>): void => {
    void window.api.pickWindowAtCursor().then((picked) => {
      if (picked === undefined) {
        setProbe(undefined)
      }
    })
  }

  const frame = probe !== undefined
    ? {
        left: probe.rect.x / scaleFactor,
        top: probe.rect.y / scaleFactor,
        width: probe.rect.width / scaleFactor,
        height: probe.rect.height / scaleFactor
      }
    : undefined

  return (
    <div
      className="h-full w-full cursor-crosshair select-none bg-black/25"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      {frame !== undefined && (
        <div
          className="absolute border-[3px] border-red-500 bg-red-500/5 shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
          style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
        >
          <span className="absolute -top-7 left-0 max-w-full truncate whitespace-nowrap rounded bg-red-500 px-2 py-0.5 text-[11px] font-medium text-white shadow">
            {probe?.title ?? ''}
          </span>
          <span className="absolute -bottom-6 right-0 whitespace-nowrap rounded bg-red-500/90 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white">
            {String(probe?.rect.width ?? 0)}×{String(probe?.rect.height ?? 0)}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-5 text-center text-sm font-medium text-white/90 drop-shadow">
        {t('overlay.windowHint')}
      </div>
      {tried && probe === undefined && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-xs text-white/60 drop-shadow">
          {t('overlay.windowNone')}
        </div>
      )}
    </div>
  )
}
