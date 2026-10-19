import type { JSX } from 'react'
import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { NO_DRAG_STYLE } from '../drag-style'

/**
 * 四角拖拽缩放容器：透明窗口在 Windows 上无法使用系统边缘缩放，
 * 自实现四个角落热区（指针捕获拖拽，实时 IPC 设置窗口 bounds）。
 * 拖拽左/上角时同步移动窗口位置，保持对角固定。
 */

type Bounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type DragState = {
  readonly edge: Edge
  readonly startX: number
  readonly startY: number
  readonly bounds: Bounds
}

type Edge = 'nw' | 'ne' | 'sw' | 'se'

export type ResizableFrameProps = {
  readonly children: ReactNode
  /** 最小宽度（像素） */
  readonly minWidth: number
  /** 最小高度（像素） */
  readonly minHeight: number
}

/** 按拖拽方向计算新窗口 bounds（纯函数） */
export const computeResizedBounds = (
  start: DragState,
  pointerX: number,
  pointerY: number,
  minWidth: number,
  minHeight: number
): Bounds => {
  const dx: number = pointerX - start.startX
  const dy: number = pointerY - start.startY
  let { x, y, width, height } = start.bounds
  if (start.edge.includes('e')) {
    width = Math.max(minWidth, start.bounds.width + dx)
  }
  if (start.edge.includes('s')) {
    height = Math.max(minHeight, start.bounds.height + dy)
  }
  if (start.edge.includes('w')) {
    width = Math.max(minWidth, start.bounds.width - dx)
    x = start.bounds.x + (start.bounds.width - width)
  }
  if (start.edge.includes('n')) {
    height = Math.max(minHeight, start.bounds.height - dy)
    y = start.bounds.y + (start.bounds.height - height)
  }
  return { x, y, width, height }
}

const CORNER_CLS: Readonly<Record<Edge, string>> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  ne: 'right-0 top-0 cursor-nesw-resize',
  sw: 'bottom-0 left-0 cursor-nesw-resize',
  se: 'bottom-0 right-0 cursor-nwse-resize'
}

export const ResizableFrame = (props: ResizableFrameProps): JSX.Element => {
  const dragRef = useRef<DragState | undefined>(undefined)

  const onCornerDown = (edge: Edge) => (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      edge,
      startX: event.screenX,
      startY: event.screenY,
      bounds: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight }
    }
  }

  const onCornerMove = (edge: Edge) => (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === undefined || drag.edge !== edge || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }
    const next: Bounds = computeResizedBounds(drag, event.screenX, event.screenY, props.minWidth, props.minHeight)
    void window.api.setWindowBounds(next)
  }

  const onCornerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    dragRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="relative h-full w-full">
      {props.children}
      {(['nw', 'ne', 'sw', 'se'] as const).map((edge) => (
        <div
          key={edge}
          className={`absolute z-50 h-4 w-4 touch-none ${CORNER_CLS[edge]}`}
          style={NO_DRAG_STYLE}
          onPointerDown={onCornerDown(edge)}
          onPointerMove={onCornerMove(edge)}
          onPointerUp={onCornerUp}
        />
      ))}
    </div>
  )
}
