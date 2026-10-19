import type { JSX } from 'react'
import { useT } from '../i18n'

/** hash 中解析出的区域参数（逻辑像素位置尺寸 + 物理分辨率角标） */
type RegionFrameParams = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly physicalWidth: number
  readonly physicalHeight: number
}

/** 从 hash 解析区域参数（纯函数）：#/region-frame?x=..&y=..&w=..&h=..&pw=..&ph=.. */
export const parseRegionFrameParams = (hash: string): RegionFrameParams => {
  const query = hash.split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  const num = (key: string): number => Number(params.get(key) ?? 0)
  return {
    x: num('x'),
    y: num('y'),
    width: num('w'),
    height: num('h'),
    physicalWidth: num('pw'),
    physicalHeight: num('ph')
  }
}

/** 描边宽度（像素）：边框画在选区外侧，不占用捕获区域内的像素 */
const STROKE_PX: number = 3

/**
 * 录制区域红色描边覆盖层：点击穿透、置顶、透明。
 * 关键设计：边框矩形相对选区外扩 STROKE_PX——描边线完全落在选区矩形之外，
 * 而 ddagrab 只捕获选区内部，因此录出的视频绝无红线（纯几何保证，
 * 不依赖 SetWindowDisplayAffinity——它对透明窗口会静默失效）。
 */
export const RegionFrameOverlay = (): JSX.Element => {
  const { t } = useT()
  const rect = parseRegionFrameParams(window.location.hash)
  return (
    <div className="h-full w-full select-none bg-transparent">
      <div
        className="absolute border-red-500 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        style={{
          left: rect.x - STROKE_PX,
          top: rect.y - STROKE_PX,
          width: rect.width + STROKE_PX * 2,
          height: rect.height + STROKE_PX * 2,
          borderWidth: STROKE_PX
        }}
      >
        <span className="absolute -top-6 right-0 whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-white shadow">
          {t('regionFrame.label', { w: rect.physicalWidth, h: rect.physicalHeight })}
        </span>
        {/* 四角加粗标记（同样落在选区外侧） */}
        <span className="absolute -left-[2px] -top-[2px] h-3 w-3 border-l-[3px] border-t-[3px] border-red-400" />
        <span className="absolute -right-[2px] -top-[2px] h-3 w-3 border-r-[3px] border-t-[3px] border-red-400" />
        <span className="absolute -bottom-[2px] -left-[2px] h-3 w-3 border-b-[3px] border-l-[3px] border-red-400" />
        <span className="absolute -bottom-[2px] -right-[2px] h-3 w-3 border-b-[3px] border-r-[3px] border-red-400" />
      </div>
    </div>
  )
}
