import type { CSSProperties } from 'react'

/** 窗口拖动区（标题行等空白区域） */
export const DRAG_STYLE: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties

/** 窗口拖动豁免区（按钮、列表、轨道等交互控件） */
export const NO_DRAG_STYLE: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties
